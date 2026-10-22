// C21 research-only conditional mean reward network (not counterfactual labels).
// Training requires enough independent MATCHES and nonzero outcomes. No actuation path.
import {C13_FEATURES} from './encounter-policy-recorder-c13.mjs';
import {C21_ACTIONS} from './encounter-randomization-c21.mjs';
import {validateC21,evaluateC21} from './evaluate-encounters-c21.mjs';
const finite=Number.isFinite;
const SCALES=[100,12,12,.5,12,1,1,1,1];
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
function rand(seed){let n=seed>>>0;return ()=>{n=(n+0x6d2b79f5)>>>0;let x=n;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
export function c21ValueFeatures(features,action){
 if(!C21_ACTIONS.includes(action)||!C13_FEATURES.every(x=>finite(features?.[x])))throw Error('invalid C21 value features');
 return [...C13_FEATURES.map((k,i)=>clip(features[k]/SCALES[i],-3,3)),...C21_ACTIONS.map(a=>+(a===action))];
}
export function fitC21ExperimentalMLP(rows,{seed=210421,epochs=240,lr=.015,hidden=12}={}){
 if(!Array.isArray(rows)||rows.length<10||!Number.isSafeInteger(seed)||!Number.isInteger(epochs)||epochs<1||epochs>1000||
 !Number.isInteger(hidden)||hidden<2||hidden>32||!finite(lr)||lr<=0||lr>.1)throw Error('C21 invalid fit inputs');
 const rr=rand(seed),w1=Array.from({length:hidden},()=>Array.from({length:12},()=>((rr()-.5)*.2))),
  b1=Array(hidden).fill(0),w2=Array.from({length:hidden},()=>((rr()-.5)*.2));let b2=0;
 const data=rows.map(r=>({x:c21ValueFeatures(r.publicFeatures,r.selectedAction),y:clip(r.value/100,-3,3)}));
 for(let e=0;e<epochs;e++){
  const gw1=w1.map(v=>v.map(()=>0)),gb1=b1.map(()=>0),gw2=w2.map(()=>0);let gb2=0;
  for(const {x,y} of data){const h=w1.map((w,j)=>Math.tanh(w.reduce((s,v,k)=>s+v*x[k],b1[j]))),
   diff=clip(b2+w2.reduce((s,v,k)=>s+v*h[k],0)-y,-4,4);gb2+=diff;
   for(let j=0;j<hidden;j++){gw2[j]+=diff*h[j];const g=diff*w2[j]*(1-h[j]*h[j]);gb1[j]+=g;
    for(let k=0;k<12;k++)gw1[j][k]+=g*x[k];}
  }
  const t=lr/data.length;
  for(let j=0;j<hidden;j++){w2[j]-=t*(gw2[j]+.02*w2[j]);b1[j]-=t*gb1[j];
   for(let k=0;k<12;k++)w1[j][k]-=t*(gw1[j][k]+.02*w1[j][k]);}b2-=t*gb2;
 }
 return {schema:'fpsarena-c21-shadow-conditional-value-mlp-v1',seed,epochs,hidden,lr,
  inputFeatures:[...C13_FEATURES,'action-baseline','action-micro-left','action-micro-right'],
  w1,b1,w2,b2,trainedOn:'observed randomized action outcomes only',productionActuation:false,
  warning:'Conditional outcome model, not observed individual counterfactual Q-values; do not deploy'};
}
export function predictC21ExperimentalMLP(model,features,action){
 const x=c21ValueFeatures(features,action),h=model.w1.map((w,j)=>Math.tanh(w.reduce((s,v,k)=>s+v*x[k],model.b1[j])));
 return 100*(model.b2+model.w2.reduce((s,v,k)=>s+v*h[k],0));
}
export function trainGatedC21(data){
 const audit=evaluateC21(data,{bootstraps:100});
 if(!audit.gate.passes)return {schema:'fpsarena-c21-neural-training-gate-v1',allowed:false,
  reasons:['Insufficient independent matches, arm coverage or nonzero outcomes'],audit:audit.gate,
  model:null,productionPromotionAllowed:false};
 const {records}=validateC21(data),complete=records.filter(r=>!r.outcome.censored);
 // Match disjoint and deterministic. Repeated offers from one match remain together.
 const keys=[...new Set(complete.map(r=>r.matchId))].sort();
 const testKeys=new Set(keys.filter((_,i)=>i%5===0)),train=complete.filter(r=>!testKeys.has(r.matchId)),test=complete.filter(r=>testKeys.has(r.matchId));
 if(testKeys.size<6||train.length<50||test.length<20||C21_ACTIONS.some(a=>!train.some(r=>r.selectedAction===a)||!test.some(r=>r.selectedAction===a)))
  return {schema:'fpsarena-c21-neural-training-gate-v1',allowed:false,reasons:['Insufficient match-disjoint holdout coverage'],audit:audit.gate,
   model:null,productionPromotionAllowed:false};
 const model=fitC21ExperimentalMLP(train),globalMean=train.reduce((s,r)=>s+r.value,0)/train.length,
  armMeans=Object.fromEntries(C21_ACTIONS.map(a=>{const xs=train.filter(x=>x.selectedAction===a);return [a,xs.reduce((s,r)=>s+r.value,0)/xs.length];}));
 const mse=fn=>test.reduce((sum,r)=>sum+(r.value-fn(r))**2,0)/test.length;
 const evaluation={testMatches:testKeys.size,testWindows:test.length,trainMatches:keys.length-testKeys.size,
  modelRMSE:Math.sqrt(mse(r=>predictC21ExperimentalMLP(model,r.publicFeatures,r.selectedAction))),
  zeroRMSE:Math.sqrt(mse(()=>0)),globalMeanRMSE:Math.sqrt(mse(()=>globalMean)),
  armMeanRMSE:Math.sqrt(mse(r=>armMeans[r.selectedAction]))};
 return {schema:'fpsarena-c21-neural-training-gate-v1',allowed:true,model,evaluation,
  productionPromotionAllowed:false,
  limitations:['Holdout predictions are diagnostic only','Prospective independent match-level evaluation required before deployment']};
}
