#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNaturalEndPlanC19,analyzeNaturalEndC19} from './natural-end-study-c19.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1];};
const sha=(parts)=>createHash('sha256').update(parts.map(p=>readFileSync(path.join(root,p))).reduce((s,b)=>s+b.toString('hex'),'')).digest('hex');
const sourceFingerprint=sha(['lab/arena/train-main.mjs','lab/arena/source-main/server/game.js','lab/arena/source-main/shared/weapons.js','lab/arena/safe-action-explorer-c16.mjs','page-agent.js']);
const plan=createNaturalEndPlanC19({blocksPerStratum:Number(arg('blocks','2')),
 experimentSeed:Number(arg('experiment-seed','190019')),baseSeed:Number(arg('base-seed','19190000')),sourceFingerprint});
const workers=Number(arg('workers','2'));
if(!Number.isSafeInteger(workers)||workers<1||workers>6)throw Error('Invalid worker count');
const outDir=path.resolve(arg('out-dir','reports/c19/study'));
mkdirSync(outDir,{recursive:true});const registered=path.join(outDir,'PRE-REGISTERED-PLAN.json');
if(existsSync(registered)){
 const prior=JSON.parse(readFileSync(registered,'utf8'));
 if(prior.registrationSHA256!==plan.registrationSHA256)throw Error('C19 source or plan changed; refuse overwriting existing registration');
}else writeFileSync(registered,JSON.stringify(plan,null,2)+'\n');
const rows=new Array(plan.jobs.length);let next=0,done=0;
async function runOne(j){
 const output=path.join(outDir,j.id+'.result.json'),dataset=path.join(outDir,j.id+'.dataset.json');
 if(existsSync(output)!==existsSync(dataset))throw Error('C19 incomplete pair already on disk; inspect explicitly '+j.id);
 if(!existsSync(output)){
  const flags=['lab/arena/train-main.mjs','--profile','release','--modes','tdm','--seconds','600',
   '--full-match','--c19-natural','--seed',String(j.seed),'--classic-maps',j.map,
   '--trainee-primary',j.weapon,'--bots','5','--opponents','stress','--lag-ms','65',
   '--c17-dataset',dataset,'--c17-replicate',String(j.replicate),'--c17-experiment-seed',String(j.experimentSeed),
   '--profile-exploration','--out',output];
  let err='';const exit=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,flags,{cwd:root,stdio:['ignore','ignore','pipe']});
   p.stderr.on('data',b=>{err=(err+b.toString()).slice(-2000);});p.on('error',reject);p.on('close',resolve);});
  if(exit!==0)throw Error('C19 match '+j.id+' failed: '+exit+' '+err.slice(-500));
 }
 const file=JSON.parse(readFileSync(output,'utf8')),data=JSON.parse(readFileSync(dataset,'utf8'));
 if(file.fullMatch!==true||file.seconds!==600||file.results?.length!==1||data.matches?.length!==1)throw Error('C19 invalid natural end output '+j.id);
 return {jobId:j.id,cohort:'stratified',variant:'17',arm:j.arm,fullMatch:true,capSeconds:600,
  result:file.results[0],observation:data.matches[0]};
}
async function worker(){while(next<plan.jobs.length){const i=next++;rows[i]=await runOne(plan.jobs[i]);done++;
 console.log(`C19 ${done}/${plan.jobs.length} ${rows[i].jobId} ${rows[i].result.duration}s ${rows[i].result.finishedNaturally?'natural':'censored'}`);
}}
await Promise.all(Array.from({length:Math.min(workers,plan.jobs.length)},()=>worker()));
const a=analyzeNaturalEndC19(plan,rows);
writeFileSync(path.join(outDir,'STUDY-ROWS.json'),JSON.stringify(rows,null,2)+'\n');
writeFileSync(path.join(outDir,'ANALYSIS.json'),JSON.stringify(a,null,2)+'\n');
console.log(JSON.stringify({matches:a.assignedMatches,natural:a.naturalEnded,censored:a.administrativelyCensored,itt:a.observedITT,
 ci:a.stratifiedBootstrapCI95,p:a.pairedSignFlipP}));
