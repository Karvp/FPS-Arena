/** V68 research-only survival-aware acquisition guard.
 * Uses the V67 frozen A* controller without mutating its source. Public only.
 */
import {V67AcquisitionTrial} from './tdm-public-acquisition-v67.mjs';
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {rayWorld} from './source-main/shared/geometry.js';

export const V68_ARMS=Object.freeze(['keep','route','guarded-route','guarded-flank']);
export const V68_SCHEMA='fpsarena-v68-public-exposure-capped-acquisition-v1';
const MOVEMENT=['forward','backward','left','right'];
const finite=Number.isFinite;
const team=v=>v===0||v==='red'?0:v===1||v==='blue'?1:null;
const fields=['x0','x1','y0','y1','z0','z1'];
const validBoxes=boxes=>Array.isArray(boxes)&&boxes.length<=2000&&boxes.every(b=>
  fields.every(k=>finite(b?.[k]))&&b.x0<=b.x1&&b.y0<=b.y1&&b.z0<=b.z1);

export function publicExposureV68(client,now,{maxAge=.275}={}){
 const p=client?.pos,boxes=client?.map?.boxes;
 const hp=client?.local?.hp;
 if(![now,p?.x,p?.y,p?.z,hp].every(finite)||client?.local?.alive!==true||
   !validBoxes(boxes))
  return {valid:false,reason:'missing-own-state-or-map',noPrivateState:true};
 const q=publicHostilesC35K(client,now,{maxAge});
 if(!q.valid)return {valid:false,reason:q.reason,noPrivateState:true};
 const eye=[p.x,p.y+1.5,p.z];
 let visibleClose=0,visibleMid=0,minVisible=Infinity,visible=0;
 for(const hostile of q.hostiles){
  const target=hostile.pos;
  const dx=target.x-p.x,dz=target.z-p.z;
  const d=Math.hypot(dx,dz);
  if(d>65||d<.1)continue;
  const ray=[dx,target.y+1-eye[1],dz];
  const rayLength=Math.hypot(...ray);
  if(!(rayLength>.1))continue;
  const hit=rayWorld(eye,ray.map(v=>v/rayLength),boxes,rayLength);
  if(hit<rayLength-.0001)continue;
  visible++;minVisible=Math.min(minVisible,d);
  if(d<32)visibleClose++;
  else if(d<55)visibleMid++;
 }
 let supporters=0;
 for(const ally of client?.remotes?.list??[]){
  if(team(ally?.team??ally?.tm)!==q.localTeam||
    ally?.alive!==true||ally?.invisible===true)continue;
  const pos=ally?.pos,last=ally?.buf?.at(-1)?.t;
  if(![pos?.x,pos?.y,pos?.z,last].every(finite)||now-last<0||now-last>maxAge)continue;
  if(Math.hypot(pos.x-p.x,pos.z-p.z)<20)supporters++;
 }
 const lowHP=hp<82;
 const criticalHP=hp<65;
 const unsupported=visibleClose>0&&supporters===0;
 const crossfire=visibleClose>=2||(visibleClose+visibleMid>=3&&supporters===0);
 const highRisk=criticalHP||crossfire||unsupported||(lowHP&&visibleClose+visibleMid>0);
 const riskScore=visibleClose*1.1+visibleMid*.6+(lowHP?1.1:0)+(criticalHP?1.3:0)
   -(supporters>0?.35:0);
 return {valid:true,noPrivateState:true,reason:null,
   hp:+hp.toFixed(3),visibleClose,visibleMid,visible,
   nearestVisible:Number.isFinite(minVisible)?+minVisible.toFixed(3):null,
   nearbyAllies:supporters,unsupported,crossfire,lowHP,criticalHP,
   highRisk,riskScore:+riskScore.toFixed(4)};
}

