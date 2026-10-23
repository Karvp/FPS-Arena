/** V63 Python Ridge -> JavaScript shadow inference. NEVER alters game controls.
 * Score only from public pre-intervention fields and assigned research arm.
 */
import {publicVectorV62,V62_ARMS} from './tdm-shadow-critic-v62.mjs';
const finite=Number.isFinite;
const INDEX=Object.freeze([0,1,3,4,5,7,8,9,10,11,12,13,14,15,16,17]);
const dot=(x,y)=>x.reduce((sum,v,i)=>sum+v*y[i],0);
function part(f,x) {
 const z=x.map((v,i)=>{
  const mu=f.stateMu?.[i],scale=f.stateScale?.[i];
  if(!finite(mu)||!finite(scale)||scale<=0)throw Error('V63_INVALID_NORM');
  return Math.max(-3,Math.min(3,(v-mu)/scale));
 });
 const base=f.stateIntercept+dot(z,f.stateCoefficients);
 const raw=f.interaction?[1,...INDEX.map(i=>z[i])]:[1];
 if(raw.length*4!==f.armEffectsCoefficients.length)throw Error('V63_INVALID_SHAPE');
 return V62_ARMS.map((_,a)=>{
  let delta=0;
  for(let j=0;j<4;j++){
   const centered=(j===a?1:0)-.25;
   for(let k=0;k<raw.length;k++)delta+=f.armEffectsCoefficients[j*raw.length+k]*centered*raw[k];
  }
  return base+delta;
 });
}
export function scoreV63Shadow(model,{publicState,map,weapon}={}) {
 if(model?.schema!=='fpsarena-v63-public-contrastive-shrinkage-v1'||
    model?.researchOnly!==true||model?.policyPromotionAllowed!==false)
  throw Error('V63_RESEARCH_SHADOW_ONLY');
 const x=publicVectorV62({publicState,map,weapon,arm:'keep'}).slice(0,18);
 const armContext=model.modelVariants?.armContext;
 if(!armContext ||armContext.variant!=='armContext')throw Error('V63_MISSING_MODEL');
 const u=part(armContext.utility,x);
 const h=part(armContext.hazard,x).map(v=>Math.min(.999,Math.max(.001,v)));
 if(![...u,...h].every(finite))throw Error('V63_NUMERIC_OVERFLOW');
 return {utility:u,hazard:h,arms:[...V62_ARMS],shadow:true};
}
export function proposeV63ResearchOnly(score,{minGain=.15,maxRiskIncrease=.025}={}) {
 const u=score?.utility,h=score?.hazard;
 if(!Array.isArray(u)||!Array.isArray(h)||u.length!==4||h.length!==4)throw Error('V63_BAD_SCORES');
 const allowed=[0];
 for(let i=1;i<4;i++)if(u[i]-u[0]>=minGain&&h[i]<=h[0]+maxRiskIncrease)allowed.push(i);
 allowed.sort((i,j)=>u[j]-u[i]||h[i]-h[j]||i-j);
 return {arm:V62_ARMS[allowed[0]],shadow:true,mayApplyToGame:false};
}
