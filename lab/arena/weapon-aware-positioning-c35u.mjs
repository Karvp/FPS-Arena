/** C35-U — experimental weapon-range/strafe balancing (headless only).
 * Control features: delayed public snapshots exclusively. Server bullet/death
 * truth is not imported or accessed. Motor guard is distinct from C16 micro.
 */
import {WEAPONS} from './source-main/shared/weapons.js';
import {MOVE,STANCE_H} from './source-main/shared/constants.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {rayWorld} from './source-main/shared/geometry.js';
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {movementUnitC35T} from './target-relative-motion-c35t.mjs';

export const C35U_SCHEMA='fpsarena-c35u-weapon-positioning-v1';
export const C35U_POLICIES=Object.freeze(['observe','balance']);
const KEYS=['forward','backward','left','right'];
const PRIORITY=['reload','skill','use','interact','plate','throw','jump','crouch','slide','prone','lean'];
const DIRECTIONS=[{forward:true},{forward:true,right:true},{right:true},{backward:true,right:true},
 {backward:true},{backward:true,left:true},{left:true},{forward:true,left:true}];
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(4):null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

/** Publicly specified damage ranges, not a learned best-range oracle. */
export function weaponBandC35U(weapon){
 const w=WEAPONS[weapon];if(!w||!Array.isArray(w.range)||!w.range.every(finite))return null;
 if(w.cat==='Shotgun')return {cat:w.cat,near:Math.max(5,w.range[0]*1.05),far:Math.min(17,w.range[1]*.75),max:Math.min(w.maxRange,43)};
 if(w.cat==='SMG')return {cat:w.cat,near:Math.max(9,w.range[0]*.8),far:Math.min(29,w.range[1]*.78),max:Math.min(w.maxRange,85)};
 if(w.cat==='Assault Rifle')return {cat:w.cat,near:Math.max(17,w.range[0]*.72),far:Math.min(49,w.range[1]*.82),max:Math.min(w.maxRange,120)};
 return null; // a separate plan is needed for snipers/DMRs/LMGs
}
function staticClear(client,v,range){
 const p=client?.pos,mv=client?.local?.mv,map=client?.map;
 if(!p||!mv||!map||!finite(map.bound)||![p.x,p.z,mv.y].every(finite)||!Array.isArray(map.boxes))return false;
 const r=MOVE.radius+.18,h=STANCE_H[mv.stance]??STANCE_H[0];
 for(const b of map.boxes)if(!['x0','x1','y0','y1','z0','z1'].every(k=>finite(b?.[k])))return false;
 for(let j=0;j<=8;j++){
  const x=p.x+v.x*range*j/8,z=p.z+v.z*range*j/8;
  if(Math.abs(x)>=map.bound-r-.2||Math.abs(z)>=map.bound-r-.2)return false;
  for(const b of map.boxes)if(x+r>b.x0&&x-r<b.x1&&z+r>b.z0&&z-r<b.z1&&mv.y+h>b.y0&&mv.y+.05<b.y1)return false;
 }
 return true;
}
function radiusIntent(d,band){
 if(d>band.far+2)return {phase:'close-distance',want:band.cat==='Shotgun'?.78:band.cat==='SMG'?.68:.36};
 if(d<band.near-1)return {phase:'create-space',want:band.cat==='Shotgun'?-.35:-.62};
 return {phase:'hold-band',want:band.cat==='Shotgun'?.16:band.cat==='SMG'?.04:0};
}
/** Scored entirely on BEFORE-step client state; no outcomes or player object. */
export function positioningCandidateC35U(client,incumbent,now,{weapon='aa12',mode='tdm',maxAge=.27,clearance=.7}={}){
 const fail=[];const band=weaponBandC35U(weapon);
 if(mode!=='tdm'||!finite(now)||now<0)fail.push('mode-clock');
 if(!band)fail.push('unsupported-weapon');
 const p=client?.pos,m=client?.local?.mv,yaw=client?.rig?.yaw;
 if(!client?.local?.alive||client?.local?.down||client?.local?.frozen||!finite(client?.local?.hp)||client.local.hp<50||
    !m?.onGround||m.air||m.heli||m.hk>0||m.gs>0||m.slideT>0||m.zl>0||m.stance!==0)fail.push('motion');
 if(PRIORITY.some(k=>!!incumbent?.[k])||(finite(incumbent?.slot)&&incumbent.slot>=0))fail.push('priority');
 if(!KEYS.some(k=>!!incumbent?.[k])||(incumbent?.forward&&incumbent?.backward)||(incumbent?.left&&incumbent?.right))fail.push('no-clean-motion');
 const old=movementUnitC35T(incumbent,yaw);if(!old)fail.push('bad-vector');
 let target=null,range=null,age=null,angle=null,phase=null,chosen=null,scoreBefore=null,scoreAfter=null;
 let intent=null;
 if(!fail.length){
  const pub=publicHostilesC35K(client,now,{maxAge});
  if(!pub.valid||pub.hostiles.length===0)fail.push('no-public-target');
  else if(![p?.x,p?.y,p?.z,yaw,client?.rig?.pitch].every(finite)||!Array.isArray(client?.map?.boxes))fail.push('invalid-geometry');
  else{
   const eye=[p.x,p.y+eyeHeightOf(m),p.z],pitch=client.rig.pitch;
   const aim=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
   const candidates=pub.hostiles.map(q=>{
    const h=q.sliding?.65:q.stance===2?.6:q.stance===1?1.05:1.7;
    const delta=[q.pos.x-eye[0],q.pos.y+h*.55-eye[1],q.pos.z-eye[2]],l=Math.hypot(...delta);
    const angle=l>.001?Math.acos(clamp(delta.reduce((s,x,i)=>s+x*aim[i],0)/l,-1,1))*180/Math.PI:Infinity;
    return {q,delta,l,angle,d:Math.hypot(q.pos.x-p.x,q.pos.z-p.z)};
   }).sort((a,b)=>a.angle-b.angle||String(a.q.id).localeCompare(String(b.q.id)));
   target=candidates[0];range=target?.d;angle=target?.angle;age=now-target?.q?.buf?.at(-1)?.t;
   if(!finite(angle)||angle>56||!finite(range)||range>band.max||range<3)fail.push('outside-confidence-cone');
   else if(rayWorld(eye,target.delta.map(x=>x/target.l),client.map.boxes,target.l)<target.l-.01)fail.push('static-los-blocked');
  }
 }
 if(!fail.length){
  intent=radiusIntent(range,band);phase=intent.phase;
  const rx=(target.q.pos.x-p.x)/range,rz=(target.q.pos.z-p.z)/range;
  const dot=v=>v.x*rx+v.z*rz;
  const targetScore=v=>-Math.abs(dot(v)-intent.want);
  scoreBefore=targetScore(old);
  const options=DIRECTIONS.map(keys=>{
   const u=movementUnitC35T(keys,yaw),continuity=old.x*u.x+old.z*u.z;
   return {keys,u,continuity,score:targetScore(u),radial:dot(u),safe:continuity>=.52&&staticClear(client,u,clearance)};
  }).filter(c=>c.safe&&c.score>=scoreBefore+.19)
   .sort((a,b)=>b.score-a.score||b.continuity-a.continuity||KEYS.map(k=>+!!a.keys[k]).join('').localeCompare(KEYS.map(k=>+!!b.keys[k]).join('')));
  chosen=options[0]??null;scoreAfter=chosen?.score??null;
  if(!chosen)fail.push('no-safe-improvement');
 }
 return {eligible:!fail.length,reasons:fail,phase,targetId:target?.q?.id??null,weapon,
  distance:round(range),ageMs:round(age*1000),angleDeg:round(angle),
  scoreBefore:round(scoreBefore),scoreAfter:round(scoreAfter),desiredRadial:round(intent?.want),
  selected:chosen?Object.fromEntries(KEYS.map(k=>[k,!!chosen.keys[k]])):null};
}
export class WeaponAwarePositioningC35U{
 constructor({policy='observe',weapon='aa12',mode='tdm',matchId,cooldown=.7,burstTicks=2}={}){
  if(!C35U_POLICIES.includes(policy)||!matchId||!finite(cooldown)||cooldown<.45||cooldown>2||
    !Number.isInteger(burstTicks)||burstTicks<1||burstTicks>4)throw Error('C35U invalid configuration');
  Object.assign(this,{policy,weapon,mode,matchId,cooldown,burstTicks,last:-Infinity,nextAt:0,active:null});
  this.events=[];this.counts={ticks:0,fireTicks:0,offers:0,episodes:0,modifiedTicks:0,modifiedFireTicks:0,
   completed:0,interruptions:0,upstreamConflictTicks:0,illegalFire:0,refusals:{},byPhase:{}};
 }
 command(now,client,incumbent,applied){
  if(!finite(now)||now<=this.last)throw Error('C35U clock');this.last=now;this.counts.ticks++;
  if(incumbent?.fire)this.counts.fireTicks++;
  if(applied?.fire!==incumbent?.fire){this.counts.illegalFire++;throw Error('C35U fire changed upstream');}
  const upstream=Object.keys({...incumbent,...applied}).some(k=>incumbent[k]!==applied[k]);
  if(upstream){this.counts.upstreamConflictTicks++;if(this.active){this.active.interrupted=true;this.counts.interruptions++;this.active=null;}return applied;}
  const cand=positioningCandidateC35U(client,incumbent,now,{weapon:this.weapon,mode:this.mode});
  if(this.active&&(!cand.eligible||String(this.active.targetId)!==String(cand.targetId))){
   this.active.interrupted=true;this.counts.interruptions++;this.active=null;
  }
  if(!cand.eligible){for(const why of cand.reasons)this.counts.refusals[why]=(this.counts.refusals[why]??0)+1;return applied;}
  if(!this.active){
   if(now+1e-8<this.nextAt)return applied;
   this.nextAt=now+this.cooldown;this.counts.offers++;this.counts.episodes++;
   const e={time:+now.toFixed(5),phase:cand.phase,targetId:cand.targetId,distance:cand.distance,
    ageMs:cand.ageMs,scoreBefore:cand.scoreBefore,scoreAfter:cand.scoreAfter,
    policy:this.policy,ticks:0,complete:false,interrupted:false};
   this.events.push(e);this.counts.byPhase[cand.phase]=(this.counts.byPhase[cand.phase]??0)+1;
   if(this.policy==='observe')return applied;
   this.active=e;
  }
  const out={...applied};for(const k of KEYS)out[k]=cand.selected[k];
  const delta=Object.keys({...incumbent,...out}).filter(k=>out[k]!==incumbent[k]);
  if(!delta.length||delta.some(k=>!KEYS.includes(k)))throw Error('C35U motion boundary');
  this.active.ticks++;this.counts.modifiedTicks++;if(incumbent.fire)this.counts.modifiedFireTicks++;
  if(this.active.ticks>=this.burstTicks){this.active.complete=true;this.counts.completed++;this.active=null;}
  return out;
 }
 finish(){if(this.active){this.active.censored=true;this.active=null;}
  if(this.counts.illegalFire||this.counts.modifiedTicks!==this.events.reduce((s,x)=>s+x.ticks,0))throw Error('C35U counts');
  return {schema:C35U_SCHEMA,policy:this.policy,weapon:this.weapon,matchId:this.matchId,
   provenance:'PUBLIC_BEFORE_STEP_ONLY; defensive macro guard distinct from C16 micro; NEVER server outcomes',
   status:'RESEARCH ONLY; PRODUCTION UNCHANGED',counts:this.counts,events:this.events};
 }
}
