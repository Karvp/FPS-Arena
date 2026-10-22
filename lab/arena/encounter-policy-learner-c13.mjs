// C13: research-only multi-class neural behavior cloning. Outputs never reach
// browser/Autopilot. The reference actions are observed, NOT optimal.
import {C13_ACTIONS,C13_FEATURES} from './encounter-policy-recorder-c13.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rng=seed=>{let x=seed>>>0;return()=>{x=(x+0x6D2B79F5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};};
const norm=f=>[clamp(f.distance/200,0,2),clamp(f.lateralSpeed/12,-1,1),
 clamp(f.radialSpeed/12,-1,1),clamp(f.snapshotAge/.5,0,1),
 clamp(f.observedHostiles/11,0,1),f.onGround,f.healthFraction,
 f.armorFraction,f.ammoFraction];
export function c13DecisionVector(row){
 if(row?.schema!=='fpsarena-c13-observed-decision-v1'||
    row.eligibility?.complete!==true||
    row.eligibility?.source!=='delayed-public-snapshot-plus-local-player'||
    row.eligibility?.independentCounterfactual!==false||
    !C13_FEATURES.every(k=>Number.isFinite(row.features?.[k]))||
    !Number.isSafeInteger(row.seed)||!row.mode||!row.map||!row.matchId||!row.decisionId)return null;
 const y=C13_ACTIONS.indexOf(row.chosenAction);if(y<0)return null;
 return {x:norm(row.features),y,group:`${row.mode}|${row.map}|${row.seed}`,
  matchId:row.matchId,weapon:row.weaponId,decisionId:row.decisionId,
  time:Number.isFinite(row.time)?row.time:null};
}
export function flattenC13(data){
 const decisions=[],seen=new Set();let duplicates=0,total=0;
 for(const m of data?.matches||[])for(const row of m.decisions||[]){
  total++;if(seen.has(row.decisionId)){duplicates++;continue;}seen.add(row.decisionId);
  const v=c13DecisionVector(row);if(v)decisions.push(v);
 }
 return {decisions,duplicates,total};
}
export function splitC13(rows,seed=13013){
 const groups=[...new Set(rows.map(r=>r.group))].sort(),random=rng(seed);
 for(let i=groups.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[groups[i],groups[j]]=[groups[j],groups[i]];}
 const n=groups.length,nTest=Math.max(1,Math.floor(.2*n)),nValid=Math.max(1,Math.floor(.2*n));
 const test=new Set(groups.slice(0,nTest)),valid=new Set(groups.slice(nTest,nTest+nValid));
 const assignments=Object.fromEntries(groups.map(g=>[g,test.has(g)?'test':valid.has(g)?'valid':'train']));
 return {train:rows.filter(r=>assignments[r.group]==='train'),valid:rows.filter(r=>assignments[r.group]==='valid'),
  test:rows.filter(r=>assignments[r.group]==='test'),assignments,groups:{train:n-nTest-nValid,valid:nValid,test:nTest}};
}
function init(seed,hidden=16){const rand=rng(seed);return {hidden,inputFeatures:C13_FEATURES,actions:C13_ACTIONS,
 w1:Array.from({length:hidden},()=>Array.from({length:C13_FEATURES.length},()=>(rand()-.5)*.14)),
 b1:Array(hidden).fill(0),w2:Array.from({length:C13_ACTIONS.length},()=>Array.from({length:hidden},()=>(rand()-.5)*.14)),
 b2:Array(C13_ACTIONS.length).fill(0)};}
