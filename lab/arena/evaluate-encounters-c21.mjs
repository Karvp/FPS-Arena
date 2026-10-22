// C21: validate and analyze known-propensity three-arm randomized encounters.
// ITT estimates are window-level descriptive contrasts, clustered by MATCH.
// Never interpret as per-offer observed counterfactual or proof of causal transport.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assignedActionC21,C21_ACTIONS} from './encounter-randomization-c21.mjs';
import {C13_FEATURES} from './encounter-policy-recorder-c13.mjs';
const finite=Number.isFinite;
const average=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const rnd=x=>finite(x)?+x.toFixed(5):null;
function assert(ok,msg){if(!ok)throw Error('C21 invalid dataset: '+msg);}
function hash(x){x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return(x^(x>>>16))>>>0;}
function windowValue(row){const o=row.outcome;return o.damageDealt-o.damageTaken;}
export function validateC21(data){
 assert(data?.schema==='fpsarena-c21-encounter-randomized-dataset-v1','root schema');
 assert(data.engine==='uploaded-main'&&Array.isArray(data.matches)&&data.matches.length,'engine/matches');
 const ids=new Set(),records=[];
 for(const match of data.matches){
  const m=match?.metadata;
  assert(match.schema==='fpsarena-c21-encounter-randomization-match-v1','match schema');
  assert(m?.producer==='headless-simulator'&&m.productionActuation===false&&m.assignmentBeforeOutcome===true&&m.perArmProbability===1/3,'research provenance');
  assert(Number.isSafeInteger(m.seed)&&m.seed>=0&&m.seed<=0xffffffff&&m.mode==='tdm'&&typeof m.map==='string'&&typeof m.loadout==='string','identifiers');
  const key=`${m.mode}/${m.map}/${m.loadout}/${m.seed}`;
  assert(!ids.has(key),'duplicate match identity');ids.add(key);
  assert(Array.isArray(match.offers),'missing offers');
  let previousEnd=-Infinity;
  const counts={baseline:0,'micro-left':0,'micro-right':0};
  for(const [i,r] of match.offers.entries()){
   assert(r.schema==='fpsarena-c21-randomized-opportunity-v1','offer schema');
   assert(r.seed===m.seed&&r.map===m.map&&r.loadout===m.loadout,'offer provenance');
   assert(r.offerId===`c21-${m.map}-${m.loadout}-${m.seed}-${i+1}`,'offer id/sequence');
   assert(r.selectedAction===assignedActionC21(m.seed,i+1),'assignment integrity');
   assert(r.assignment?.probability===1/3&&r.assignment?.eligibleBeforeAssignment===true,'propensity');
   assert(r.validity?.preActionPublicFeaturesOnly===true&&r.validity?.serverLabelsOnlyAfterAssignment===true&&r.validity?.noUnobservedCounterfactualClaim===true,'feature leakage');
   assert(Array.isArray(r.candidateSet)&&C21_ACTIONS.every(a=>r.candidateSet.includes(a)),'candidate action support');
   assert(C13_FEATURES.every(k=>finite(r.publicFeatures?.[k])),'missing public features');
   assert(finite(r.time)&&finite(r.windowEnd)&&r.windowEnd-r.time>=.5&&r.windowEnd-r.time<=1.2,'window');
   assert(r.time>=previousEnd-0.00011,'overlapping labels');previousEnd=r.windowEnd;
   assert(Number.isInteger(r.executedTicks)&&r.executedTicks>=0,'execution tracking');
   if(r.selectedAction==='baseline')assert(r.executedTicks===0,'baseline unexpectedly modified');
   const o=r.outcome;
   assert(o&&['shots','hits','kills','deaths','damageDealt','damageTaken'].every(k=>finite(o[k])&&o[k]>=0)&&typeof o.censored==='boolean','server label validity');
   assert(o.hits<=o.shots*20+10,'unexpected hit count'); // tolerant of shotgun pellets and delayed hit events
   counts[r.selectedAction]++;
   records.push({...r,matchId:key,stratum:`${m.map}/${m.loadout}`,value:windowValue(r)});
  }
  if(match.diagnostics){
   assert(match.diagnostics.offers===match.offers.length,'offers count');
   for(const a of C21_ACTIONS)assert(match.diagnostics.actionCounts[a]===counts[a],'arm count');
  }
 }
 return {matches:data.matches.length,records,matchKeys:[...ids]};
}
function simpleMeans(rows){const a={};for(const arm of C21_ACTIONS){const xs=rows.filter(r=>r.selectedAction===arm),vals=xs.map(r=>r.value);
 a[arm]={n:xs.length,meanDamageBalance:rnd(average(vals)),meanDamageTaken:rnd(average(xs.map(x=>x.outcome.damageTaken))),
  meanDamageDealt:rnd(average(xs.map(x=>x.outcome.damageDealt))),meanKills:rnd(average(xs.map(x=>x.outcome.kills))),
  nonzeroRate:rnd(average(xs.map(x=>(x.outcome.damageTaken+x.outcome.damageDealt)>0?1:0)))};}return a;}
