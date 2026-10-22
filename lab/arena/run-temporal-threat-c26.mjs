#!/usr/bin/env node
// C26 locked all-new seed holdout. The C25 published test set is NOT used
// for tuning, feature selection or the newly reported holdout score.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {C26_ENDPOINT,C26_STRATA,C26_LAGS,validateC26Holdout,evaluateC26} from './evaluate-temporal-threat-c26.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const flag=(name,df)=>{const i=process.argv.indexOf('--'+name);return i<0?df:process.argv[i+1];};
const seconds=Number(flag('seconds','60')),baseSeed=Number(flag('base-seed','26026000')),workers=Number(flag('workers','3'));
if(!Number.isSafeInteger(seconds)||seconds<10||seconds>600||!Number.isSafeInteger(baseSeed)||baseSeed<1000000||baseSeed>0xffffffff-10000||!Number.isInteger(workers)||workers<1||workers>6)throw Error('C26 invalid study arguments');
const sha=x=>createHash('sha256').update(x).digest('hex');
const hash=x=>sha(JSON.stringify(x));
const devDir=path.resolve(flag('development-dir','reports/c25/study24'));
const devData=JSON.parse(readFileSync(path.join(devDir,'COMBINED-DATASET.json'),'utf8'));
const devPlan=JSON.parse(readFileSync(path.join(devDir,'PRE-REGISTERED-PLAN.json'),'utf8'));
const paths=['lab/arena/train-main.mjs','lab/arena/run-temporal-threat-c26.mjs','lab/arena/evaluate-temporal-threat-c26.mjs',
 'lab/arena/threat-calibration-observer-c25.mjs','lab/arena/threat-trace-observer-c24.mjs','lab/arena/source-main/server/game.js','page-agent.js'];
const sourceSHA256=sha(paths.map(p=>sha(readFileSync(path.join(root,p)))).join('|'));
const jobs=C26_STRATA.flatMap(([map,weapon],i)=>C26_LAGS.map((lagMs,j)=>({id:`${map}-${weapon}-${lagMs}ms`,map,weapon,lagMs,seed:baseSeed+i*100+j})));
const plan={schema:'fpsarena-c26-temporal-study-v1',version:1,endpoint:C26_ENDPOINT,
 design:'prospective new-seed, latency-stratified holdout for C25-trained temporal predictors; no intervention',
 sourceSHA256,developmentRegistrationSHA256:devPlan.registrationSHA256,developmentDatasetSHA256:hash(devData),
 profile:'release',seconds,baseSeed,bots:5,opponents:'stress',jobs};
plan.registrationSHA256=hash(plan);
const outDir=path.resolve(flag('out-dir','reports/c26/study18'));mkdirSync(outDir,{recursive:true});
const planPath=path.join(outDir,'PRE-REGISTERED-PLAN.json');
if(existsSync(planPath)){
 const old=JSON.parse(readFileSync(planPath,'utf8'));
 if(old.registrationSHA256!==plan.registrationSHA256)throw Error('C26 registered plan/source changed; do not overwrite');
}else writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
const results=new Array(jobs.length);let next=0,done=0;
async function run(j){const resultPath=path.join(outDir,j.id+'.result.json'),dataPath=path.join(outDir,j.id+'.dataset.json');
 if(existsSync(resultPath)!==existsSync(dataPath))throw Error('C26 incomplete result/dataset pair '+j.id);
 if(!existsSync(resultPath)){
  const cmd=['lab/arena/train-main.mjs','--profile','release','--modes','tdm','--episodes','1','--seconds',String(seconds),
   '--seed',String(j.seed),'--classic-maps',j.map,'--trainee-primary',j.weapon,'--bots','5','--opponents','stress',
   '--lag-ms',String(j.lagMs),'--c25-dataset',dataPath,'--out',resultPath];
  let stderr='';const code=await new Promise((resolve,reject)=>{
   const cp=spawn(process.execPath,cmd,{cwd:root,stdio:['ignore','ignore','pipe']});cp.on('error',reject);
   cp.stderr.on('data',x=>stderr=(stderr+x.toString()).slice(-2000));cp.on('close',resolve);});
  if(code!==0)throw Error(`C26 ${j.id} engine status ${code} ${stderr}`);
 }
 const result=JSON.parse(readFileSync(resultPath,'utf8')),data=JSON.parse(readFileSync(dataPath,'utf8'));
 if(result.results?.length!==1||data.matches?.length!==1||result.seconds!==seconds||result.fullMatch||result.profile!=='release')throw Error('envelope '+j.id);
 const m=data.matches[0],r=result.results[0];
 if(r.seed!==j.seed||r.map!==j.map||r.primaryLoadout!==j.weapon||r.mode!=='tdm'||r.errors!==0||
    m.metadata.seed!==j.seed||m.metadata.map!==j.map||m.metadata.loadout!==j.weapon||m.metadata.snapshotLagMs!==j.lagMs||m.metadata.seconds!==seconds)throw Error('game provenance '+j.id);
 return {match:m,metrics:{...j,kills:r.kills,deaths:r.deaths,shots:r.shots,complete:m.windows.filter(w=>w.complete).length,
  positives:m.windows.filter(w=>w.complete&&w.label.hostileWeaponHitEvents>0).length}};
}
async function worker(){while(next<jobs.length){const k=next++,j=jobs[k];results[k]=await run(j);done++;
 console.log(`C26 ${done}/${jobs.length} ${j.id} windows=${results[k].metrics.complete} hits=${results[k].metrics.positives}`);}}
await Promise.all(Array.from({length:Math.min(workers,jobs.length)},()=>worker()));
const holdout={schema:'fpsarena-c25-fixed-grid-dataset-v1',engine:'uploaded-main',matches:results.map(r=>r.match)};
validateC26Holdout(holdout,plan,devData,devPlan);
const evaluation=evaluateC26(devData,devPlan,holdout,plan);
writeFileSync(path.join(outDir,'COMBINED-DATASET.json'),JSON.stringify(holdout,null,2)+'\n');
writeFileSync(path.join(outDir,'EVALUATION.json'),JSON.stringify({...evaluation,matchResults:results.map(r=>r.metrics)},null,2)+'\n');
console.log(`C26 PASS: ${evaluation.data.holdout.complete} holdout windows, selected ${evaluation.selected.kind} baseline Brier=${evaluation.newSeedHoldout.constant.brier}, selected=${evaluation.newSeedHoldout.selected.brier}`);
