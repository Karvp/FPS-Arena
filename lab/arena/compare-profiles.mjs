#!/usr/bin/env node
// Parameter sweep with a different held-out validation seed. Never edits extension defaults.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const args=process.argv.slice(2);
const value=(k,v)=>{const i=args.indexOf('--'+k);return i<0?v:args[i+1]};
const secs=Number(value('seconds','35'));
const episodes=Number(value('episodes','2'));
const bots=Number(value('bots','6'));
const profiles=String(value('profiles','baseline,aggressive,balanced,survival')).split(',');
const trainSeed=Number(value('train-seed','20261010'));
const holdSeed=Number(value('holdout-seed','8362402'));
if(trainSeed===holdSeed)throw Error('Training/holdout seeds must differ');
const dir=path.join(root,'reports','arena-runs');mkdirSync(dir,{recursive:true});
const reuse=args.includes('--reuse');
function run(profile,phase,seed){
 const out=path.join(dir,`${phase}-${profile}.json`);
 if(reuse){return JSON.parse(readFileSync(out,'utf8'));}
 const child=spawnSync(process.execPath,[path.join(here,'train.mjs'),'--profile',profile,'--seconds',String(secs),
  '--episodes',String(episodes),'--bots',String(bots),'--seed',String(seed),'--out',out],
  {encoding:'utf8',timeout:180000});
 if(child.status!==0)throw Error(`${phase}/${profile} failed:\n${(child.stderr||'').slice(-2000)}`);
 process.stdout.write(child.stdout.split('\n').filter(s=>/seed=/.test(s)).map(x=>`[${phase}/${profile}] ${x}`).join('\n')+'\n');
 return JSON.parse(readFileSync(out,'utf8'));
}
function score(result){
 // Scores are heuristic reward-shaping, NOT game win rates or live headshot claims.
 // Equal mode weights, per-episode averages, no unearned reward for headshot % if no hits.
 const weights={tdm:1,snd:1,hp:1,br:1,zm:1};
 return result.results.reduce((sum,r)=>{
  const uptime=r.duration?Math.min(1,r.duration/secs):0;
  const killRate=r.kills/Math.max(10,r.duration)*30;
  const hitRate=r.shots?r.hits/r.shots:0;
  const battleActivity=Math.min(1,r.shots/Math.max(3,r.duration)*3);
  const survival=r.alive?1:0;
  const movement=Math.min(1,r.distance/Math.max(1,r.duration)/5);
  const objectives=r.mode==='br'?(r.heliTicks<120&&r.distance>60?1:0):r.mode==='zm'?Math.min(1,r.zombieKills/8):0;
  return sum+weights[r.mode]*(killRate*.25+hitRate*.28+battleActivity*.12+survival*.17+movement*.08+uptime*.04+objectives*.06-r.errors*.25);
 },0)/result.results.length;
}
const train=[];
for(const p of profiles){const r=run(p,'train',trainSeed);train.push({profile:p,score:+score(r).toFixed(4),result:r});}
train.sort((a,b)=>b.score-a.score);
// Held-out data is evaluated on ALL profiles, not only the apparent training winner.
const hold=[];
for(const p of profiles){const r=run(p,'holdout',holdSeed);hold.push({profile:p,score:+score(r).toFixed(4),result:r});}
hold.sort((a,b)=>b.score-a.score);
const baseline=hold.find(x=>x.profile==='baseline');
const winner=hold[0];
const stable=winner.profile===train[0].profile&&winner.profile!=='baseline'&&winner.score>(baseline?.score||0)*1.05;
const recommendation=stable?winner.profile:'baseline';
const report={format:'fpsarena-profile-comparison-v1',generated:new Date().toISOString(),seconds:secs,episodes,
 gameBots:bots,trainSeed,holdoutSeed:holdSeed,scoreDescription:'heuristic training reward combining kills/hits/survival/activity/mobility on server game, NOT win rate',
 training:train.map(x=>({profile:x.profile,score:x.score,aggregate:x.result.aggregate})),
 holdout:hold.map(x=>({profile:x.profile,score:x.score,aggregate:x.result.aggregate})),
 recommendedProfile:recommendation,reason:stable?'Same candidate won training and held-out seed by over 5%.':'Insufficient validation to replace the baseline.',
 notes:['Only tested against current FPS Arena BotBrain and native zombie AI. Real players are not limited to these behaviors.',
 'This is a grid search on predefined configurations; no learned neural policy or transfer claim.']};
writeFileSync(path.join(root,'reports','ARENA_PROFILE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# FPS Arena — Headless Full-Match Training','',`Training seed: ${trainSeed}; independent holdout seed: ${holdSeed}; ${episodes} episodes per mode per profile; ${secs}s max per episode.`,
 '',`Suggested profile: **${recommendation}**. ${report.reason}`,'','## Train/holdout scores (heuristic, not win rate)',
 '','| Profile | Train | Holdout |','|---|---:|---:|',
 ...profiles.map(p=>`| ${p} | ${train.find(x=>x.profile===p)?.score.toFixed(4)} | ${hold.find(x=>x.profile===p)?.score.toFixed(4)} |`),
 '','## Interpretation','','The simulator imports the real `server/game.js`, `server/bot.js`, modes, maps and shared systems. The bundled extension script modifies a real headless client input surface. Those inputs are validated by `Game.queueInput()` and executed by the official `Game.step()` physics and combat.',
 '','This supports regression analysis of movement, avoidance, target selection, reload, pickup, team behavior and BR ring decisions. It does not establish a skill level versus unrestricted human players.',
 '','No global extension default was changed based only on this search. Confirm on real-match recordings before enabling a candidate profile.', ''];
writeFileSync(path.join(root,'reports','ARENA_PROFILE_COMPARISON.md'),lines.join('\n'));
console.log(JSON.stringify({recommendedProfile:recommendation,trainTop:train[0].profile,holdTop:winner.profile}));