function contrast(a,b){return finite(a)&&finite(b)?a-b:null;}
export function evaluateC21(data,{bootstraps=1800,analysisSeed=210021}={}){
 if(!Number.isInteger(bootstraps)||bootstraps<10||bootstraps>50000)throw Error('bad bootstrap count');
 const {matches,records,matchKeys}=validateC21(data),full=records.filter(r=>!r.outcome.censored);
 const means=simpleMeans(full);const groups=matchKeys.map(id=>full.filter(r=>r.matchId===id));
 let state=analysisSeed>>>0;
 const rng=()=>{state=hash(state);return state/4294967296;};
 function sampleCI(a){
  const values=[];
  for(let j=0;j<bootstraps;j++){
   const rows=[];for(let k=0;k<groups.length;k++)rows.push(...groups[Math.floor(rng()*groups.length)]);
   const mean=simpleMeans(rows);const d=contrast(mean[a].meanDamageBalance,mean.baseline.meanDamageBalance);
   if(finite(d))values.push(d);
  }
  values.sort((x,y)=>x-y);
  return {resamples:values.length,low:values.length?rnd(values[Math.floor(values.length*.025)]):null,
   high:values.length?rnd(values[Math.min(values.length-1,Math.floor(values.length*.975))]):null};
 }
 const activeMatchCoverage=Object.fromEntries(C21_ACTIONS.map(a=>[a,new Set(full.filter(r=>r.selectedAction===a).map(r=>r.matchId)).size]));
 const nonzero=full.filter(r=>r.outcome.damageTaken+r.outcome.damageDealt>0).length;
 const gate={minMatches:30,minCompletePerAction:120,minMatchCoveragePerAction:20,minNonzeroWindows:90,
  passes:matches>=30&&C21_ACTIONS.every(a=>means[a].n>=120&&activeMatchCoverage[a]>=20)&&nonzero>=90};
 const contrasts={};for(const a of C21_ACTIONS.slice(1))contrasts[a]={
  meanDamageBalanceDifference:rnd(contrast(means[a].meanDamageBalance,means.baseline.meanDamageBalance)),
  clusterBootstrap95:sampleCI(a)};
 return {schema:'fpsarena-c21-encounter-itt-evaluation-v1',study:'per-eligible-window randomized arms with fixed marginal 1/3 propensity',
  matches,offerCount:records.length,completeWindows:full.length,censoredWindows:records.length-full.length,
  matchUnit:'seed/map/weapon match',outcomeUnit:'nonoverlapping eligible window',
  actionMeans:means,contrasts,activeMatchCoverage,nonzeroWindows:nonzero,gate,
  conclusion:gate.passes?'enough volume for preliminary randomized-window study; not proof of tactical improvement':'underpowered exploratory experiment; do not train/deploy action value model',
  limitations:['Adaptive future opportunities depend on earlier randomized actions','Cluster resampling uses matches, not independent offer rows',
   'Outcome observed only for assigned action, no per-offer counterfactual label','Sparse short-horizon damage is not match success',
   'No human opposition, no real browser latency/FPS','No policy deployment or causal generalization claim']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=process.argv[2],out=process.argv[3];if(!input||!out)throw Error('usage: node evaluate-encounters-c21.mjs DATASET.json OUTPUT.json');
 const result=evaluateC21(JSON.parse(readFileSync(input,'utf8'))),dest=path.resolve(out);
 mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 console.log(`C21 ${result.matches} matches ${result.completeWindows} complete / ${result.offerCount} offered, gate=${result.gate.passes?'PASS':'BLOCK'}`);
}
