// Small neural *outcome predictor* for observed five-second shot events.
// It never controls the agent. Data are observational, not causal rewards.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const rng=(seed)=>{let x=seed>>>0;return()=>{x=(x+0x6d2b79f5)>>>0;let z=x;
 z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};};
export const FEATURE_NAMES=['utility','risk','plannedETA','terminalETA','routeLength','uncertainty','earlyShotWindow'];
export function featuresFromObservation(row){
 if(row?.schema!=='fpsarena-executed-engagement-observation-v2')return null;
 const p=row.option||{};const keys=FEATURE_NAMES.slice(0,-1);
 if(!keys.every(k=>Number.isFinite(p[k])))return null;
 return [clamp(p.utility/6,-2,2),clamp(p.risk/4,0,3),clamp(p.plannedETA/8,0,3),
  clamp(p.terminalETA/10,0,3),clamp(p.routeLength/100,0,3),
  clamp(p.uncertainty/10,0,3),p.earlyShotWindow===true?1:0];
}
export function supervisedRows(rows){
 return rows.flatMap(r=>{
  if(!r?.trainingEligibility?.fullyObserved||!r.trainingEligibility.independentObservation||
     r.observation?.horizonSeconds!==5||r.observation?.horizonComplete!==true)return [];
  const v=featuresFromObservation(r);const shots=r.observation?.total?.shots;
  if(v===null||!Number.isInteger(shots)||shots<0||!Number.isInteger(r.provenance?.seed))return [];
  return [{x:v,y:shots>0?1:0,group:`${r.provenance.mode}|${r.provenance.map}|${r.provenance.primaryLoadout}|${r.provenance.seed}`,
    map:r.provenance.map,weapon:r.provenance.primaryLoadout}];
 });
}
function splitByGroups(samples,seed=19){
 const groups=[...new Set(samples.map(x=>x.group))];const rand=rng(seed);
 for(let i=groups.length-1;i>0;i--){let j=Math.floor(rand()*(i+1));[groups[i],groups[j]]=[groups[j],groups[i]];}
 const hold=new Set(groups.slice(0,Math.max(1,Math.floor(groups.length*.2))));
 return {train:samples.filter(x=>!hold.has(x.group)),valid:samples.filter(x=>hold.has(x.group)),trainGroups:groups.length-hold.size,validGroups:hold.size};
}
function initModel(seed){
 const rand=rng(seed),n=FEATURE_NAMES.length,h=12;
 return {inputFeatures:[...FEATURE_NAMES],hiddenUnits:h,
  w1:Array.from({length:h},()=>Array.from({length:n},()=>(rand()-.5)*.32)),
  b1:Array(h).fill(0),w2:Array.from({length:h},()=>(rand()-.5)*.32),b2:0};
}
export function predictShotProbability(model,x){
 if(!Array.isArray(x)||x.length!==FEATURE_NAMES.length||x.some(v=>!Number.isFinite(v)))throw Error('Malformed features');
 const hidden=model.w1.map((weights,i)=>Math.tanh(model.b1[i]+weights.reduce((s,w,j)=>s+w*x[j],0)));
 return sigmoid(model.b2+hidden.reduce((s,h,i)=>s+model.w2[i]*h,0));
}
const brier=(model,data)=>data.reduce((sum,s)=>sum+(predictShotProbability(model,s.x)-s.y)**2,0)/data.length;
export function assessNeuralReadiness(rows,{minExamples=100,minGroups=40}={}){
 const samples=supervisedRows(rows);
 const groups=new Set(samples.map(x=>x.group));
 const positives=samples.filter(x=>x.y===1).length;
 const maps=new Set(samples.map(x=>x.map)),weapons=new Set(samples.map(x=>x.weapon));
 const problems=[];
 if(samples.length<minExamples)problems.push(`requires >=${minExamples} independent, uncensored feature-complete observations; have ${samples.length}`);
 if(groups.size<minGroups)problems.push(`requires >=${minGroups} distinct match conditions; have ${groups.size}`);
 if(maps.size<2)problems.push('requires >=2 maps');
 if(weapons.size<2)problems.push('requires >=2 weapons');
 if(positives<20||samples.length-positives<20)problems.push('requires >=20 outcomes of each class');
 return {ready:problems.length===0,validObservations:samples.length,distinctMatches:groups.size,
  positives,negatives:samples.length-positives,maps:[...maps],weapons:[...weapons],problems};
}
export function trainNeuralShotPredictor(rows,{seed=2026,epochs=120,learningRate=.035,minExamples=100,minGroups=40}={}){
 const readiness=assessNeuralReadiness(rows,{minExamples,minGroups});
 if(!readiness.ready)return {status:'insufficient-data',readiness,model:null};
 const samples=supervisedRows(rows),s=splitByGroups(samples,seed);
 const count=(set,v)=>set.filter(x=>x.y===v).length;
 if(s.train.length<30||s.valid.length<15||[0,1].some(v=>count(s.train,v)<5||count(s.valid,v)<3)){
  return {status:'insufficient-heldout-balance',readiness,
   split:{train:s.train.length,valid:s.valid.length,trainGroups:s.trainGroups,validGroups:s.validGroups},model:null};
 }
 const model=initModel(seed),rand=rng(seed+1),initialBrier=brier(model,s.valid);
 let best=null,bestBrier=Infinity,bestEpoch=0;
 for(let epoch=0;epoch<epochs;epoch++){
  const order=s.train.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const lr=learningRate/(1+epoch/100);
  for(const {x,y} of order){
   const hidden=model.w1.map((ws,i)=>Math.tanh(model.b1[i]+ws.reduce((a,w,j)=>a+w*x[j],0)));
   const p=sigmoid(model.b2+hidden.reduce((a,h,i)=>a+h*model.w2[i],0));
   const err=p-y, oldW2=model.w2.slice();
   for(let i=0;i<model.hiddenUnits;i++)model.w2[i]-=lr*(err*hidden[i]+.001*model.w2[i]);
   model.b2-=lr*err;
   for(let i=0;i<model.hiddenUnits;i++){
    const delta=err*oldW2[i]*(1-hidden[i]*hidden[i]);
    for(let j=0;j<x.length;j++)model.w1[i][j]-=lr*(delta*x[j]+.001*model.w1[i][j]);
    model.b1[i]-=lr*delta;
   }
  }
  const score=brier(model,s.valid);
  if(score<bestBrier){bestBrier=score;best=JSON.parse(JSON.stringify(model));bestEpoch=epoch+1;}
 }
 const rate=s.train.reduce((a,r)=>a+r.y,0)/s.train.length;
 const baselineBrier=s.valid.reduce((a,r)=>a+(rate-r.y)**2,0)/s.valid.length;
 return {status:'research-only',readiness,
  predictionTarget:'server-confirmed shot event within 5 seconds of selecting director command',
  inferenceActuationEnabled:false,causalEffectEstimated:false,productionEligible:false,
  split:{train:s.train.length,valid:s.valid.length,trainGroups:s.trainGroups,validGroups:s.validGroups},
  evaluation:{initialValidationBrier:initialBrier,modelValidationBrier:bestBrier,
   constantRateBaselineBrier:baselineBrier,betterThanConstantBaseline:bestBrier<baselineBrier,
   chosenEpoch:bestEpoch,trainingShotRate:rate},model:best};
}
