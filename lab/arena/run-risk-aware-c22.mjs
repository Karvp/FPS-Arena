#!/usr/bin/env node
// C22 fixed, reproducible, resumable research study. No live policy changes.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateC22,evaluateC22} from './evaluate-risk-aware-c22.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i===-1?d:process.argv[i+1];};
const repetitions=Number(arg('repetitions','3')),seconds=Number(arg('seconds','75')),baseSeed=Number(arg('base-seed','22022000')),workers=Number(arg('workers','3'));
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>20||!Number.isFinite(seconds)||seconds<10||seconds>600||
 !Number.isSafeInteger(baseSeed)||baseSeed<0||baseSeed>0xffffffff-2000||!Number.isInteger(workers)||workers<1||workers>6)
 throw Error('C22 invalid preregistration parameters');
const strata=[['arena','mp5sd'],['arena','hk_sl8'],['foundry','m4a1'],['foundry','aa12'],['neon','m4a1'],['neon','mp5sd']];
const sourcePaths=['lab/arena/train-main.mjs','lab/arena/risk-aware-encounters-c22.mjs','lab/arena/evaluate-risk-aware-c22.mjs','lab/arena/encounter-randomization-c21.mjs',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/source-main/server/game.js','page-agent.js'];
const srcHash=createHash('sha256').update(sourcePaths.map(p=>createHash('sha256').update(readFileSync(path.join(root,p))).digest('hex')).join('|')).digest('hex');
const jobs=strata.flatMap(([map,weapon],j)=>Array.from({length:repetitions},(_,i)=>({map,weapon,seed:baseSeed+j*100+i,
 id:`${map}-${weapon}-${i.toString().padStart(2,'0')}`})));
const plan={schema:'fpsarena-c22-preregistered-plan-v1',design:'per-eligible-encounter seeded three-arm assignment, 0.9s and 1.8s unconfounded server horizon' ,sourceSHA256:srcHash,
 baseSeed,repetitions,seconds,snapshotLagMs:65,bots:5,opponents:'stress',profile:'release',jobs};
const registered=createHash('sha256').update(JSON.stringify(plan)).digest('hex');plan.registrationSHA256=registered;
const outDir=path.resolve(arg('out-dir','reports/c22/study18'));mkdirSync(outDir,{recursive:true});
const planPath=path.join(outDir,'PRE-REGISTERED-PLAN.json');
if(existsSync(planPath)){
 const old=JSON.parse(readFileSync(planPath,'utf8'));
 if(old.registrationSHA256!==registered)throw Error('C22 preregistration/source changed; use a new output directory');
}else writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
let next=0,done=0;const records=new Array(jobs.length);
async function one(job){
 const output=path.join(outDir,job.id+'.result.json'),dataset=path.join(outDir,job.id+'.dataset.json');
 if(existsSync(output)!==existsSync(dataset))throw Error('incomplete result/dataset pair '+job.id);
 if(!existsSync(output)){
  const argv=['lab/arena/train-main.mjs','--profile','release','--modes','tdm','--episodes','1',
   '--seconds',String(seconds),'--seed',String(job.seed),'--classic-maps',job.map,'--trainee-primary',job.weapon,
   '--bots','5','--opponents','stress','--lag-ms','65','--c22-dataset',dataset,'--out',output];
  let err='';const exit=await new Promise((resolve,reject)=>{
   const cp=spawn(process.execPath,argv,{cwd:root,stdio:['ignore','ignore','pipe']});
   cp.on('error',reject);cp.stderr.on('data',chunk=>err=(err+chunk.toString()).slice(-2000));cp.on('close',resolve);
  });if(exit!==0)throw Error(`C22 job ${job.id} exit=${exit} ${err}`);
 }
 const a=JSON.parse(readFileSync(output,'utf8')),b=JSON.parse(readFileSync(dataset,'utf8'));
 if(a.results?.length!==1||b.matches?.length!==1||a.fullMatch===true||a.seconds!==seconds||a.profile!=='release')throw Error('invalid result envelope '+job.id);
 const m=b.matches[0],r=a.results[0];
 if(r.mode!=='tdm'||r.seed!==job.seed||r.map!==job.map||r.primaryLoadout!==job.weapon||r.errors!==0||
    m.metadata.seed!==job.seed||m.metadata.map!==job.map||m.metadata.loadout!==job.weapon)
  throw Error('C22 job provenance does not match preregistration: '+job.id);
 validateC22(b);
 return {job,...{result:{seed:r.seed,kills:r.kills,deaths:r.deaths,shots:r.shots,duration:r.duration,errors:r.errors}},dataset:m};
}
async function worker(){while(next<jobs.length){const i=next++;records[i]=await one(jobs[i]);done++;
 console.log(`C22 ${done}/${jobs.length}: ${jobs[i].id}, offers=${records[i].dataset.offers.length}, kills=${records[i].result.kills}`);}}
await Promise.all(Array.from({length:Math.min(workers,jobs.length)},()=>worker()));
const dataset={schema:'fpsarena-c22-risk-aware-dataset-v1',engine:'uploaded-main',matches:records.map(x=>x.dataset)};
const summary=evaluateC22(dataset);
const stats={schema:'fpsarena-c22-study-summary-v1',registrationSHA256:registered,matchResults:records.map(({job,result})=>({job,...result})),...summary};
writeFileSync(path.join(outDir,'COMBINED-DATASET.json'),JSON.stringify(dataset,null,2)+'\n');
writeFileSync(path.join(outDir,'EVALUATION.json'),JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({matches:summary.matches,completeWindows:summary.horizons['1.8'].complete,counts:summary.horizons['1.8'].actions,
 neuralValueTrainingAllowed:summary.trainingGate.passes}));
