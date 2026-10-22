/** Pure offline C35-AG 1s-prefix MLP evaluator. Never imported by gameplay. */
export function evaluateSequencePrefixC35AG(model,raw){
 if(model?.schema!=='fpsarena-c35ag-frozen-prefix-neural-v1'||model.status!=='OFFLINE_DESCRIPTIVE_NOT_DEPLOYABLE'||!Array.isArray(model.featureNames)||!Array.isArray(raw)||raw.length!==model.featureNames.length)throw Error('C35AG offline neural schema/shape');
 let x=raw.map((v,i)=>{if(!Number.isFinite(v)||!Number.isFinite(model.scalerMean[i])||!(model.scalerScale[i]>0))throw Error('C35AG invalid feature/scaler');return(v-model.scalerMean[i])/model.scalerScale[i];});
 for(const [i,layer] of model.layers.entries()){
  if(layer.weights.length!==x.length||layer.bias.length!==layer.weights[0]?.length)throw Error('C35AG invalid layer shape');
  x=layer.bias.map((b,j)=>{let v=b;for(let k=0;k<x.length;k++)v+=x[k]*layer.weights[k][j];return i===model.layers.length-1?v:Math.tanh(v);});
 }
 if(x.length!==1||!Number.isFinite(x[0]))throw Error('C35AG invalid prediction');return x[0];
}
