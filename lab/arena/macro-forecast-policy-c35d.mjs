// C35-D2: RESEARCH ONLY. Calibrated on an independent PASSIVE public-command cohort.
// Produces predecision forecasts, not combat truth and never bypasses C16/C21.
import {priorityC35D,publicFeaturesC35D} from './public-macro-transition-c35d.mjs';
const NAMES=['quietMs','priorityFraction500','priorityEdges1000','aim','moving'];
const finite=Number.isFinite;
export function validateFrozenForecastC35D(model){
 if(model?.schema!=='fpsarena-c35d-frozen-public-forecast-v1'||model.transitionHorizonMs!==120||
  JSON.stringify(model.featureNames)!==JSON.stringify(NAMES)||!Array.isArray(model.weights)||model.weights.length!==6||
  !model.weights.every(finite)||!finite(model.riskThreshold)||model.riskThreshold<0||model.riskThreshold>0.1||
  !/^[a-f0-9]{64}$/.test(model.registrationSHA256))throw Error('invalid frozen causal forecast');
 return Object.freeze({...model,weights:Object.freeze([...model.weights])});
}
export function probabilityC35D(model,f){
 const m=validateFrozenForecastC35D(model);
 if(!f||!NAMES.every(k=>finite(f[k])))throw Error('malformed public history');
 const x=[1,Math.log1p(Math.min(5000,Math.max(0,f.quietMs)))/Math.log1p(5000),
  Math.min(1,Math.max(0,f.priorityFraction500)),Math.min(10,Math.max(0,f.priorityEdges1000))/10,f.aim,f.moving];
 const logit=m.weights.reduce((v,w,i)=>v+w*x[i],0);
 return 1/(1+Math.exp(-Math.max(-35,Math.min(35,logit))));
}
export class PublicPriorityForecasterC35D{
 constructor(model){this.model=validateFrozenForecastC35D(model);this.history=[];
  this.quietSinceMs=null;this.lastNowMs=-Infinity;this.observations=0;}
 observe(nowMs,cmd){
  if(!finite(nowMs)||nowMs<this.lastNowMs-.001)throw Error('C35D nonmonotonic priority clock');
  if(!cmd||typeof cmd!=='object')throw Error('C35D invalid public command');
  this.lastNowMs=nowMs;this.observations++;
  const busy=priorityC35D(cmd);
  if(busy)this.quietSinceMs=null;else if(this.quietSinceMs===null)this.quietSinceMs=nowMs;
  this.history.push({time:nowMs,busy});
  while(this.history.length>1&&nowMs-this.history[0].time>1020)this.history.shift();
  const f=publicFeaturesC35D(this.history,nowMs,this.quietSinceMs,cmd);
  const risk=probabilityC35D(this.model,f);
  return {source:'public-prediction',kind:'engage',type:'frozen-public-history-logistic-120ms',
   nextPriorityEtaMs:!busy&&risk<=this.model.riskThreshold?250:0,
   predictedPriorityRisk120ms:risk,
   historicalQuietMs:Math.round(f.quietMs*1000)/1000,
   trainingRegistrationSHA256:this.model.registrationSHA256};
 }
}
