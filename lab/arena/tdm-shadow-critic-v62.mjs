/** V62 shadow-only PyTorch -> JS inference parity.
 * Inputs strictly public and pre-branch. Not connected to official TDM controls.
 */
export const V62_ARMS = Object.freeze(['keep','close','strafe','withdraw']);
export const V62_MAPS = Object.freeze(['arena','foundry','neon']);
export const V62_WEAPONS = Object.freeze(['uzi','mp5sd','aa12','m4a1']);
export const V62_CUES = Object.freeze(['aim-lock','post-fire','post-damage']);
const finite = Number.isFinite;
const norm = (x,lim,scale) => finite(x) ? Math.min(lim,Math.max(0,x))/scale : lim/scale;
export function publicVectorV62({publicState: f,map,weapon,arm} = {}) {
 if(!f || f.valid!==true || !V62_CUES.includes(f.cue) ||
 !V62_MAPS.includes(map)||!V62_WEAPONS.includes(weapon)||!V62_ARMS.includes(arm))
  throw Error('V62_INVALID_PUBLIC_INPUT');
 const val = [
  norm(f.distance,100,100),
  norm(f.hp,100,100),
  norm(f.maxRange,175,175),
  norm(f.publicHostiles,8,8),
  finite(f.aimAlignment)?Math.min(1,Math.max(-1,f.aimAlignment)):0,
  norm(f.ageSinceLastFire,121,121),
  norm(f.ageSinceLastDamage,121,121),
  norm(f.publicAimTicks,120,120),
  ...V62_MAPS.map(x=>+(x===map)),
  ...V62_WEAPONS.map(x=>+(x===weapon)),
  ...V62_CUES.map(x=>+(x===f.cue)),
  ...V62_ARMS.map(x=>+(x===arm)),
 ];
 if(val.length!==22||!val.every(finite))throw Error('V62_INVALID_VECTOR');
 return val;
}
function linear(weight,bias,x) {
 if(!Array.isArray(weight)||!Array.isArray(bias)||weight.length!==bias.length)throw Error('V62_INVALID_WEIGHTS');
 return weight.map((row,i)=>{
  if(row.length!==x.length)throw Error('V62_WEIGHT_SHAPE');
  return row.reduce((sum,v,j)=>sum+v*x[j],bias[i]);
 });
}
export function predictV62Shadow(model,{publicState,map,weapon,arm}={}) {
 if(model?.schema!=='fpsarena-v62-research-mlp-shadow-v1'||
  model?.productionUse!==false || model?.policyPromotion!==false)throw Error('V62_SHADOW_ONLY');
 const x=publicVectorV62({publicState,map,weapon,arm}),params=model.modelFit;
 const standardized=x.map((value,i)=>{
  const scale=params?.scales?.[i],mu=params?.means?.[i];
  if(!finite(mu)||!finite(scale)||scale<=0)throw Error('V62_BAD_NORMALIZATION');
  return (value-mu)/scale;
 });
 const w=params.weights;
 const hidden=linear(w['shared.0.weight'],w['shared.0.bias'],standardized).map(v=>Math.tanh(v));
 const utility=linear(w['utility.weight'],w['utility.bias'],hidden)[0];
 const risk=linear(w['hazard.weight'],w['hazard.bias'],hidden)[0];
 const hazardProbability=1/(1+Math.exp(-risk));
 if(!finite(utility)||!finite(hazardProbability))throw Error('V62_NUMERIC_OVERFLOW');
 return {utility,hazardProbability,modelStatus:'shadow-not-calibrated'};
}