function forward(net,x){
 const h=net.w1.map((w,j)=>Math.tanh(net.b1[j]+w.reduce((s,v,k)=>s+v*x[k],0)));
 const logits=net.w2.map((w,j)=>net.b2[j]+w.reduce((s,v,k)=>s+v*h[k],0));
 const max=Math.max(...logits),es=logits.map(v=>Math.exp(v-max)),sum=es.reduce((a,b)=>a+b,0);
 return {h,p:es.map(v=>v/sum)};
}
export function policyProbsC13(net,features){
 if(!Array.isArray(features)||features.length!==C13_FEATURES.length||!features.every(Number.isFinite))throw Error('invalid vector');
 return forward(net,features).p;
}
const argmax=a=>a.reduce((i,v,j)=>v>a[i]?j:i,0);
export function scoreC13(rows,predict){
 if(!rows.length)return null;
 const confusion=Array.from({length:C13_ACTIONS.length},()=>Array(C13_ACTIONS.length).fill(0));
 let loss=0,correct=0;
 for(const r of rows){const p=predict(r),pr=argmax(p);confusion[r.y][pr]++;correct+=+(pr===r.y);
  loss-=Math.log(clamp(p[r.y],1e-9,1));}
 const f1s=confusion.map((line,j)=>{const tp=line[j],fn=line.reduce((a,b)=>a+b,0)-tp,
   fp=confusion.reduce((s,l)=>s+l[j],0)-tp;return tp?2*tp/(2*tp+fn+fp):0;});
 return {n:rows.length,accuracy:+(correct/rows.length).toFixed(6),
  crossEntropy:+(loss/rows.length).toFixed(6),macroF1:+(f1s.reduce((a,b)=>a+b,0)/f1s.length).toFixed(6),confusion};
}
function trainEpoch(net,rows,learningRate,rand){
 const items=rows.slice();for(let i=items.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
 for(const {x,y} of items){
  const {h,p}=forward(net,x),old=net.w2.map(v=>v.slice());
  const delta=p.map((v,j)=>v-(j===y?1:0));
  for(let j=0;j<delta.length;j++){
   for(let k=0;k<h.length;k++)net.w2[j][k]-=learningRate*(delta[j]*h[k]+.0005*net.w2[j][k]);
   net.b2[j]-=learningRate*delta[j];
  }
  for(let k=0;k<h.length;k++){
   let d=0;for(let j=0;j<delta.length;j++)d+=delta[j]*old[j][k];
   d*=1-h[k]*h[k];
   for(let t=0;t<x.length;t++)net.w1[k][t]-=learningRate*(d*x[t]+.0005*net.w1[k][t]);
   net.b1[k]-=learningRate*d;
  }
 }
}
export function persistenceScoreC13(rows,majority){
 if(rows.some(r=>!Number.isFinite(r.time)))return null;
 const byMatch=new Map();for(const r of rows){if(!byMatch.has(r.matchId))byMatch.set(r.matchId,[]);byMatch.get(r.matchId).push(r);}
 const predict=new Map();for(const matchRows of byMatch.values()){
  matchRows.sort((a,b)=>a.time-b.time);
  let previous=majority;for(const r of matchRows){predict.set(r.decisionId,previous);previous=r.y;}
 }
 return {score:scoreC13(rows,r=>C13_ACTIONS.map((_,i)=>i===predict.get(r.decisionId)?1:0)),
  predictions:predict};
}
function clusterBootstrap(rows,net,baselinePredict,seed=8912,iterations=500){
 const groups=new Map();for(const r of rows){if(!groups.has(r.group))groups.set(r.group,[]);groups.get(r.group).push(r);}
 const keys=[...groups.keys()],rand=rng(seed),deltas=[];
 if(keys.length<3)return null;
 for(let i=0;i<iterations;i++){
  let n=0,gain=0;for(let j=0;j<keys.length;j++)for(const r of groups.get(keys[Math.floor(rand()*keys.length)])){
   gain+=+(argmax(forward(net,r.x).p)===r.y)-+(baselinePredict(r)===r.y);n++;
  }
  deltas.push(gain/n);
 }
 deltas.sort((a,b)=>a-b);
 return {unit:'match-map-seed-group',iterations,
  accuracyDelta95:[+deltas[Math.floor(iterations*.025)].toFixed(6),+deltas[Math.floor(iterations*.975)].toFixed(6)]};
}
export function trainEncounterPolicyC13(data,{seed=13013,epochs=55,minGroups=15,minDecisions=300}={}){
 const flat=flattenC13(data),rows=flat.decisions,distinct=new Set(rows.map(r=>r.group));
 const summary={totalDecisions:flat.total,eligibleDecisions:rows.length,duplicates:flat.duplicates,
  independentMatchConditions:distinct.size,observedWeapons:[...new Set(rows.map(r=>r.weapon))].sort(),
  actions:Object.fromEntries(C13_ACTIONS.map((k,i)=>[k,rows.filter(r=>r.y===i).length]))};
 const base={schema:'fpsarena-c13-encounter-policy-evaluation-v1',summary,features:C13_FEATURES,
  actions:C13_ACTIONS,status:'',productionEligible:false,policyActuationEnabled:false,
  labelMeaning:'behavior cloning of observed autopilot command; NOT optimal action',
  leakagePolicy:'features frozen before authoritative world.step(); outcome never used as a training feature or supervised label',
  caveats:['Actions are view-relative, not inferred desired world motion','No value for unchosen actions is observed',
   'Correlated decisions grouped by map,mode,seed across profiles and weapons',
   'Holdout imitation accuracy is not combat performance']};
 if(distinct.size<minGroups||rows.length<minDecisions){return {...base,status:'insufficient-independent-decisions',model:null};}
 const split=splitC13(rows,seed);
 if([split.train,split.valid,split.test].some(part=>part.length<20)||
   new Set(split.train.map(r=>r.y)).size<3)return {...base,status:'insufficient-grouped-classes',model:null,
     split:split.groups};
 const count=C13_ACTIONS.map((_,i)=>split.train.filter(r=>r.y===i).length),majority=argmax(count),eps=1e-4;
 const probs=count.map(n=>(n+eps)/(split.train.length+eps*count.length));
 const constant=()=>probs;
 const baseline=scoreC13(split.test,constant);
 const persistence=persistenceScoreC13(split.test,majority);
 let net=init(seed),best=null,bestLoss=Infinity,selectedEpoch=0;const rand=rng(seed+1);
 for(let epoch=0;epoch<epochs;epoch++){
  trainEpoch(net,split.train,.025/(1+.035*epoch),rand);
  const sc=scoreC13(split.valid,r=>forward(net,r.x).p);
  if(sc.crossEntropy<bestLoss){bestLoss=sc.crossEntropy;selectedEpoch=epoch+1;best=structuredClone(net);}
 }
 const holdout=scoreC13(split.test,r=>forward(best,r.x).p);
 return {...base,status:'research-imitation-model-evaluated',selectedEpoch,
  split:{...split.groups,trainDecisions:split.train.length,validDecisions:split.valid.length,testDecisions:split.test.length},
  validation:scoreC13(split.valid,r=>forward(best,r.x).p),holdout,majorityBaseline:baseline,
  clusterBootstrap:clusterBootstrap(split.test,best,()=>majority,seed+3),
  temporalPersistenceBaseline:persistence?.score??null,
  persistenceBootstrap:persistence?clusterBootstrap(split.test,best,r=>persistence.predictions.get(r.decisionId),seed+5):null,
  readiness:'research-only-no-combat-evidence',
  betterThanMajorityOnAccuracy:holdout.accuracy>baseline.accuracy,
  model:best};
}
