#!/usr/bin/env node
// Reproducible held-out, common-seed match comparisons. Not causal labels for options.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profiles=['release','director-engagement-recovery-lab','director-engagement-coverage-lab'];
const cases=[{map:'arena',weapon:'mp5sd',seed:628001},{map:'foundry',weapon:'benelli_m4',seed:738101},{map:'neon',weapon:'akm',seed:849201}];
const arg=(name,def)=>{const n=process.argv.indexOf('--'+name);return n<0?def:process.argv[n+1];};
const episodes=Number(arg('episodes','6')),seconds=Number(arg('seconds','65'));
const resume=process.argv.includes('--resume');
const reuseValid=process.argv.includes('--reuse-valid');
if(!Number.isInteger(episodes)||episodes<1||episodes>50||!Number.isFinite(seconds)||seconds<2||seconds>1200)throw Error('Invalid C4 settings');
const dir=path.resolve(arg('out-dir',path.join(root,'reports','c4-study')));mkdirSync(dir,{recursive:true});
const matrix=[];
for(const s of cases)for(const profile of profiles){
 const output=path.join(dir,`${s.map}-${s.weapon}-${profile}.json`);
 const args=['lab/arena/train.mjs','--profile',profile,'--modes','tdm','--seconds',String(seconds),'--episodes',String(episodes),
  '--seed',String(s.seed),'--classic-maps',s.map,'--bots','5','--opponents','stress',
  '--trainee-primary',s.weapon,'--lag-ms','65','--out',output];
 if(!resume||!existsSync(output)){
  const p=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:5*1024*1024});
  if(p.status!==0)throw Error(`Study failed ${s.map}/${profile}: ${p.stdout}\n${p.stderr}`);
 }
 const doc=JSON.parse(readFileSync(output,'utf8'));
 if(doc.results.length!==episodes||doc.profile!==profile||doc.seconds!==seconds||doc.seed!==s.seed||doc.traineePrimary!==s.weapon||doc.results.some(m=>m.errors))throw Error('Incomplete study '+output);
 for(const match of doc.results)matrix.push({...match,profile});
 process.stdout.write(`${s.map} / ${s.weapon} / ${profile}: ${doc.aggregate.kills} kills, ${doc.aggregate.agentErrors} errors\n`);
}
const rows=[];
for(const s of cases)for(let i=0;i<episodes;i++){
 const seed=s.seed+i*101;
 const group=matrix.filter(m=>m.seed===seed&&m.map===s.map&&m.primaryLoadout===s.weapon);
 if(group.length!==profiles.length)throw Error('Unmatched seed '+seed);
 const as=Object.fromEntries(group.map(g=>[g.profile,{kills:g.kills,deaths:g.deaths,shots:g.shots,hits:g.hits,
  damageTaken:g.damageTaken,damageDealt:g.damageDealt,duration:g.duration,
  plans:g.directorPlanSelectionCount,windows:g.directorOutcomeWindows?.length??0,
  completeWindows:(g.directorOutcomeWindows||[]).filter(w=>w.horizonComplete).length}]));
 rows.push({map:s.map,weapon:s.weapon,seed,profiles:as});
}
const summary={};
for(const compared of profiles.slice(1)){
 const pairs=rows.map(r=>({kills:r.profiles[compared].kills-r.profiles.release.kills,
  deaths:r.profiles[compared].deaths-r.profiles.release.deaths,
  shots:r.profiles[compared].shots-r.profiles.release.shots}));
 const sum=key=>pairs.reduce((s,p)=>s+p[key],0);
 const changes=pairs.map(x=>x.kills).filter(Boolean);
 const favorable=changes.filter(x=>x>0).length,unfavorable=changes.filter(x=>x<0).length;
 let pValue=1;
 if(changes.length){const n=changes.length,choose=(n,k)=>{let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return v;};
  let tail=0;for(let k=0;k<=Math.min(favorable,unfavorable);k++)tail+=choose(n,k);
  pValue=Math.min(1,2*tail/(2**n));}
 summary[compared]={totalKillDelta:sum('kills'),totalDeathDelta:sum('deaths'),totalShotDelta:sum('shots'),
  improved:favorable,worsened:unfavorable,unchanged:pairs.length-favorable-unfavorable,
  exactTwoSidedSignP:+pValue.toFixed(5),matchedMatches:pairs.length,
  executedPlans:rows.reduce((s,r)=>s+r.profiles[compared].plans,0),
  completeFiveSecondWindows:rows.reduce((s,r)=>s+r.profiles[compared].completeWindows,0)};
}
const report={format:'fpsarena-v2911-c4-paired-heldout-v2',profiles,scenarios:cases,
 episodesPerScenario:episodes,secondsPerMatch:seconds,studyType:'fixed-duration seed-paired simulation',
 causalCaveat:'Whole-match paired results are not per-option causal estimates. Prior seed tuning and repeated trials can bias generalization.',
 summary,rows};
const out=path.join(dir,'paired-summary.json');writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log('Saved '+out);console.log(JSON.stringify(summary,null,2));
