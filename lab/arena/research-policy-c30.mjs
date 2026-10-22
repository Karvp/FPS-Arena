// C30 — OOD-audited model on client-visible geometry only; research lab only.
// The remote yaw is body yaw from delayed PUBLIC snapshot, not authoritative aim.
import {SafeActionExplorerC16} from './safe-action-explorer-c16.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const C30_WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'];
export const C30_POLICIES=['baseline','simple','neural'];
export const FEATURE_NAMES=['distance/100','lagSeconds/.25','baseLateralVelocity/12','bodyYawLateralRatio',...C30_WEAPONS.map(x=>`weapon=${x}`)];
const finite=Number.isFinite, sha=s=>createHash('sha256').update(s).digest('hex');
const validMatrix=(x,n,m)=>Array.isArray(x)&&x.length===n&&x.every(y=>Array.isArray(y)&&y.length===m&&y.every(finite));
export function readFrozenC30(file){
 const txt=readFileSync(file,'utf8'),m=JSON.parse(txt),w=m.weights;
 if(m.schema!=='fpsarena-c30-observable-state-value-v1'||JSON.stringify(m.featureNames)!==JSON.stringify(FEATURE_NAMES)||
 !w||!validMatrix(w['net.0.weight'],24,10)||!validMatrix(w['net.2.weight'],12,24)||!validMatrix(w['net.4.weight'],3,12)||
 ![24,12,3].every((n,i)=>Array.isArray(w[`net.${i*2}.bias`])&&w[`net.${i*2}.bias`].length===n&&w[`net.${i*2}.bias`].every(finite)))
 throw Error('invalid C30 neural model');
 return {weights:w,modelSourceSHA256:sha(txt),preselectedPolicy:m.preselectedPolicy,trainingRegistration:m.registrationSHA256};
}
function layer(xs,w,b,kind){return w.map((r,i)=>{let y=b[i];for(let j=0;j<r.length;j++)y+=r[j]*xs[j];return kind==='tanh'?Math.tanh(y):1/(1+Math.exp(-y));});}
export function neuralLossC30(model,x){
 if(!Array.isArray(x)||x.length!==10||!x.every(finite))throw Error('invalid C30 features');
 const w=model.weights;return layer(layer(layer(x,w['net.0.weight'],w['net.0.bias'],'tanh'),w['net.2.weight'],w['net.2.bias'],'tanh'),w['net.4.weight'],w['net.4.bias'],'sigmoid');
}
export function publicModelFeaturesC30(client,now,lagMs){
 const p=client?.pos,m=client?.local?.mv;
 if(!p||!m||!finite(now)||!finite(lagMs)||lagMs<0||lagMs>250||![p.x,p.z,m.vx,m.vz].every(finite))return {ok:false,reason:'missing-own-public-motion'};
 const remotes=(client?.remotes?.list||[]).filter(e=>e?.alive&&e.team!==client?.local?.team&&
  [e?.pos?.x,e?.pos?.z,e?.yaw].every(finite));
 remotes.sort((a,b)=>Math.hypot(a.pos.x-p.x,a.pos.z-p.z)-Math.hypot(b.pos.x-p.x,b.pos.z-p.z)||String(a.id).localeCompare(String(b.id)));
 if(!remotes.length)return {ok:false,reason:'missing-public-hostile'};
 const e=remotes[0],stamp=e.buf?.at(-1)?.t,weapon=String(e.data?.w||'').toLowerCase();
 if(!finite(stamp)||now-stamp>.22||now-stamp<-.05)return {ok:false,reason:'stale-remote'};
 if(!C30_WEAPONS.includes(weapon))return {ok:false,reason:'unrepresented-weapon',weapon};
 const dx=p.x-e.pos.x,dz=p.z-e.pos.z,distance=Math.hypot(dx,dz);
 if(distance<24||distance>100||distance<1e-6)return {ok:false,reason:'outside-transfer-distance',distance};
 const offset=Math.cos(e.yaw)*dx-Math.sin(e.yaw)*dz;
 const ux=dx/distance,uz=dz/distance,baseVelocity=-uz*m.vx+ux*m.vz;
 // Physical support, NOT C28's artificial ±3 meter gate. No silent clipping.
 if(Math.abs(offset)>distance+1e-4||Math.abs(baseVelocity)>12)return {ok:false,reason:'outside-transfer-kinematics',offset,baseVelocity,distance};
 const features=[distance/100,(lagMs/1000)/.25,baseVelocity/12,offset/distance,...C30_WEAPONS.map(w=>+(w===weapon))];
 if(!features.every(finite))return {ok:false,reason:'nonfinite-features'};
 return {ok:true,features,weapon,distance,offset,baseVelocity,snapshotAge:now-stamp,
  source:'delayed client remote BODY yaw, own public position and velocity; NOT shooter aim'};
}
export class ResearchPolicyC30 extends SafeActionExplorerC16{
 constructor({seed,mode,map,loadout,policy,model,lagMs,...opts}={}){
  if(!C30_POLICIES.includes(policy)||!model||!finite(lagMs)||lagMs<0||lagMs>250)throw Error('invalid C30 configuration');
  super({seed,mode,map,loadout,assignment:{arm:policy==='baseline'?'control':'treatment',design:'c30-preassigned-common-seed-3-policy',unit:'match',randomized:false,assignmentProbability:1},...opts});
  this.policy=policy;this.model=model;this.lagMs=lagMs;this.transfer={eligible:0,valid:0,proposedActs:0,
   fallbacks:{},selected:{baseline:0,'micro-left':0,'micro-right':0}};
 }
 command(now,client,original){
  const size=this.offers.length,ret=super.command(now,client,original);
  if(size===this.offers.length)return ret;
  const o=this.offers.at(-1);this.transfer.eligible++;
  if(this.policy==='baseline'){
   this.transfer.selected.baseline++;o.c30={policy:this.policy,reason:'incumbent-control',selected:'baseline'};return ret;
  }
  const f=publicModelFeaturesC30(client,now,this.lagMs);
  if(!f.ok){
   this.transfer.fallbacks[f.reason]=(this.transfer.fallbacks[f.reason]||0)+1;
   this.interventionTicks--;this.current=null;this.activeUntil=-1;
   o.selectedAction='baseline';o.c30={policy:this.policy,reason:f.reason,selected:'baseline'};
   this.transfer.selected.baseline++;return {...original};
  }
  this.transfer.valid++;
  const prediction=this.policy==='neural'?neuralLossC30(this.model,f.features):null;
  const k=prediction?prediction.indexOf(Math.min(...prediction)):1;
  const action=['baseline','micro-left','micro-right'][k];
  o.c30={policy:this.policy,selected:action,publicFeatureValues:f.features,
   inputSource:f.source,modelSourceSHA256:this.model.modelSourceSHA256,
   prediction:prediction?.map(x=>+x.toFixed(7))||null};
  o.selectedAction=action;this.transfer.selected[action]++;
  if(action==='baseline'){
   this.interventionTicks--;this.activeUntil=-1;this.current=null;return {...original};
  }
  this.transfer.proposedActs++;
  return {...original,[action==='micro-left'?'left':'right']:true};
 }
 finish(t){
  const r=super.finish(t);r.schema='fpsarena-c30-full-game-transfer-v1';
  r.metadata.c30={policy:this.policy,modelSHA256:this.model.modelSourceSHA256,
   trainingRegistration:this.model.trainingRegistration,productionActuation:false,lagMs:this.lagMs};
  r.diagnostics.c30=this.transfer;
  return r;
 }
}
