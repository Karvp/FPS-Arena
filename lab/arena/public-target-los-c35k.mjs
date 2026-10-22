/** C35-K: observational-only public target identity and static 3D LOS.
 * The historical C12/C13/C35I collectors stay immutable for byte-identical
 * replay. This sidecar computes corrected C12-compatible features with a
 * strict team-code boundary, and diagnoses cover geometry per firing tick.
 * Server state is accepted ONLY by afterStep, never by public measurements.
 */
import {publicShotFeatures} from './match-engagement-recorder-c12.mjs';
import {rayWorld,forwardVec} from './source-main/shared/geometry.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {PLAYER,LEAN} from './source-main/shared/constants.js';
export const C35K_SCHEMA='fpsarena-c35k-public-target-los-audit-v1';
const finite=Number.isFinite;
const fmt=x=>finite(x)?+x.toFixed(5):null;
const team=v=>v===0||v==='red'?0:v===1||v==='blue'?1:null;
const cmp=(a,b)=>String(a.id).localeCompare(String(b.id));
const fields=['x0','x1','y0','y1','z0','z1'];
const validBoxes=b=>Array.isArray(b)&&b.every(v=>fields.every(k=>finite(v?.[k]))&&v.x0<=v.x1&&v.y0<=v.y1&&v.z0<=v.z1);
function horizontalEntry(o,p,b){
 let low=0,hi=1;
 for(const [start,delta,a,z] of [[o[0],p[0]-o[0],b.x0,b.x1],[o[2],p[2]-o[2],b.z0,b.z1]]){
  if(Math.abs(delta)<1e-9){if(start<a||start>z)return null;continue;}
  const t0=(a-start)/delta,t1=(z-start)/delta;
  low=Math.max(low,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
  if(low>hi)return null;
 }
 return hi>=0&&low<=1?Math.max(0,low):null;
}
function motion(q){
 const b=q?.buf;if(!Array.isArray(b)||b.length<2)return null;
 const a=b.at(-2),z=b.at(-1),dt=z?.t-a?.t;
 if(!finite(dt)||dt<.025||dt>.35||![a?.x,a?.z,z?.x,z?.z].every(finite))return null;
 const vx=(z.x-a.x)/dt,vz=(z.z-a.z)/dt;
 return finite(vx)&&finite(vz)&&Math.hypot(vx,vz)<=12.5?{vx,vz}:null;
}
/** PUBLIC only. Unknown/conflicting team encodings invalidate the measurement. */
export function publicHostilesC35K(client,now,{maxAge=.2}={}){
 const a=team(client?.you?.tm),b=team(client?.local?.team);
 const p=client?.pos,remotes=client?.remotes?.list;
 if(!finite(now)||now<0||!finite(p?.x)||!finite(p?.z)||!Array.isArray(remotes))return {valid:false,reason:'missing-public-snapshot',hostiles:[],localTeam:null};
 if(a!==null&&b!==null&&a!==b)return {valid:false,reason:'conflicting-public-team',hostiles:[],localTeam:null};
 const localTeam=a??b;if(localTeam===null)return {valid:false,reason:'unknown-public-team',hostiles:[],localTeam:null};
 let unknown=0,ally=0,stale=0,unavailable=0;
 const hostiles=[];
 for(const q of remotes){
  const otherTeam=team(q?.team??q?.tm);
  if(otherTeam===null){unknown++;continue;}
  if(otherTeam===localTeam){ally++;continue;}
  if(q?.alive!==true||q?.invisible===true||![q?.pos?.x,q?.pos?.y,q?.pos?.z].every(finite)){unavailable++;continue;}
  const tick=q?.buf?.at(-1)?.t,age=now-tick;
  if(!finite(age)||age<0||age>maxAge){stale++;continue;}
  hostiles.push(q);
 }
 hostiles.sort((x,y)=>Math.hypot(x.pos.x-p.x,x.pos.z-p.z)-Math.hypot(y.pos.x-p.x,y.pos.z-p.z)||cmp(x,y));
 return {valid:true,reason:null,localTeam,hostiles,ally,unknown,stale,unavailable};
}
/** Corrected C12-compatible feature schema; NEVER substituted into control. */
export function publicShotFeaturesC35K(client,now,cmd={}){
 const selection=publicHostilesC35K(client,now),p=client?.pos;
 if(!selection.valid)return {valid:false,reason:selection.reason,targetId:null,features:null,provenance:'PUBLIC_BEFORE_STEP_ONLY'};
 const t=selection.hostiles[0]??null,delta=t?[t.pos.x-p.x,t.pos.z-p.z]:null;
 const dist=delta?Math.hypot(...delta):null,m=motion(t),ux=dist>1e-6?delta[0]/dist:0,uz=dist>1e-6?delta[1]/dist:0;
 const at=t?.buf?.at(-1)?.t;
 const features={distance:fmt(dist),lateralSpeed:m?fmt(-uz*m.vx+ux*m.vz):null,
  radialSpeed:m?fmt(ux*m.vx+uz*m.vz):null,aim:cmd?.aim===true?1:0,
  snapshotAge:finite(at)?fmt(now-at):null,observedHostiles:selection.hostiles.length,
  onGround:client?.local?.mv?.onGround===true?1:0};
 return {valid:!!t,reason:t?null:'no-eligible-public-hostile',targetId:t?String(t.id):null,
  features,hostileCount:selection.hostiles.length,allyCount:selection.ally,unknownTeamCount:selection.unknown,
  provenance:'PUBLIC_BEFORE_STEP_ONLY'};
}
export function publicLOSStratumC35K(client,now,cmd={}){
 const identity=publicShotFeaturesC35K(client,now,cmd),out={...identity,
  nearest3DClear:null,nearest2DClear:null,aimCandidateId:null,aimCandidateDiffers:null,
  angularSeparationDeg:null,coverType:'unavailable',firstCoverTop:null,legacyC12TargetId:null,legacyTargetHostile:null,
  geometryValid:false};
 const old=publicShotFeatures(client,now,cmd);out.legacyC12TargetId=old?.targetId??null;
 const selection=publicHostilesC35K(client,now);
 if(!selection.valid)return out;
 out.legacyTargetHostile=selection.hostiles.some(q=>String(q.id)===String(out.legacyC12TargetId));
 if(!identity.valid)return out;
 const pos=client?.pos,rig=client?.rig,mv=client?.local?.mv,boxes=client?.map?.boxes;
 if(![pos?.x,pos?.y,pos?.z,rig?.yaw,rig?.pitch,mv?.lean].every(finite)||!validBoxes(boxes))return out;
 const eye=[pos.x+Math.cos(rig.yaw)*mv.lean*LEAN.offset,pos.y+eyeHeightOf(mv),pos.z-Math.sin(rig.yaw)*mv.lean*LEAN.offset];
 const center=q=>[q.pos.x,q.pos.y+(q.sliding?PLAYER.slideBodyHeight:PLAYER.bodyH[q.stance??0]??PLAYER.bodyHeight)*.5,q.pos.z];
 const nearest=selection.hostiles[0],point=center(nearest),dir=forwardVec(rig.yaw,rig.pitch);
 const angle=q=>{const delta=center(q).map((v,i)=>v-eye[i]),l=Math.hypot(...delta);return l>1e-6?180*Math.acos(Math.max(-1,Math.min(1,delta.reduce((s,v,i)=>s+v*dir[i],0)/l)))/Math.PI:Infinity;};
 const aimed=[...selection.hostiles].sort((a,b)=>angle(a)-angle(b)||cmp(a,b))[0];
 out.aimCandidateId=aimed?String(aimed.id):null;out.aimCandidateDiffers=!!aimed&&String(aimed.id)!==String(nearest.id);
 out.angularSeparationDeg=fmt(angle(nearest));
 const d=point.map((v,i)=>v-eye[i]),len=Math.hypot(...d);
 if(!finite(len)||len<=1e-6)return out;
 const unit=d.map(v=>v/len),hit=rayWorld(eye,unit,boxes,len);
 out.nearest3DClear=hit>=len-1e-4;
 const covers=boxes.map(b=>({b,t:horizontalEntry(eye,point,b)})).filter(v=>v.t!==null).sort((x,y)=>x.t-y.t);
 out.nearest2DClear=covers.length===0;
 if(covers.length){
  const {b,t}=covers[0],h=eye[1]+(point[1]-eye[1])*t;
  out.firstCoverTop=fmt(b.y1);
  out.coverType=b.y1<h-1e-4?'below-ray':b.y0>h+1e-4?'above-ray':'intersects-ray-height';
 }else out.coverType='no-footprint-cover';
 out.geometryValid=true;
 return out;
}
export class PublicTargetLOSObserverC35K{
 constructor({matchId,maxRows=3000}={}){
  if(!matchId||!Number.isInteger(maxRows)||maxRows<1)throw Error('C35K invalid configuration');
  this.matchId=matchId;this.maxRows=maxRows;this.rows=[];this.pending=null;this.last=-Infinity;
  this.counts={ticks:0,fireTicks:0,eligible:0,identityMismatch:0,legacyNotHostile:0,
   validGeometry:0,belowRay:0,aboveRay:0,intersectsRayHeight:0,
   clear3D:0,blocked3D:0,shots:0,hits:0,fireModified:0,storedDropped:0};
 }
 beforeStep({now,client,incumbent,applied,serverShots,serverHits}){
  if(this.pending||!finite(now)||now<=this.last)throw Error('C35K beforeStep invalid order');
  if(!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits))throw Error('C35K invalid counter');
  this.last=now;this.counts.ticks++;
  if(!!incumbent?.fire!==!!applied?.fire)this.counts.fireModified++;
  if(!incumbent?.fire){this.pending={row:null,serverShots,serverHits};return;}
  this.counts.fireTicks++;
  const row={t:fmt(now),publicBeforeStep:publicLOSStratumC35K(client,now,incumbent)};
  const p=row.publicBeforeStep;if(p.valid)this.counts.eligible++;
  if(p.valid&&p.legacyC12TargetId!==p.targetId)this.counts.identityMismatch++;
  if(p.valid&&p.legacyTargetHostile===false)this.counts.legacyNotHostile++;
  if(p.geometryValid){
   this.counts.validGeometry++;
   if(p.coverType==='below-ray')this.counts.belowRay++;
   if(p.coverType==='above-ray')this.counts.aboveRay++;
   if(p.coverType==='intersects-ray-height')this.counts.intersectsRayHeight++;
   if(p.nearest3DClear)this.counts.clear3D++;else this.counts.blocked3D++;
  }
  this.pending={row,serverShots,serverHits};
 }
 afterStep({serverShots,serverHits}){
  const p=this.pending;if(!p)throw Error('C35K afterStep without beforeStep');
  if(!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits)||serverShots<p.serverShots||serverHits<p.serverHits)throw Error('C35K counters nonmonotonic');
  if(p.row){const delta={shots:serverShots-p.serverShots,hits:serverHits-p.serverHits};this.counts.shots+=delta.shots;this.counts.hits+=delta.hits;
   if(this.rows.length<this.maxRows)this.rows.push({...p.row,serverLabelsAfterStep:delta});else this.counts.storedDropped++;
  }
  this.pending=null;
 }
 finish(){
  if(this.pending||this.counts.fireModified||this.counts.fireTicks!==this.rows.length+this.counts.storedDropped||this.counts.validGeometry!==this.counts.clear3D+this.counts.blocked3D)throw Error('C35K audit gate failed');
  return {schema:C35K_SCHEMA,matchId:this.matchId,inferenceBoundary:'Corrected PUBLIC target and static geometry frozen before Game.step; server counters appended ONLY afterStep; never a policy input',
   interpretation:'OBSERVATIONAL. Eye/body-center static LOS is not actual firing ray or causal dodge utility.',counts:this.counts,rows:this.rows};
 }
}
