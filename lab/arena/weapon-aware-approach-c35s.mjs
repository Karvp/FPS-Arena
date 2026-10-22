/** C35-S: opt-in headless-only shotgun close-distance macro action.
 * ALL decision features come from delayed public client state before Game.step.
 * Shot/kill labels are not available to this module. No modifications to trigger,
 * aim, yaw/pitch, slot, skill, reload or existing movement are permitted.
 * C16 controls micro separately; this guard is NOT an extension of C16.
 */
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {forwardVec,rayWorld} from './source-main/shared/geometry.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {PLAYER,MOVE,STANCE_H} from './source-main/shared/constants.js';
import {WEAPONS} from './source-main/shared/weapons.js';
export const C35S_SCHEMA='fpsarena-c35s-shotgun-gap-closing-research-v2';
export const C35S_POLICIES=Object.freeze(['observe','approach']);
const finite=Number.isFinite;
const PRIORITY=['skill','use','interact','reload','throw','plate','jump','crouch','slide','prone','lean'];
function moveClear(client,distance){
 const p=client?.pos,m=client?.map,mv=client?.local?.mv,yaw=client?.rig?.yaw;
 if(!p||!m||!mv||!finite(m.bound)||!Array.isArray(m.boxes)||!finite(yaw)||
    ![p.x,p.z,mv.y].every(finite)||!finite(distance)||distance<=0)return false;
 const radius=MOVE.radius+.12,height=STANCE_H[mv.stance??0]||STANCE_H[0];
 for(let i=0;i<=8;i++){
  const t=distance*i/8,x=p.x-Math.sin(yaw)*t,z=p.z-Math.cos(yaw)*t;
  if(Math.abs(x)>m.bound-radius-.15||Math.abs(z)>m.bound-radius-.15)return false;
  for(const b of m.boxes){
   if(!['x0','x1','y0','y1','z0','z1'].every(k=>finite(b[k])))return false;
   if(x+radius>b.x0&&x-radius<b.x1&&z+radius>b.z0&&z-radius<b.z1&&mv.y+height>b.y0&&mv.y+.05<b.y1)return false;
  }
 }
 return true;
}
export function shotgunApproachCandidateC35S(client,cmd,now,{mode='tdm',weapon='aa12',maxAge=.20}={}){
 const reasons=[];
 if(mode!=='tdm')reasons.push('mode');
 if(!finite(now)||now<0)reasons.push('clock');
 const w=WEAPONS[weapon];
 if(!w||w.cat!=='Shotgun'||!Array.isArray(w.range))reasons.push('weapon');
 const mv=client?.local?.mv;
 if(!client?.local?.alive||client.local.down||client.local.frozen||Number(client.local.hp??0)<55||!mv?.onGround||mv.heli||mv.air||mv.hk>0||mv.gs>0||mv.slideT>0)reasons.push('motion-state');
 if(cmd.forward||cmd.backward||cmd.left||cmd.right)reasons.push('busy-movement-or-trigger');
 if(PRIORITY.some(k=>!!cmd?.[k])||finite(cmd?.slot)&&cmd.slot>=0)reasons.push('priority');
 let hostiles=null,chosen=null,dist=null,angle=null,age=null,clear=false;
 if(reasons.length===0){
  hostiles=publicHostilesC35K(client,now,{maxAge});
  if(!hostiles.valid||!hostiles.hostiles.length)reasons.push('no-fresh-hostile');
 }
 if(reasons.length===0){
  const p=client.pos,rig=client.rig,map=client.map;
  if(![p?.x,p?.y,p?.z,rig?.yaw,rig?.pitch].every(finite)||!Array.isArray(map?.boxes))reasons.push('public-geometry');
  else{
   const eye=[p.x,p.y+eyeHeightOf(mv),p.z],look=forwardVec(rig.yaw,rig.pitch);
   const candidates=hostiles.hostiles.map(q=>{
    const center=[q.pos.x,q.pos.y+(q.sliding?PLAYER.slideBodyHeight:PLAYER.bodyH[q.stance??0]??PLAYER.bodyHeight)*.5,q.pos.z];
    const vec=center.map((x,i)=>x-eye[i]),len=Math.hypot(...vec);
    const angle=len>1e-6?Math.acos(Math.max(-1,Math.min(1,vec.reduce((sum,x,i)=>sum+x*look[i],0)/len)))*180/Math.PI:Infinity;
    return {q,center,vec,len,angle,dist:Math.hypot(q.pos.x-p.x,q.pos.z-p.z)};
   }).sort((a,b)=>a.angle-b.angle||String(a.q.id).localeCompare(String(b.q.id)));
   chosen=candidates[0];dist=chosen?.dist??null;angle=chosen?.angle??null;
   age=chosen?now-chosen.q.buf.at(-1).t:null;
   if(!chosen||!finite(angle)||angle>16)reasons.push('off-aim-target');
   // Above shotgun falloff end; do not chase extreme-range silhouettes.
   if(!finite(dist)||!w||dist<=w.range[1]+1||dist>Math.min((w.maxRange??32)*1.5,54))reasons.push('range');
   if(!reasons.length){
    const unit=chosen.vec.map(v=>v/chosen.len);
    clear=rayWorld(eye,unit,map.boxes,chosen.len)>=chosen.len-1e-4;
    if(!clear)reasons.push('static-cover');
    if(!moveClear(client,.8))reasons.push('forward-clearance');
   }
  }
 }
 return {eligible:reasons.length===0,reasons,targetId:chosen?.q?.id??null,
  distance:finite(dist)?+dist.toFixed(4):null,aimAngle:finite(angle)?+angle.toFixed(4):null,
  ageMs:finite(age)?+(age*1000).toFixed(2):null,staticLOS:clear,weapon};
}
export class WeaponAwareApproachC35S{
 constructor({policy='observe',mode='tdm',weapon='aa12',matchId,cooldown=.7,burstTicks=4}={}){
  if(!C35S_POLICIES.includes(policy)||!matchId||!finite(cooldown)||cooldown<.5||!Number.isInteger(burstTicks)||burstTicks<1||burstTicks>6)
   throw Error('C35S invalid research configuration');
  this.policy=policy;this.mode=mode;this.weapon=weapon;this.matchId=matchId;
  this.cooldown=cooldown;this.burstTicks=burstTicks;this.last=-Infinity;this.nextAt=0;this.active=null;
  this.events=[];this.counts={ticks:0,fireTicks:0,eligible:0,episodes:0,modifiedTicks:0,modifiedNonFireTicks:0,
   interrupted:0,completed:0,fireChanged:0,priorityChanged:0,refusals:{}};
 }
 command(now,client,incumbent,applied){
  if(!finite(now)||now<=this.last)throw Error('C35S clock');
  this.last=now;this.counts.ticks++;
  if(incumbent?.fire)this.counts.fireTicks++;
  const unchanged=Object.keys({...incumbent,...applied}).every(k=>incumbent[k]===applied[k]);
  if(incumbent.fire!==applied.fire)throw Error('C35S upstream fire modification');
  if(!unchanged){if(this.active){this.active.interrupted=true;this.counts.interrupted++;this.active=null;}return applied;}
  const gate=shotgunApproachCandidateC35S(client,incumbent,now,{mode:this.mode,weapon:this.weapon});
  if(this.active&&!gate.eligible){this.active.interrupted=true;this.counts.interrupted++;this.active=null;}
  if(!gate.eligible){for(const r of gate.reasons)this.counts.refusals[r]=(this.counts.refusals[r]??0)+1;return applied;}
  if(!this.active){
   if(now+1e-8<this.nextAt)return applied;
   this.nextAt=now+this.cooldown;this.counts.eligible++;this.counts.episodes++;
   if(this.policy==='observe')return applied;
   this.active={t:+now.toFixed(5),targetId:gate.targetId,distance:gate.distance,ageMs:gate.ageMs,
     ticks:0,complete:false,interrupted:false};this.events.push(this.active);
  }
  const modified={...applied,forward:true};
  // Exactly one additional forward key, every other key byte-for-byte identical.
  const changed=Object.keys(modified).filter(k=>modified[k]!==applied[k]);
  if(changed.length!==1||changed[0]!=='forward'||Object.keys(incumbent).some(k=>k!=='forward'&&incumbent[k]!==modified[k])){
   this.counts.priorityChanged++;throw Error('C35S actuation boundary');
  }
  this.counts.modifiedTicks++;if(!incumbent.fire)this.counts.modifiedNonFireTicks++;this.active.ticks++;
  if(this.active.ticks>=this.burstTicks){this.active.complete=true;this.counts.completed++;this.active=null;}
  return modified;
 }
 finish(){
  if(this.active){this.active.censored=true;this.active=null;}
  if(this.counts.fireChanged||this.counts.priorityChanged||this.events.reduce((n,e)=>n+e.ticks,0)!==this.counts.modifiedTicks)throw Error('C35S accounting');
  return {schema:C35S_SCHEMA,scope:'HEADLESS OPT-IN RESEARCH ONLY, v2 nonfire range gap measured; first v1 had zero exposure',policy:this.policy,weapon:this.weapon,matchId:this.matchId,
   guard:'public delayed hostile, aligned shotgun out of falloff, geometry and player-movement priority; NOT C16',counts:this.counts,events:this.events};
 }
}
