/** V61 public engagement evidence trigger for deterministic tactical replay.
 * Research-only: no server information is consulted for the trigger or actions.
 * Freeze the V60 discovery controller and runner; extend via a separate runner.
 */
import {V60BranchTrial, V60_ARMS, publicStateV60} from './tdm-stratified-replay-v60.mjs';
import {forwardVec} from './source-main/shared/geometry.js';
import {WEAPONS} from './source-main/shared/weapons.js';

export const V61_STRATA=Object.freeze(['post-fire','post-damage','aim-lock']);
export const V61_SCHEMA='fpsarena-v61-public-combat-evidence-trigger-v1';
const finite=Number.isFinite;

export function cueV61(client,now,cmd,{weapon='uzi',recentFireTicks=Infinity,recentDamageTicks=Infinity,aimDurationTicks=0}={}){
 const publicState=publicStateV60(client,now,cmd,{weapon,recentDamage:recentDamageTicks<=120});
 if(!publicState.valid)return {valid:false,reason:publicState.reason,publicState};
 const maxRange=WEAPONS[weapon]?.maxRange, distance=publicState.distance;
 if(!finite(maxRange)||!finite(distance)||distance<2||distance>Math.min(95,maxRange*1.45))
  return {valid:false,reason:'range-not-engaged',publicState};
 const p=client.pos,t=publicState.targetPos;
 const v=forwardVec(client.rig.yaw,client.rig.pitch);
 const dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz);
 const facing= (v[0]*dx+v[2]*dz)/d;
 const aimAlignment = Math.max(-1,Math.min(1, facing));
 const matched={
  'post-fire':recentFireTicks>=1&&recentFireTicks<=120,
  'post-damage':recentDamageTicks<=120,
  'aim-lock':aimDurationTicks>=18&&aimAlignment>=.9&&distance<=maxRange*.95
 };
 const evidence=Object.entries(matched).filter(([k,v])=>v).map(([k])=>k);
 return {valid:evidence.length>0,reason:evidence.length?'public-combat-cue':'no-recent-combat-cue',
  evidence,publicState,aimAlignment:+aimAlignment.toFixed(4),recentFireTicks,recentDamageTicks,aimDurationTicks};
}

export class V61EngagementTrial extends V60BranchTrial{
 constructor({arm='keep',stratum='post-fire',weapon='uzi',seed=1,earliestTick=900,latestTick=4200,treatmentTicks=150,outcomeTicks=480,confirmationSamples=2,sampleEvery=6}={}){
  if(!V61_STRATA.includes(stratum)||!V60_ARMS.includes(arm))throw Error('V61_BAD_CONFIG');
  super({arm,stratum:'contact',weapon,seed,earliestTick,latestTick,treatmentTicks,outcomeTicks,confirmationSamples,sampleEvery});
  this.stratum=stratum;this.fireAt=-Infinity;this.damageAt=-Infinity;
  this.lastPublicHP=null;this.aimTicks=0;this.cueCounts={};this.cueSelected=null;
 }
 beforeStep({tick,now,client,command}){
  const base={...command};
  const hp=client?.local?.hp;
  if(finite(hp)&&finite(this.lastPublicHP)&&hp<this.lastPublicHP-.1)this.damageAt=tick;
  if(finite(hp))this.lastPublicHP=hp;
  const lastFire=this.fireAt;
  if(base.fire===true)this.fireAt=tick;
  this.aimTicks=(base.aim===true||base.ads===true)?this.aimTicks+1:0;
  if(this.triggerTick!==null){
   return super.beforeStep({tick,now,client,command:base});
  }
  this.prefix.update(JSON.stringify({tick,command:base})+'\n');
  if(tick>=this.nextEligibleTick&&tick<=this.latestTick&&(tick-this.nextEligibleTick)%this.sampleEvery===0){
   const c=cueV61(client,now,base,{weapon:this.weapon,recentFireTicks:tick-lastFire,
    recentDamageTicks:tick-this.damageAt,aimDurationTicks:this.aimTicks});
   this.lastSampleTick=tick;
   const ok=c.valid&&c.evidence.includes(this.stratum);
   this.cueCounts[c.reason]=(this.cueCounts[c.reason]??0)+1;
   if(ok){
    if(this.firstEligibleTick===null)this.firstEligibleTick=tick;
    this.streak++;
    if(this.streak>=this.confirmationSamples){
     this.triggerTick=tick;
     this.triggerFeature={...c.publicState,cue:this.stratum,aimAlignment:c.aimAlignment,
      ageSinceLastFire:c.recentFireTicks,ageSinceLastDamage:c.recentDamageTicks,publicAimTicks:c.aimDurationTicks};
     this.cueSelected=this.stratum;this.prefixSHA256=this.prefix.digest('hex');
    }
   }else{
    this.streak=0;
    this.rejectionCounts[c.reason]=(this.rejectionCounts[c.reason]??0)+1;
   }
  }
  return base;
 }
 finish(){
  const base=super.finish();
  return {...base,schema:V61_SCHEMA,triggerCue:this.cueSelected,publicCueCounts:this.cueCounts,
   triggerSource:'only command, local HP, delayed public remote snapshot and camera; no server information',
   prebranchOnly:true,productionAllowed:false};
 }
}