export class V68GuardedTrial extends V67AcquisitionTrial {
 constructor({arm='keep',weapon='aa12',seed=1,...options}={}){
  if(!V68_ARMS.includes(arm))throw Error('V68_BAD_ARM');
  const baseArm=arm==='keep'?'keep':arm==='route'?'route':
    arm==='guarded-route'?'route':'flank';
  super({arm:baseArm,weapon,seed,...options});
  this.v68Arm=arm;
  this.guarded=arm.startsWith('guarded-');
  this.maxChangedTicks=this.guarded?520:1050;
  this.gatedTicks=0;this.safetyStopChanged=0;this.exposureSamples=0;
  this.publicExposureValid=0;this.publicExposureUnavailable=0;
  this.highRiskTicks=0;this.highRiskExamples=[];
  this.budgetExhaustedTicks=0;this.riskMode='neutralize-wasd-under-visible-threat';
  this.maxRiskScore=0;
 }
 beforeStep({tick,now,client,command}){
  // Parent still owns pre-action cue, immutable prefix and treatment timing.
  const active=this.triggerTick!==null&&tick>this.triggerTick&&
    tick<=this.triggerTick+this.treatmentTicks;
  if(!active||!this.guarded)
   return super.beforeStep({tick,now,client,command});
  if(!this.prestate)throw Error('V68_NO_PREBRANCH_WITNESS');
  this.exposureSamples++;
  const risk=publicExposureV68(client,now);
  if(risk.valid){
   this.publicExposureValid++;
   this.maxRiskScore=Math.max(this.maxRiskScore,risk.riskScore);
  }else this.publicExposureUnavailable++;
  // Bounded budget: actor abstains to baseline after 520 actual motor changes.
  if(this.changedTicks>=this.maxChangedTicks){
   this.activeTicks++;
   this.budgetExhaustedTicks++;
   return {...command};
  }
  if(!risk.valid){
   this.activeTicks++;
   this.stops['risk-unavailable']=(this.stops['risk-unavailable']??0)+1;
   return {...command};
  }
  if(risk.highRisk){
   this.activeTicks++;
   this.gatedTicks++;this.highRiskTicks++;
   this.stops['public-high-risk']=(this.stops['public-high-risk']??0)+1;
   if(this.highRiskExamples.length<8)
    this.highRiskExamples.push({tick,hp:risk.hp,close:risk.visibleClose,
     mid:risk.visibleMid,allies:risk.nearbyAllies,score:risk.riskScore});
   // This is neutral WASD, NOT a guaranteed safe retreat. Shooting/aim unchanged.
   const out={...command};
   for(const k of MOVEMENT)out[k]=false;
   if(MOVEMENT.some(k=>!!command[k]!==!!out[k])){
    this.changedTicks++;this.safetyStopChanged++;this.commandChecks++;
    if(this.examples.length<8)this.examples.push({tick,why:'public-risk-neutral',
     before:MOVEMENT.map(k=>+!!command[k]).join(''),
     after:'0000'});
   }
   return out;
  }
  return super.beforeStep({tick,now,client,command});
 }
 finish(){
  const result=super.finish();
  return {...result,schema:V68_SCHEMA,arm:this.v68Arm,
   guarded:this.guarded,baseNavigationArm:result.arm,
   publicExposureProvenance:'publicHostilesC35K + public static map rayWorld + own HP + public teammates',
   noPrivilegedActorInput:true,
   publicRiskBeforeGameStep:true,maxChangedTicks:this.maxChangedTicks,
   exposureSamples:this.exposureSamples,publicExposureValid:this.publicExposureValid,
   publicExposureUnavailable:this.publicExposureUnavailable,
   gatedTicks:this.gatedTicks,highRiskTicks:this.highRiskTicks,
   safetyStopChanged:this.safetyStopChanged,budgetExhaustedTicks:this.budgetExhaustedTicks,
   maximumObservedRiskScore:this.maxRiskScore,
   highRiskExamples:this.highRiskExamples,
   researchOnly:true,productionAllowed:false,allNonWASDUnchanged:true};
 }
}
