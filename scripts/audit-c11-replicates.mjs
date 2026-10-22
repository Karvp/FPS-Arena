// Offline-only multi-shot-seed audit for C11. Does NOT promote model or control.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {assessCalibrationReplicates,calibratedDamage} from '../engagement-calibration.mjs';
const argv=process.argv.slice(2);
if(argv.length<3)throw Error('Usage: node scripts/audit-c11-replicates.mjs output.json input1.json input2.json [input3.json ...]');
const [dest,...inputs]=argv;
const runs=inputs.map(f=>JSON.parse(readFileSync(f,'utf8')));
const gate=assessCalibrationReplicates(runs);
const byContext=new Map();
for(const r of runs){
 const ownSeen=new Set();
 for(const x of r.holdout||[]){
  if(!x.contextId||!x.family||ownSeen.has(x.contextId))continue;
  ownSeen.add(x.contextId);
  const d=Math.abs(x.predictedDamage-x.observedDamage)-
   Math.abs(calibratedDamage(r.model,x.family,x.predictedDamage).damage-x.observedDamage);
  if(!Number.isFinite(d))continue;
  if(!byContext.has(x.contextId))byContext.set(x.contextId,[]);
  byContext.get(x.contextId).push(d);
 }
}
const paired=[...byContext.values()].filter(v=>v.length===runs.length).map(v=>v.reduce((a,b)=>a+b,0)/v.length);
let state=0x00C11101;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
const distribution=[];
for(let i=0;i<1500;i++){
 let sum=0;
 for(let j=0;j<paired.length;j++)sum+=paired[Math.floor(random()*paired.length)];
 distribution.push(sum/Math.max(1,paired.length));
}
distribution.sort((a,b)=>a-b);
const pooledMean=paired.reduce((a,b)=>a+b,0)/Math.max(1,paired.length);
const report={format:'fpsarena-c11-multi-seed-stability-audit-v1',researchOnly:true,
 calibratedModelPromoted:false,inputFiles:inputs,replicateGate:gate,
 matchedGeometry:{contexts:paired.length,replications:runs.length,maeImprovement:pooledMean,
  exploratoryBootstrapCI95:[distribution[37]??null,distribution[1462]??null],
  note:'Resampled by matched synthetic geometry, not shots/pellets; geometry itself is correlated and results do not estimate real-match generalization.'},
 conclusion:gate.pass?'OFFLINE GATE PASSED ONLY. Still requires match validation, NOT deployment.':
  'REJECT gain calibration; preserve raw C9/C10 predictor and existing Autopilot.'};
mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,JSON.stringify(report,null,2));
console.log(JSON.stringify({destination:dest,gate:gate.pass,reasons:gate.reasons,
 matchedContexts:paired.length,meanImprovement:pooledMean,ci:report.matchedGeometry.exploratoryBootstrapCI95},null,2));
