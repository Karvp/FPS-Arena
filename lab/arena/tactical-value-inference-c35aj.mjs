/** C35-AJ: offline experimental tactical Q-like factual value predictor.
 * Predicts held-out outcomes; not validated for live action selection.
 * Only uses PUBLIC PRE-ASSIGNMENT snapshots. Server-private post-step
 * physical metrics and rewards MUST NEVER enter policy input.
 */
export const C35AJ_OFFLINE_ONLY=true;
export const C35AJ_ARMS=Object.freeze(['incumbent','option-a','option-b']);
const GUNS=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'];
const MAPS=['foundry','neon','arena'],OPPS=['stress','official','mixed'];
const NUM=['distance','ageMs','angleDeg','hp','enemyCount','fire','aim','near','far','incumbentRadial','incumbentHeuristic'];
const KEYS=['forward','backward','left','right'];
export function vectorC35AJ(record,arm,{action=true}={}){
 if(!C35AJ_ARMS.includes(arm)||!record?.features||!Array.isArray(record.menu)||record.menu.length!==2||!record.incumbent)throw Error('C35AJ invalid public snapshot');
 const f=record.features,a=Number(record.menu[0].heuristic),b=Number(record.menu[1].heuristic);
 if(![a,b,record.lagMs].every(Number.isFinite))throw Error('C35AJ invalid heuristics or lag');
 const v=[...NUM.map(k=>Number(f[k]||0)),...GUNS.map(g=>+(record.gun===g)),...MAPS.map(m=>+(record.map===m)),...OPPS.map(m=>+(record.opponents===m)),record.lagMs/250,...KEYS.map(k=>+!!record.incumbent[k]),a,b,a-b];
 if(action){v.push(...C35AJ_ARMS.map(t=>+(t===arm)));v.push(...C35AJ_ARMS.map(t=>+(t===arm)*Number(f.aim||0)));
  v.push(...C35AJ_ARMS.map(t=>+(t===arm)*Number(f.distance||0)/100));v.push([Number(f.incumbentHeuristic),a,b][C35AJ_ARMS.indexOf(arm)]);}
 if(!v.every(Number.isFinite))throw Error('C35AJ nonfinite public input');return v;
}
function dot(a,b){if(a.length!==b.length)throw Error('C35AJ dimension mismatch');return a.reduce((sum,v,i)=>sum+v*b[i],0);}
export function predictOfflineC35AJ(model,vector){
 if(!model||!Array.isArray(model.scalerMean)||model.scalerMean.length!==vector.length||!Array.isArray(model.scalerScale)||model.scalerScale.length!==vector.length)throw Error('C35AJ invalid model');
 let x=vector.map((v,i)=>(v-model.scalerMean[i])/model.scalerScale[i]);
 if(model.kind==='ridge')return dot(x,model.coefficients)+model.intercept;
 if(model.kind!=='mlp-tanh')throw Error('C35AJ unsupported artifact');
 for(let layer=0;layer<model.weights.length;layer++){
  const W=model.weights[layer],b=model.biases[layer];
  x=b.map((bias,j)=>bias+x.reduce((sum,v,i)=>sum+v*W[i][j],0));
  if(layer<model.weights.length-1)x=x.map(Math.tanh);
 }
 if(x.length!==1)throw Error('C35AJ scalar head');return x[0];
}
export function predictFactualOptionC35AJ(weights,record,arm){
 if(!weights||weights.status!=='OFFLINE_ONLY'||weights.productionEnabled!==false)throw Error('C35AJ offline artifact required');
 const m=weights.models[weights.selectedAction];return predictOfflineC35AJ(m,vectorC35AJ(record,arm));
}
