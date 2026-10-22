#!/usr/bin/env node
// Locked, deterministic C25 cohort. No policy or game RNG changes.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {C25_ENDPOINT,validateC25,evaluateC25} from './evaluate-threat-calibration-c25.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const arg=(name,df)=>{const i=process.argv.indexOf('--'+name);return i===-1?df:process.argv[i+1];};
const seconds=Number(arg('seconds','75')),baseSeed=Number(arg('base-seed','25025000')),workers=Number(arg('workers','3'));
if(!Number.isInteger(seconds)||seconds<10||seconds>600||!Number.isSafeInteger(baseSeed)||baseSeed<0||baseSeed>0xffffffff-10000||!Number.isInteger(workers)||workers<1||workers>6)throw Error('C25 bad study config');
const strata=[['arena','mp5sd'],['arena','hk_sl8'],['foundry','m4a1'],['foundry','aa12'],['neon','m4a1'],['neon','mp5sd']];
const paths=['lab/arena/train-main.mjs','lab/arena/run-threat-calibration-c25.mjs','lab/arena/evaluate-threat-calibration-c25.mjs',
 'lab/arena/threat-calibration-observer-c25.mjs','lab/arena/threat-trace-observer-c24.mjs','lab/arena/source-main/server/game.js','page-agent.js'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const sourceSHA256=sha(paths.map(p=>sha(readFileSync(path.join(root,p)))).join('|'));
const jobs=strata.flatMap(([map,weapon],si)=>Array.from({length:4},(_,i)=>({id:`${map}-${weapon}-${i}`,map,weapon,seed:baseSeed+si*100+i,
 split:i<2?'train':i===2?'validation':'test'})));
const plan={schema:'fpsarena-c25-threat-calibration-plan-v1',version:1,endpoint:C25_ENDPOINT,
 design:'fixed-grid observational samples without intervention; train/validation/test by whole new-seed matches',
 sourceSHA256,seconds,baseSeed,profile:'release',bots:5,opponents:'stress',snapshotLagMs:65,jobs};
plan.registrationSHA256=sha(JSON.stringify(plan));
const outDir=path.resolve(arg('out-dir','reports/c25/study24'));mkdirSync(outDir,{recursive:true});
const planFile=path.join(outDir,'PRE-REGISTERED-PLAN.json');
if(existsSync(planFile)){const old=JSON.parse(readFileSync(planFile,'utf8'));
 if(old.registrationSHA256!==plan.registrationSHA256)throw Error('C25 registered plan/source mismatch - do not overwrite');}
else writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');
let next=0,done=0;const records=new Array(jobs.length);
async function one(j){
 const out=path.join(outDir,j.id+'.result.json'),dataset=path.join(outDir,j.id+'.dataset.json');
 if(existsSync(out)!==existsSync(dataset))throw Error('partial result/data pair '+j.id);
 if(!existsSync(out)){
  const cmd=['lab/arena/train-main.mjs','--profile','release','--modes','tdm','--episodes','1','--seconds',String(seconds),
   '--seed',String(j.seed),'--classic-maps',j.map,'--trainee-primary',j.weapon,'--bots','5','--opponents','stress',
   '--lag-ms','65','--c25-dataset',dataset,'--out',out];
  let err='';const status=await new Promise((resolve,reject)=>{const cp=spawn(process.execPath,cmd,{cwd:root,stdio:['ignore','ignore','pipe']});
   cp.on('error',reject);cp.stderr.on('data',c=>err=(err+c.toString()).slice(-1000));cp.on('close',resolve);});
  if(status!==0)throw Error(`C25 job ${j.id} exited ${status}: ${err}`);
 }
 const a=JSON.parse(readFileSync(out,'utf8')),b=JSON.parse(readFileSync(dataset,'utf8'));
 if(a.results?.length!==1||b.matches?.length!==1||a.seconds!==seconds||a.fullMatch||a.profile!=='release')throw Error('invalid result envelope '+j.id);
 const m=b.matches[0],r=a.results[0];
 if(r.mode!=='tdm'||r.seed!==j.seed||r.map!==j.map||r.primaryLoadout!==j.weapon||r.errors!==0||
   m.metadata.seed!==j.seed||m.metadata.map!==j.map||m.metadata.loadout!==j.weapon||m.metadata.seconds!==seconds)throw Error('result/dataset provenance '+j.id);
 validateC25(b);
 return {match:m,metrics:{id:j.id,split:j.split,seed:j.seed,map:j.map,weapon:j.weapon,kills:r.kills,deaths:r.deaths,shots:r.shots,
  windows:m.windows.length,complete:m.windows.filter(w=>w.complete).length,hits:m.events.hostileWeaponHitEvents}};
}
async function worker(){while(next<jobs.length){const i=next++;records[i]=await one(jobs[i]);done++;
 console.log(`C25 ${done}/${jobs.length}: ${jobs[i].id}, windows=${records[i].metrics.complete}, incoming=${records[i].metrics.hits}`);}}
await Promise.all(Array.from({length:Math.min(workers,jobs.length)},()=>worker()));
const dataset={schema:'fpsarena-c25-fixed-grid-dataset-v1',engine:'uploaded-main',matches:records.map(r=>r.match)};
const evaluation=evaluateC25(dataset,plan,{excludedSeeds:[]});
writeFileSync(path.join(outDir,'COMBINED-DATASET.json'),JSON.stringify(dataset,null,2)+'\n');
writeFileSync(path.join(outDir,'EVALUATION.json'),JSON.stringify({...evaluation,matchResults:records.map(r=>r.metrics)},null,2)+'\n');
console.log(`C25 DONE ${evaluation.data.complete} windows, ${evaluation.data.positive} positive; HOLDOUT baseline=${evaluation.holdout.baseline.brier}, selected=${evaluation.holdout.selected.brier}`);
