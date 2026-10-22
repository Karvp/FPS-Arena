#!/usr/bin/env node
// C27: frozen development-trained models, independent factorial opponent-domain holdout.
// No production control changes. Freeze happens BEFORE this script is invoked.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const flag=(k,v)=>{const i=process.argv.indexOf('--'+k);return i<0?v:process.argv[i+1];};
const seconds=Number(flag('seconds','50')),baseSeed=Number(flag('base-seed','27027000')),
 workers=Number(flag('workers','4'));
if(!Number.isSafeInteger(seconds)||seconds<25||seconds>180||!Number.isSafeInteger(baseSeed)||baseSeed<1000000||baseSeed>0xffffffff-10000||!Number.isInteger(workers)||workers<1||workers>6)throw Error('C27 invalid CLI arguments');
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=x=>sha(JSON.stringify(x));
const frozenPath='reports/c27/study36/FROZEN-MODELS.json';
const devPath='reports/c25/study24/COMBINED-DATASET.json';
const devPlanPath='reports/c25/study24/PRE-REGISTERED-PLAN.json';
const previousC26Path='reports/c26/study18/COMBINED-DATASET.json';
const frozen=JSON.parse(readFileSync(path.join(root,frozenPath),'utf8'));
if(frozen.schema!=='fpsarena-c27-temporal-gru-v1'||frozen.task!=='freeze'||frozen.developmentDataSHA256!==sha(readFileSync(path.join(root,devPath)))||frozen.developmentPlanFileSHA256!==sha(readFileSync(path.join(root,devPlanPath)))||frozen.actionPolicy!=='UNCHANGED research-only observational predictor')throw Error('C27 candidates are not frozen from C25 development data');
const conditions=[['arena','mp5sd'],['arena','hk_sl8'],['foundry','m4a1'],['foundry','aa12'],['neon','m4a1'],['neon','mp5sd']];
const opponents=['stress','mixed','official'],lagsMs=[35,125];
const jobs=conditions.flatMap(([map,weapon],i)=>opponents.flatMap((opponents,k)=>lagsMs.map((lagMs,j)=>({id:`${map}-${weapon}-${opponents}-${lagMs}ms`,map,weapon,opponents,lagMs,seed:baseSeed+i*100+k*10+j}))));
const sourcePaths=['lab/arena/train-main.mjs','lab/arena/run-temporal-gru-c27.mjs','scripts/temporal-threat-gru-c27.py','lab/arena/threat-calibration-observer-c25.mjs','lab/arena/threat-trace-observer-c24.mjs','lab/arena/source-main/server/game.js','page-agent.js'];
const sourceSHA256=sha(sourcePaths.map(p=>sha(readFileSync(path.join(root,p)))).join('|'));
const plan={schema:'fpsarena-c27-domain-shift-plan-v1',version:1,design:'FULL FACTORIAL: 6 map/weapon strata x 3 opponents stress/mixed/official x 2 snapshot lags 35/125 ms, distinct new seeds, unchanged Release',
 endpoint:{outcome:'any future server-confirmed hostile weapon hit within 1.8 s',firstWindowSeconds:3,horizonSeconds:1.8,observerOnly:true,noPolicyActuation:true},
 sourcePaths,sourceSHA256,frozenArtifactPath:frozenPath,frozenArtifactSHA256:sha(readFileSync(path.join(root,frozenPath))),
 developmentDataPath:devPath,developmentDataSHA256:sha(readFileSync(path.join(root,devPath))),developmentPlanPath:devPlanPath,
 previousC26DataPath:previousC26Path,previousC26DataSHA256:sha(readFileSync(path.join(root,previousC26Path))),
 profile:'release',seconds,baseSeed,bots:5,opponents,lagsMs,jobs};
plan.registrationSHA256=hash(plan);
const outDir=path.resolve(flag('out-dir','reports/c27/study36'));mkdirSync(outDir,{recursive:true});
const planPath=path.join(outDir,'PRE-REGISTERED-PLAN.json');
if(existsSync(planPath)){
 const old=JSON.parse(readFileSync(planPath,'utf8'));if(old.registrationSHA256!==plan.registrationSHA256)throw Error('C27 preregistered plan or source altered; refusing override');
}else writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
const output=new Array(jobs.length);let next=0,completed=0;
async function run(j){const rp=path.join(outDir,j.id+'.result.json'),dp=path.join(outDir,j.id+'.dataset.json');
 if(existsSync(rp)!==existsSync(dp))throw Error('C27 incomplete result/dataset for '+j.id);
 if(!existsSync(rp)){
  const cmd=['lab/arena/train-main.mjs','--profile','release','--modes','tdm','--episodes','1','--seconds',String(seconds),
   '--seed',String(j.seed),'--classic-maps',j.map,'--trainee-primary',j.weapon,'--bots','5','--opponents',j.opponents,
   '--lag-ms',String(j.lagMs),'--c25-dataset',dp,'--out',rp];
  let stderr='';const rc=await new Promise((resolve,reject)=>{const cp=spawn(process.execPath,cmd,{cwd:root,stdio:['ignore','ignore','pipe']});cp.on('error',reject);cp.stderr.on('data',x=>stderr=(stderr+x.toString()).slice(-2000));cp.on('close',resolve);});
  if(rc!==0)throw Error('C27 engine failed '+j.id+' '+rc+' '+stderr);
 }
 const a=JSON.parse(readFileSync(rp,'utf8')),b=JSON.parse(readFileSync(dp,'utf8'));
 if(a.results?.length!==1||b.matches?.length!==1||a.seconds!==seconds||a.profile!=='release'||a.fullMatch)throw Error('C27 wrong envelope '+j.id);
 const r=a.results[0],m=b.matches[0],z=m.metadata;
 if(r.seed!==j.seed||r.map!==j.map||r.primaryLoadout!==j.weapon||r.mode!=='tdm'||r.errors!==0||z.seed!==j.seed||z.mode!=='tdm'||z.map!==j.map||z.loadout!==j.weapon||z.seconds!==seconds||z.snapshotLagMs!==j.lagMs||z.observerOnly!==true||z.productionActuation!==false)throw Error('C27 mismatched match '+j.id);
 // The C25 metadata does not expose opponent profile, but it is locked in the plan and replay CLI.
 return {match:m,metrics:{...j,complete:m.windows.filter(w=>w.complete).length,positive:m.windows.filter(w=>w.complete&&w.label.hostileWeaponHitEvents>0).length,kills:r.kills,deaths:r.deaths,errors:r.errors}};
}
async function worker(){while(next<jobs.length){const i=next++,j=jobs[i];output[i]=await run(j);completed++;
 console.log(`C27 ${completed}/${jobs.length} ${j.id} windows=${output[i].metrics.complete} hits=${output[i].metrics.positive}`);}}
await Promise.all(Array.from({length:Math.min(workers,jobs.length)},()=>worker()));
const combined={schema:'fpsarena-c25-fixed-grid-dataset-v1',engine:'uploaded-main',matches:output.map(o=>o.match)};
writeFileSync(path.join(outDir,'COMBINED-DATASET.json'),JSON.stringify(combined,null,2)+'\n');
writeFileSync(path.join(outDir,'MATCH-METRICS.json'),JSON.stringify(output.map(o=>o.metrics),null,2)+'\n');
// Evaluation is performed only after all preregistered jobs are complete.
console.log(`C27 COMPLETED ${output.length} observational matches; frozen ${frozen.selectedKind}; evaluate via Python offline.`);
