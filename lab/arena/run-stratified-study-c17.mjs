#!/usr/bin/env node
// Research runner, one independent game simulation per (stratum,replicate).
// Includes every assigned game, including those with zero eligible opportunities.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeStratifiedC17,stratifiedAssignmentC17} from './stratified-exploration-c17.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const arg=(key,def)=>{const i=process.argv.indexOf('--'+key);return i<0?def:process.argv[i+1];};
const blocks=Number(arg('blocks','4')),seconds=Number(arg('seconds','36')),
 workers=Number(arg('workers','3')),expSeed=Number(arg('experiment-seed','170017')),
 baseSeed=Number(arg('seed','17170000'));
if(!Number.isSafeInteger(blocks)||blocks<1||blocks>30||!Number.isFinite(seconds)||seconds<10||seconds>300||
 !Number.isSafeInteger(workers)||workers<1||workers>6||!Number.isSafeInteger(expSeed)||!Number.isSafeInteger(baseSeed))
 throw Error('Invalid C17 study settings');
const scenarios=[['arena','mp5sd'],['foundry','aa12'],['neon','m4a1'],
 ['arena','hk_sl8'],['foundry','m4a1'],['neon','mp5sd']];
const outputDir=path.resolve(arg('out-dir','reports/c17/study'));
mkdirSync(outputDir,{recursive:true});
const jobs=[];
for(let j=0;j<scenarios.length;j++)for(let replicate=0;replicate<blocks*2;replicate++){
 const [map,weapon]=scenarios[j],seed=baseSeed+j*1000+replicate*13;
 const name=`${map}-${weapon}-${replicate}`;
 jobs.push({name,map,weapon,seed,replicate,assignment:stratifiedAssignmentC17({map,loadout:weapon,seed,replicate,experimentSeed:expSeed}),
  resultPath:path.join(outputDir,name+'.result.json'),datasetPath:path.join(outputDir,name+'.dataset.json')});
}
async function runOne(job){
 const args=['lab/arena/train-main.mjs','--profile','release','--modes','tdm','--seconds',String(seconds),'--seed',String(job.seed),
  '--classic-maps',job.map,'--trainee-primary',job.weapon,'--opponents','stress','--lag-ms','65',
  '--c17-dataset',job.datasetPath,'--c17-replicate',String(job.replicate),'--c17-experiment-seed',String(expSeed),
  '--out',job.resultPath];
 let stdout='',stderr='';
 const code=await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,args,{cwd:path.resolve(dir,'../..'),stdio:['ignore','pipe','pipe']});
  p.stdout.on('data',b=>stdout+=b.toString());p.stderr.on('data',b=>stderr+=b.toString());
  p.on('error',reject);p.on('close',resolve);
 });
 if(code!==0)throw Error(`${job.name} failed (${code}): ${stderr.slice(-1200)} ${stdout.slice(-300)}`);
 const result=JSON.parse(readFileSync(job.resultPath,'utf8')).results[0];
 const observation=JSON.parse(readFileSync(job.datasetPath,'utf8')).matches[0];
 if(!result||!observation)throw Error('Missing C17 result or server observation for '+job.name);
 return {cohort:'stratified',variant:'17',arm:job.assignment.arm,result,observation};
}
const rows=new Array(jobs.length);let next=0,done=0;
async function worker(){while(next<jobs.length){const i=next++;rows[i]=await runOne(jobs[i]);done++;
 if(done%8===0||done===jobs.length)console.log(`C17 completed ${done}/${jobs.length} matches`);
}}
await Promise.all(Array.from({length:Math.min(workers,jobs.length)},()=>worker()));
const analysis=analyzeStratifiedC17(rows,{minimumBlocks:20,minimumExposedPerArm:10,bootstrapReplicates:10000});
const summary={schema:'fpsarena-c17-stratified-study-v1',engine:'uploaded-main C7 snapshot',experimentSeed:expSeed,
 seconds,baseSeed,scenarios,blocksPerStratum:blocks,assignment:'1:1 block randomization with independently seeded whole games',
 studyMatches:rows.length,analysis,
 note:'Research only. No production actuation; outcomes are match-level ITT; never per-offer causal labels.'};
writeFileSync(path.join(outputDir,'study-rows.json'),JSON.stringify(rows,null,2)+'\n');
writeFileSync(path.join(outputDir,'study-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log('C17 study complete: '+JSON.stringify({matches:rows.length,blocks:analysis.completeBlocks,
 control:analysis.individualMatches.filter(x=>x.arm==='control').length,
 treatment:analysis.individualMatches.filter(x=>x.arm==='treatment').length,
 opportunities:[analysis.exposedControl,analysis.exposedTreatment],
 observedITT:analysis.observedKillDifferentialPerMatch,ci95:analysis.blockBootstrapCI95,p:analysis.blockSignFlipRandomizationP,
 status:analysis.status,reasons:analysis.reasonCodes}));
