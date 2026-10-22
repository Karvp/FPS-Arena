#!/usr/bin/env node
// C20 preregistered common-seed simulation forks, research-only.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMatchedSeedPlanC20,analyzeMatchedSeedC20} from './matched-seed-study-c20.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i<0?d:process.argv[i+1];};
const src=['lab/arena/train-main.mjs','lab/arena/source-main/server/game.js','lab/arena/source-main/shared/weapons.js',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/matched-seed-study-c20.mjs','page-agent.js'];
const fingerprint=createHash('sha256').update(src.map(p=>createHash('sha256').update(readFileSync(path.join(root,p))).digest('hex')).join('|')).digest('hex');
const plan=createMatchedSeedPlanC20({pairsPerStratum:Number(arg('pairs','2')),experimentSeed:Number(arg('experiment-seed','200020')),
 baseSeed:Number(arg('base-seed','20200000')),sourceFingerprint:fingerprint});
const workers=Number(arg('workers','3'));if(!Number.isSafeInteger(workers)||workers<1||workers>6)throw Error('C20 invalid workers');
const outDir=path.resolve(arg('out-dir','reports/c20/matched-seed'));mkdirSync(outDir,{recursive:true});
const planFile=path.join(outDir,'PRE-REGISTERED-PLAN.json');
if(existsSync(planFile)){
 const stored=JSON.parse(readFileSync(planFile,'utf8'));
 if(stored.registrationSHA256!==plan.registrationSHA256)throw Error('C20 preregistration or source changed; cannot overwrite');
}else writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');
const rows=new Array(plan.jobs.length);let next=0,done=0;
async function runOne(j){
 const output=path.join(outDir,j.id+'.result.json'),dataset=path.join(outDir,j.id+'.dataset.json');
 if(existsSync(output)!==existsSync(dataset))throw Error('C20 incomplete persisted result/dataset pair '+j.id);
 if(!existsSync(output)){
  const args=['lab/arena/train-main.mjs','--profile','release','--modes','tdm','--seconds','600',
  '--full-match','--c19-natural','--c20-matched-seed','--seed',String(j.seed),
  '--classic-maps',j.map,'--trainee-primary',j.weapon,'--bots','5','--opponents','stress','--lag-ms','65',
  '--c17-dataset',dataset,'--c17-replicate',String(j.replicate),'--c17-experiment-seed',String(j.experimentSeed),
  '--profile-exploration','--out',output];
  let err='';const exit=await new Promise((resolve,reject)=>{
   const p=spawn(process.execPath,args,{cwd:root,stdio:['ignore','ignore','pipe']});
   p.stderr.on('data',data=>err=(err+data.toString()).slice(-1500));p.on('error',reject);p.on('close',resolve);
  });if(exit!==0)throw Error('C20 game failed '+j.id+': '+exit+' '+err);
 }
 const file=JSON.parse(readFileSync(output,'utf8')),data=JSON.parse(readFileSync(dataset,'utf8'));
 if(file.fullMatch!==true||file.seconds!==600||file.results?.length!==1||data.matches?.length!==1)throw Error('C20 invalid source files '+j.id);
 return {jobId:j.id,arm:j.arm,fullMatch:true,capSeconds:600,result:file.results[0],observation:data.matches[0]};
}
async function worker(){while(next<plan.jobs.length){const i=next++;rows[i]=await runOne(plan.jobs[i]);done++;
 console.log(`C20 ${done}/${plan.jobs.length} ${rows[i].jobId} ${rows[i].result.duration}s ${rows[i].result.finishedNaturally?'natural':'censored'}`);}}
await Promise.all(Array.from({length:Math.min(workers,plan.jobs.length)},()=>worker()));
const summary=analyzeMatchedSeedC20(plan,rows);
writeFileSync(path.join(outDir,'STUDY-ROWS.json'),JSON.stringify(rows,null,2)+'\n');
writeFileSync(path.join(outDir,'ANALYSIS.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({pairs:summary.pairs,meanDelta:summary.meanPairedKillDifferential,ci:summary.stratifiedBootstrapCI95,
 active:summary.activePairs,censored:summary.administrativelyCensored,allowed:summary.approval.neuralActionValueTrainingAllowed}));
