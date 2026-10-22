/** C35AF: standalone OFFLINE inference for frozen exploratory 3s combat models.
 * It is never imported from train-main.mjs or from production page-agent.js.
 * Predictions of unselected actions are hypotheses, NOT factual labels.
 */
export function inferC35AF(artifact,features){
 if(!artifact||!Array.isArray(features)||!Array.isArray(artifact.scalerMean)||!Array.isArray(artifact.scalerScale)||
  features.length!==artifact.scalerMean.length||features.length!==artifact.scalerScale.length||
  features.some(x=>!Number.isFinite(x)))throw Error('C35AF invalid offline inference features');
 let x=features.map((v,i)=>{
  const s=artifact.scalerScale[i];if(!Number.isFinite(s)||s<=0||!Number.isFinite(artifact.scalerMean[i]))throw Error('C35AF scaler corruption');
  return (v-artifact.scalerMean[i])/s;
 });
 if(artifact.type==='ridge'){
  if(x.length!==artifact.coefficients.length||!Number.isFinite(artifact.intercept))throw Error('C35AF ridge shape mismatch');
  return x.reduce((a,v,i)=>a+v*artifact.coefficients[i],artifact.intercept);
 }
 if(artifact.type!=='mlp-tanh'||!Array.isArray(artifact.weights)||!Array.isArray(artifact.biases)||!artifact.weights.length||artifact.weights.length!==artifact.biases.length)throw Error('C35AF unrecognized offline model');
 for(let layer=0;layer<artifact.weights.length;layer++){
  const w=artifact.weights[layer],bias=artifact.biases[layer];if(!Array.isArray(w)||w.length!==x.length||!Array.isArray(bias)||bias.length===0)throw Error('C35AF MLP layer shape');
  x=bias.map((b,j)=>{
   let v=b;for(let i=0;i<w.length;i++){if(!Array.isArray(w[i])||w[i].length!==bias.length||!Number.isFinite(w[i][j]))throw Error('C35AF MLP weight corruption');v+=x[i]*w[i][j];}
   return layer===artifact.weights.length-1?v:Math.tanh(v);
  });
 }
 if(x.length!==1||!Number.isFinite(x[0]))throw Error('C35AF invalid MLP result');return x[0];
}
export function featuresC35AF({gun,baselineADS,targetRange,aimAngleDeg,speed,lagMs},toggle=false){
 const guns=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'];
 if(!guns.includes(gun)||![targetRange,aimAngleDeg,speed,lagMs].every(Number.isFinite))throw Error('C35AF invalid public inputs');
 const ads=baselineADS?1:0,t=toggle?1:0;
 return [ads,Math.min(120,targetRange)/100,Math.min(90,aimAngleDeg)/90,Math.min(12,speed)/12,lagMs/250,
   ...guns.map(w=>+(w===gun)),t,t*ads,t*(1-ads)];
}
