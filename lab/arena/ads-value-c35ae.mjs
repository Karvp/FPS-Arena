/** C35-AE: immutable offline ADS action-value forward pass.
 * Research helper only: it has no hooks into page-agent or Game.step().
 * Accepts a pre-step public feature vector and an explicitly chosen action.
 */
export const C35AE_FEATURE_COUNT=18;
export function encodeADSValueC35AE(rawState, toggle=false, model){
  if(!model||model.encoder!=='c35ae-public-prestep-v1'||!Array.isArray(rawState)||rawState.length!==C35AE_FEATURE_COUNT||rawState.some(x=>!Number.isFinite(x)))throw Error('C35AE invalid public pre-step input');
  const state=rawState.slice();
  if(model.actionFeatures?.length){const t=toggle?1:0;state.push(t,t*state[0],t*state[1]/100,t*state[2]/14,t*state[4]/10,t*state[7]/4);}
  if(state.length!==model.mean?.length||state.length!==model.scale?.length)throw Error('C35AE frozen model shape mismatch');
  return state.map((x,i)=>{const s=model.scale[i];if(!Number.isFinite(s)||s<=0)throw Error('C35AE invalid scale');return (x-model.mean[i])/s;});
}
export function predictADSValueC35AE(model,rawState,toggle=false){
  let vals=encodeADSValueC35AE(rawState,toggle,model);
  if(!Array.isArray(model.layers)||!model.layers.length)throw Error('C35AE missing layers');
  for(const layer of model.layers){
    const W=Array.isArray(layer.weights[0])?layer.weights:[layer.weights];
    const B=Array.isArray(layer.bias)?layer.bias:[layer.bias];
    if(W.length!==B.length||W.some(row=>row.length!==vals.length))throw Error('C35AE bad dense weights');
    vals=W.map((row,j)=>{
      let n=B[j];for(let i=0;i<vals.length;i++)n+=row[i]*vals[i];
      if(layer.activation==='relu')return Math.max(n,0);
      if(layer.activation==='sigmoid')return 1/(1+Math.exp(-Math.max(-50,Math.min(50,n))));
      throw Error('C35AE unknown activation');
    });
  }
  if(vals.length!==1||!Number.isFinite(vals[0])||vals[0]<0||vals[0]>1)throw Error('C35AE invalid probability');
  return vals[0];
}
export function scoreBothADSChoicesC35AE(model,rawState){
  if(!model.actionFeatures?.length)throw Error('C35AE needs action-conditional model');
  return Object.freeze({control:predictADSValueC35AE(model,rawState,false),toggle:predictADSValueC35AE(model,rawState,true)});
}
