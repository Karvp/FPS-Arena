// C35-O: offline-only public target freshness & bounded constant velocity projection.
// Server labels are never read by snapshotForShot(), which is called before Game.step().
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {forwardVec} from './source-main/shared/geometry.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {PLAYER} from './source-main/shared/constants.js';

export const C35O_SCHEMA='fpsarena-c35o-public-track-freshness-v1';
export const C35O_THRESHOLDS=Object.freeze([.15,.2,.275,.35]);
const finite=Number.isFinite;
const f=n=>finite(n)?+n.toFixed(6):null;
const roundAngle=(yaw,pitch,eye,xyz)=>{
 const v=xyz.map((c,i)=>c-eye[i]);const d=Math.hypot(...v);
 if(!(d>1e-6))return Infinity;
 const forward=forwardVec(yaw,pitch);
 return Math.acos(Math.max(-1,Math.min(1,v.reduce((s,x,i)=>s+x*forward[i],0)/d)))*180/Math.PI;
};
function targetPosition(q){
 const h=(q.sliding?PLAYER.slideBodyHeight:PLAYER.bodyH[q.stance??0]??PLAYER.bodyHeight)*.5;
 return [q.pos.x,q.pos.y+h,q.pos.z];
}
function track(q,now){
 const buf=q.buf;
 if(!Array.isArray(buf)||buf.length<2)return null;
 const a=buf.at(-2),b=buf.at(-1),dt=b?.t-a?.t;
 if(!finite(dt)||dt<.025||dt>.35||![a?.x,a?.z,b?.x,b?.z].every(finite))return null;
 const vx=(b.x-a.x)/dt,vz=(b.z-a.z)/dt,speed=Math.hypot(vx,vz);
 if(!finite(speed)||speed>12.5)return null;
 const age=now-b.t;
 if(!finite(age)||age<0)return null;
 // Strict cap prevents large future displacements from stale or corrupted data.
 const horizon=Math.min(.125,age);
 return {vx,vz,horizon,displacement:speed*horizon};
}
function candidates(client,now,maxAge){
 const base=publicHostilesC35K(client,now,{maxAge});
 if(!base.valid)return {eligible:false,reason:base.reason,age:null,aimId:null,projectedAimId:null,nearestId:null,available:0,confidence:'unknown'};
 if(!base.hostiles.length)return {eligible:false,reason:'no-public-hostile',age:null,aimId:null,projectedAimId:null,nearestId:null,available:0,confidence:'unknown'};
 const p=client.pos,rig=client.rig,mv=client.local?.mv;
 if(![p.x,p.y,p.z,rig?.yaw,rig?.pitch].every(finite))return {eligible:false,reason:'missing-public-aim',age:null,aimId:null,projectedAimId:null,nearestId:null,available:0,confidence:'unknown'};
 const eye=[p.x,p.y+eyeHeightOf(mv??{}),p.z];
 const raw=base.hostiles.map(q=>{
  const age=now-q.buf.at(-1).t;
  const xyz=targetPosition(q),m=track(q,now);
  const moved=m?[xyz[0]+m.vx*m.horizon,xyz[1],xyz[2]+m.vz*m.horizon]:null;
  return {id:String(q.id),age,dist:Math.hypot(q.pos.x-p.x,q.pos.z-p.z),angle:roundAngle(rig.yaw,rig.pitch,eye,xyz),projectedAngle:moved?roundAngle(rig.yaw,rig.pitch,eye,moved):null,motion:m};
 });
 const by=(field,onlyMotion=false)=>raw.filter(x=>!onlyMotion||x.motion).sort((a,b)=>(a[field]??Infinity)-(b[field]??Infinity)||a.id.localeCompare(b.id))[0];
 const aim=by('angle'),nearest=by('dist'),projected=by('projectedAngle',true);
 const age=aim?.age??null;
 return {eligible:true,reason:null,age:f(age),aimId:aim.id,projectedAimId:projected?.id??null,nearestId:nearest.id,available:raw.length,
  // This is an uncertainty stratum, NOT a calibrated probability or control approval.
  confidence:age<=.2?'nominal':age<=.275?'stale':'very-stale',
  projectedDisplacement:f(projected?.motion?.displacement??null),
  aimAngleDeg:f(aim.angle),projectedAngleDeg:f(projected?.projectedAngle??null)};
}
/** Output is derived exclusively from client snapshot, before any engine step. */
export function snapshotForShotC35O(client,now){
 if(!finite(now)||now<0||!client)throw Error('C35O invalid public snapshot');
 const rows={};for(const t of C35O_THRESHOLDS)rows[String(Math.round(t*1000))]=candidates(client,now,t);
 return {provenance:'PUBLIC_BEFORE_STEP_ONLY',thresholdsMs:rows};
}
export class PublicTrackFreshnessObserverC35O{
 constructor({matchId,maxRows=3000}={}){
  if(!matchId||!Number.isInteger(maxRows)||maxRows<1)throw Error('C35O invalid config');
  this.matchId=matchId;this.maxRows=maxRows;this.rows=[];this.last=-Infinity;this.pending=null;
  this.counts={ticks:0,fireIntentTicks:0,confirmedShots:0,storedDropped:0,fireModified:0};
 }
 beforeStep({now,client,incumbent,applied,serverShots}){
  if(this.pending||!finite(now)||now<=this.last||!Number.isSafeInteger(serverShots))throw Error('C35O invalid beforeStep');
  this.last=now;this.counts.ticks++;
  if(!!incumbent?.fire!==!!applied?.fire)this.counts.fireModified++;
  const row=incumbent?.fire?{t:f(now),publicBeforeStep:snapshotForShotC35O(client,now)}:null;
  if(row)this.counts.fireIntentTicks++;
  this.pending={row,serverShots};
 }
 afterStep({serverShots}){
  const p=this.pending;
  if(!p||!Number.isSafeInteger(serverShots)||serverShots<p.serverShots)throw Error('C35O invalid afterStep');
  const shotCount=serverShots-p.serverShots;
  this.counts.confirmedShots+=shotCount;
  if(shotCount&&!p.row)throw Error('C35O shot without fire-intent');
  if(p.row){
   if(this.rows.length<this.maxRows)this.rows.push({...p.row,serverLabelsAfterStep:{shots:shotCount}});
   else this.counts.storedDropped++;
  }
  this.pending=null;
 }
 finish(){
  if(this.pending||this.counts.fireModified||this.counts.storedDropped||this.counts.fireIntentTicks!==this.rows.length)throw Error('C35O audit gate');
  return {schema:C35O_SCHEMA,matchId:this.matchId,boundary:'public client snapshot captured before Game.step; shot count linked only afterStep; NEVER an action input',
   limitation:'Candidate identity for shot misses is unscored. Bounded linear tracking is diagnostic and not a target controller.',counts:this.counts,rows:this.rows};
 }
}
