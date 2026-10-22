/** C35-T: bounded, opt-in headless target-relative movement redirect.
 * Only delayed public client state is available at decision time. This is a
 * separate macro guard, NOT the C16 authorization for randomized micro actions.
 * Server outcomes and any ballistic ledger cannot be passed to this controller.
 */
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {WEAPONS} from './source-main/shared/weapons.js';
import {MOVE,STANCE_H} from './source-main/shared/constants.js';
import {rayWorld} from './source-main/shared/geometry.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
export const C35T_SCHEMA='fpsarena-c35t-target-relative-motor-v1';
export const C35T_POLICIES=Object.freeze(['observe','redirect']);
const finite=Number.isFinite;
const KEYS=['forward','backward','left','right'];
const PRIORITY=['reload','skill','use','interact','plate','throw','jump','crouch','slide','prone','lean'];
const VECTORS=[{forward:true},{forward:true,right:true},{right:true},{backward:true,right:true},
 {backward:true},{backward:true,left:true},{left:true},{forward:true,left:true}];
const norm=(x,z)=>{const d=Math.hypot(x,z);return d>1e-8?{x:x/d,z:z/d}:null;};
const f4=x=>finite(x)?+x.toFixed(4):null;
export function movementUnitC35T(cmd,yaw){
 if(!finite(yaw))return null;
 const forward=+!!cmd?.forward-+!!cmd?.backward,right=+!!cmd?.right-+!!cmd?.left;
 return norm(-Math.sin(yaw)*forward+Math.cos(yaw)*right,-Math.cos(yaw)*forward-Math.sin(yaw)*right);
}
function hasStaticClearance(client,u,{distance=.65}={}){
 const p=client?.pos,mv=client?.local?.mv,map=client?.map;
 if(!u||!p||!mv||!map||![p.x,p.z,mv.y,map.bound].every(finite)||!Array.isArray(map.boxes))return false;
 const rad=MOVE.radius+.15,h=STANCE_H[mv.stance??0]||STANCE_H[0];
 for(const b of map.boxes)if(!['x0','x1','y0','y1','z0','z1'].every(k=>finite(b?.[k])))return false;
 for(let i=0;i<=8;i++){
  const x=p.x+u.x*distance*i/8,z=p.z+u.z*distance*i/8;
  if(Math.abs(x)>=map.bound-rad-.2||Math.abs(z)>=map.bound-rad-.2)return false;
  for(const b of map.boxes)if(x+rad>b.x0&&x-rad<b.x1&&z+rad>b.z0&&z-rad<b.z1&&mv.y+h>b.y0&&mv.y+.05<b.y1)return false;
 }
 return true;
}
export function targetRelativeCandidateC35T(client,cmd,now,{mode='tdm',weapon='aa12',maxAge=.30,clearance=.65}={}){
 const reasons=[];
 if(mode!=='tdm'||!finite(now)||now<0)reasons.push('mode-clock');
 const w=WEAPONS[weapon];
 if(!w||!['Shotgun','SMG','Assault Rifle'].includes(w.cat))reasons.push('weapon');
 const mv=client?.local?.mv,p=client?.pos,yaw=client?.rig?.yaw;
 if(!client?.local?.alive||client?.local?.down||client?.local?.frozen||!finite(client?.local?.hp)||client.local.hp<45||
    !mv?.onGround||mv.air||mv.heli||mv.hk>0||mv.gs>0||mv.slideT>0||mv.zl>0||mv.stance!==0)reasons.push('motion-state');
 if(PRIORITY.some(k=>!!cmd?.[k])||finite(cmd?.slot)&&cmd.slot>=0)reasons.push('priority');
 if(!KEYS.some(k=>!!cmd?.[k])||!!cmd?.forward&&!!cmd?.backward||!!cmd?.left&&!!cmd?.right)reasons.push('no-uncontested-motion');
 let incumbent=movementUnitC35T(cmd,yaw),chosen=null,age=null,distance=null,aimAngle=null,selection=null;
 if(!incumbent)reasons.push('invalid-incumbent');
 if(!reasons.length){selection=publicHostilesC35K(client,now,{maxAge});if(!selection.valid||!selection.hostiles.length)reasons.push('no-fresh-target');}
 if(!reasons.length){
  if(![p?.x,p?.y,p?.z,yaw,client?.rig?.pitch].every(finite)||!Array.isArray(client?.map?.boxes))reasons.push('public-geometry');
  else{
   const eye=[p.x,p.y+eyeHeightOf(mv),p.z],pitch=client.rig.pitch;
   const look=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
   const list=selection.hostiles.map(q=>{
    const bodyH=q.sliding?0.65:(q.stance===2?.6:q.stance===1?1.05:1.7);
    const v=[q.pos.x-eye[0],q.pos.y+bodyH*.55-eye[1],q.pos.z-eye[2]],len=Math.hypot(...v);
    const angle=len>1e-6?Math.acos(Math.max(-1,Math.min(1,v.reduce((s,x,i)=>s+x*look[i],0)/len)))*180/Math.PI:Infinity;
    return {q,v,len,angle,d:Math.hypot(q.pos.x-p.x,q.pos.z-p.z)};
   }).sort((a,b)=>a.angle-b.angle||String(a.q.id).localeCompare(String(b.q.id)));
   chosen=list[0];age=chosen?now-chosen.q.buf.at(-1).t:null;distance=chosen?.d;aimAngle=chosen?.angle;
   if(!chosen||!finite(aimAngle)||aimAngle>72||!finite(distance)||distance<4)reasons.push('unreliable-target');
   const far=w?.cat==='Shotgun'?Math.max(w.range[1]+2,18):w?.cat==='SMG'?w.range[1]+4:w?.range?.[1]+3;
   const max=w?.cat==='Shotgun'?54:w?.cat==='SMG'?80:115;
   if(!finite(distance)||distance<far||distance>max)reasons.push('not-a-weapon-gap');
   if(!reasons.length&&rayWorld(eye,chosen.v.map(v=>v/chosen.len),client.map.boxes,chosen.len)<chosen.len-.01)reasons.push('static-target-cover');
  }
 }
 let options=[],best=null,baseClosure=null;
 if(!reasons.length){
  const radial=norm(chosen.q.pos.x-p.x,chosen.q.pos.z-p.z);
  baseClosure=incumbent.x*radial.x+incumbent.z*radial.z;
  // Route steering, not an extra key: choose among eight valid unit movement
  // directions. Forbid direction reversal and require meaningful extra closure.
  options=VECTORS.map(keys=>{
   const u=movementUnitC35T(keys,yaw),closure=u.x*radial.x+u.z*radial.z,
    continuity=incumbent.x*u.x+incumbent.z*u.z;
   return {keys,u,closure,continuity,safe:continuity>=.05&&hasStaticClearance(client,u,{distance:clearance})};
  }).filter(x=>x.safe&&x.closure>=baseClosure+.24&&x.closure>=.12)
    .sort((a,b)=>b.closure-a.closure||b.continuity-a.continuity||KEYS.map(k=>+!!a.keys[k]).join('').localeCompare(KEYS.map(k=>+!!b.keys[k]).join('')));
  best=options[0]||null;
  if(!best)reasons.push('no-safe-improvement');
 }
 return {eligible:reasons.length===0,reasons,targetId:chosen?.q?.id??null,distance:f4(distance),
  angleDeg:f4(aimAngle),ageMs:finite(age)?f4(age*1000):null,
  closureBefore:f4(baseClosure),closureAfter:f4(best?.closure),
  incumbent:KEYS.reduce((o,k)=>(o[k]=!!cmd?.[k],o),{}),
  selected:best?KEYS.reduce((o,k)=>(o[k]=!!best.keys[k],o),{}):null};
}
export class TargetRelativeMovementC35T{
 constructor({policy='observe',mode='tdm',weapon='aa12',matchId,cooldown=.45,burstTicks=3}={}){
  if(!C35T_POLICIES.includes(policy)||!matchId||!finite(cooldown)||cooldown<.3||cooldown>2||!Number.isInteger(burstTicks)||burstTicks<1||burstTicks>5)throw Error('C35T invalid configuration');
  Object.assign(this,{policy,mode,weapon,matchId,cooldown,burstTicks,last:-Infinity,nextAt:0,active:null});
  this.events=[];this.counts={ticks:0,movementTicks:0,fireTicks:0,offers:0,episodes:0,modifiedTicks:0,
   modifiedFireTicks:0,interruptions:0,completed:0,refusals:{},illegalFire:0,upstreamConflictTicks:0};
 }
 command(now,client,incumbent,applied){
  if(!finite(now)||now<=this.last)throw Error('C35T nonmonotonic clock');this.last=now;this.counts.ticks++;
  if(incumbent?.fire)this.counts.fireTicks++;
  if(KEYS.some(k=>incumbent?.[k]))this.counts.movementTicks++;
  if(applied?.fire!==incumbent?.fire){this.counts.illegalFire++;throw Error('C35T upstream trigger changed');}
  const conflict=Object.keys({...incumbent,...applied}).some(k=>incumbent[k]!==applied[k]);
  if(conflict){this.counts.upstreamConflictTicks++;if(this.active){this.active.interrupted=true;this.counts.interruptions++;this.active=null;}return applied;}
  const c=targetRelativeCandidateC35T(client,incumbent,now,{mode:this.mode,weapon:this.weapon});
  if(this.active&&(!c.eligible||String(this.active.targetId)!==String(c.targetId))){this.active.interrupted=true;this.counts.interruptions++;this.active=null;}
  if(!c.eligible){for(const reason of c.reasons)this.counts.refusals[reason]=(this.counts.refusals[reason]??0)+1;return applied;}
  if(!this.active){
   if(now+1e-8<this.nextAt)return applied;
   this.nextAt=now+this.cooldown;this.counts.offers++;this.counts.episodes++;
   const event={t:+now.toFixed(5),targetId:c.targetId,distance:c.distance,ageMs:c.ageMs,
    closureBefore:c.closureBefore,closureAfter:c.closureAfter,policy:this.policy,ticks:0,complete:false,interrupted:false};
   this.events.push(event);
   if(this.policy==='observe')return applied;
   this.active=event;
  }
  const output={...applied};for(const k of KEYS)output[k]=c.selected[k];
  const changed=Object.keys({...incumbent,...output}).filter(k=>output[k]!==incumbent[k]);
  if(!changed.length||changed.some(k=>!KEYS.includes(k))){throw Error('C35T actuation boundary');}
  this.active.ticks++;this.counts.modifiedTicks++;if(incumbent.fire)this.counts.modifiedFireTicks++;
  if(this.active.ticks>=this.burstTicks){this.active.complete=true;this.counts.completed++;this.active=null;}
  return output;
 }
 finish(){if(this.active){this.active.censored=true;this.active=null;}
  if(this.counts.illegalFire||this.counts.modifiedTicks!==this.events.reduce((s,e)=>s+e.ticks,0))throw Error('C35T accounting');
  return {schema:C35T_SCHEMA,policy:this.policy,matchId:this.matchId,weapon:this.weapon,
   guard:'PUBLIC delayed target/age, continuity+static map collision; separate from C16; server truth NEVER input',
   status:'RESEARCH ONLY; no production policy change',counts:this.counts,events:this.events};
 }
}
