#!/usr/bin/env node
// Pre-register the COMPLETE schedule before running a match. Strict verification
// includes every assigned match, even when the safe explorer never acts.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLongHorizonPlanC18,analyzeLongHorizonC18} from './long-horizon-study-c18.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1];};
const plan=createLongHorizonPlanC18({blocksPerStratum:Number(arg('blocks','4')),
 seconds:Number(arg('seconds','75')),experimentSeed:Number(arg('experiment-seed','180018')),
 baseSeed:Number(arg('base-seed','18180000'))});
const workers=Number(arg('workers','3'));
if(!Number.isSafeInteger(workers)||workers<1||workers>6)throw Error('Invalid C18 worker count');
const outDir=path.resolve(arg('out-dir','reports/c18/study'));
mkdirSync(outDir,{recursive:true});
const registrationPath=path.join(outDir,'PRE-REGISTERED-PLAN.json');
if(existsSync(registrationPath)){
 const previous=JSON.parse(readFileSync(registrationPath,'utf8'));
 if(previous.registrationSHA256!==plan.registrationSHA256)throw Error('Existing preregistration differs; use a new output directory');
}else writeFileSync(registrationPath,JSON.stringify(plan,null,2)+'\n');
const rows=new Array(plan.jobs.length);let next=0,done=0;
async function runOne(job){
 const output=path.join(outDir,job.id+'.result.json'),data=path.join(outDir,job.id+'.dataset.json');
 const flags=['lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--seconds',String(job.seconds),'--seed',String(job.seed),'--classic-maps',job.map,
  '--trainee-primary',job.weapon,'--bots','5','--opponents','stress','--lag-ms','65',
  '--c17-dataset',data,'--c17-replicate',String(job.replicate),'--c17-experiment-seed',String(job.experimentSeed),
  '--profile-exploration','--out',output];
 let err='';const code=await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,flags,{cwd:root,stdio:['ignore','ignore','pipe']});
  p.stderr.on('data',s=>err+=(s.toString()).slice(-2000));p.on('error',reject);p.on('close',resolve);
 });
 if(code!==0)throw Error(job.id+' failed with '+code+': '+err.slice(-700));
 const result=JSON.parse(readFileSync(output,'utf8')).results?.[0],
 observation=JSON.parse(readFileSync(data,'utf8')).matches?.[0];
 if(!result||!observation)throw Error('Missing C18 verified result '+job.id);
 return {jobId:job.id,cohort:'stratified',variant:'17',arm:job.arm,result,observation};
}
async function worker(){while(next<plan.jobs.length){const i=next++;
 rows[i]=await runOne(plan.jobs[i]);done++;
 if(done%6===0||done===plan.jobs.length)console.log(`C18 progress ${done}/${plan.jobs.length}`);
}}
await Promise.all(Array.from({length:Math.min(workers,plan.jobs.length)},()=>worker()));
const analysis=analyzeLongHorizonC18(plan,rows,{bootstrapReplicates:10000});
writeFileSync(path.join(outDir,'STUDY-ROWS.json'),JSON.stringify(rows,null,2)+'\n');
writeFileSync(path.join(outDir,'ANALYSIS.json'),JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify({matches:analysis.studyMatches,blocks:analysis.completeBlocks,
 minutes:analysis.minutesSimulated,itt:analysis.observedITT,ci95:analysis.stratifiedBootstrapCI95,
 p:analysis.signFlipMonteCarloP,arms:analysis.arms,promotion:analysis.productionPromotionAllowed}));
