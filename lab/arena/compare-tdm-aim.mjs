#!/usr/bin/env node
// Reproducible full-match paired comparison. Baseline means the v2.7.5
// rewind-aligned TDM aim; legacy-aim is the v2.7.4 65ms lead policy.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const argv=process.argv.slice(2);
const arg=(name,def)=>{const i=argv.indexOf('--'+name);return i<0?def:argv[i+1];};
const opts={seed:Number(arg('seed',991245)),episodes:Number(arg('episodes',3)),seconds:Number(arg('seconds',600)),
  bots:Number(arg('bots',8)),lag:Number(arg('lag-ms',65)),opponents:arg('opponents','stress'),maps:arg('classic-maps','foundry,neon,arena')};
const out=path.resolve(arg('out',path.join(root,'reports','TDM_AIM_COMPARISON.json')));
if(!Number.isInteger(opts.seed)||!Number.isInteger(opts.episodes)||opts.episodes<1||opts.episodes>30||
   !Number.isFinite(opts.lag)||opts.lag<0||opts.lag>220||!['official','mixed','stress'].includes(opts.opponents))throw Error('Invalid comparison config');
const summarize=x=>({matches:x.results.length,finished:x.results.filter(r=>r.finishedNaturally).length,
  kills:x.aggregate.kills,deaths:x.aggregate.deaths,shots:x.aggregate.shots,hits:x.aggregate.hits,
  headHits:x.aggregate.headHits,accuracy:x.aggregate.accuracy,headshotOfHits:x.aggregate.headshotOfHits,
  extensionErrors:x.aggregate.agentErrors});
const results={};mkdirSync(path.dirname(out),{recursive:true});
for(const profile of ['legacy-aim','baseline']){
  const file=out.replace(/\.json$/,`-${profile}.json`);
  const cmd=[path.join(root,'lab/arena/train.mjs'),'--modes','tdm','--full-match','--seconds',String(opts.seconds),
    '--episodes',String(opts.episodes),'--seed',String(opts.seed),'--bots',String(opts.bots),
    '--lag-ms',String(opts.lag),'--opponents',opts.opponents,'--classic-maps',opts.maps,'--profile',profile,'--out',file];
  const p=spawnSync(process.execPath,cmd,{encoding:'utf8',timeout:240000,maxBuffer:1024*1024});
  if(p.status!==0)throw Error(`${profile} exited ${p.status}: ${(p.stderr||p.error?.message||'').slice(-1500)}`);
  results[profile]=JSON.parse(readFileSync(file,'utf8'));
  process.stdout.write(p.stdout);
}
const old=results['legacy-aim'],now=results.baseline;
const report={format:'fpsarena-tdm-paired-full-match-v1',opts,
  baselineV274:summarize(old),candidateV275:summarize(now),
  matchedSeeds:old.results.map((x,i)=>({seed:x.seed,map:x.map,old:{kills:x.kills,deaths:x.deaths,shots:x.shots,hits:x.hits,headHits:x.headHits,duration:x.duration},
    current:{kills:now.results[i].kills,deaths:now.results[i].deaths,shots:now.results[i].shots,hits:now.results[i].hits,headHits:now.results[i].headHits,duration:now.results[i].duration}})),
  limitations:['Paired seed does not force identical opponent trajectories after agent decisions diverge.',
    'TDM runs until the authoritative server ends the match; 600s is a maximum guard.',
    'HeadshotOfHits is not the fraction of all fired bullets; results are not real-human multiplayer statistics.']};
writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(`Paired report: ${out}`);
