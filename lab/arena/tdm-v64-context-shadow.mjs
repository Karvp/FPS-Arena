/** V64 context-action regression shadow runtime; no game control path. */
import {publicVectorV62,V62_ARMS} from './tdm-shadow-critic-v62.mjs';
function clip(v,l,h){return Math.max(l,Math.min(h,v))}
const finite=Number.isFinite;
const safe=(v,max)=>finite(v)?clip(v,0,max)/max:0;
export function v64FeatureVector({publicState,context,map,weapon,arm,variant='context-action'}) {
 if(!context||context.valid!==true||context.noPrivateServerInput!==true)
  throw Error('V64_PUBLIC_CONTEXT_REQUIRED');
 const old=publicVectorV62({publicState,map,weapon,arm}).slice(0,18);
 const extra=[
  +!!context.los3DClear,
  +!!context.coverFootprint,
  safe(context.interveningCoverCount,6),
  safe(context.nearbyCoverDistance,40),
  safe(context.teammatesNearby20m,3),
  safe(context.teammatesSupportingTarget25m,3),
  safe(context.visibleEnemies,6),
  safe(context.snapshotAge,.275),
  +!!context.validMotion,
  finite(context.radialSpeed)?clip(context.radialSpeed/12.5,-1,1):0,
  finite(context.lateralSpeed)?clip(context.lateralSpeed/12.5,-1,1):0,
  safe(context.motionSpeed,12.5)
 ];
 const rich=variant.startsWith('context');
 const action=variant.endsWith('-action');
 const state=rich?[...old,...extra]:old;
 if(!action)return state;
 const oneHot=V62_ARMS.map(a=>+(a===arm));
 const fixed=[state[0],state[3],state[4],rich?state.at(-12):0];
 const interactions=oneHot.flatMap(bit=>fixed.map(x=>x*bit));
 return [...state,...oneHot,...interactions];
}
function predictOne(model,x,key){
 const params=model.model.variants[key];
 const xz=x.map((v,i)=>{
  const std=params?.std?.[i],mu=params?.mu?.[i];
  if(!finite(std)||std<=0||!finite(mu))throw Error('V64_BAD_MODEL_NORMALIZATION');
  return clip((v-mu)/std,-3,3);
 });
 const score=head=>params[head].intercept+params[head].weights.reduce((sum,v,i)=>sum+v*xz[i],0);
 return {utility:score('utility'),hazard:clip(score('hazard'),.001,.999)};
}
export function v64ShadowScore(model,{publicState,context,map,weapon,variant='context-action'}={}){
 if(model?.schema!=='fpsarena-v64-public-tactics-ridge-shadow-v1'||
    model.productionUse!==false||model.noPromotion!==true)
  throw Error('V64_SHADOW_ONLY');
 if(!['old-state','old-action','context-state','context-action'].includes(variant))
  throw Error('V64_UNKNOWN_VARIANT');
 const out=V62_ARMS.map(arm=>predictOne(model,v64FeatureVector({publicState,context,map,weapon,arm,variant}),variant));
 if(out.some(o=>!finite(o.utility)||!finite(o.hazard)))throw Error('V64_NUMERIC_FAIL');
 return {arms:[...V62_ARMS],utility:out.map(x=>x.utility),hazard:out.map(x=>x.hazard),
  shadow:true,mayApplyToGame:false};
}
