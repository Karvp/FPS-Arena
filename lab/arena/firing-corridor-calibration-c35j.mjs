/** C35-J: passive PUBLIC 3D vs 2D firing corridor audit.
 * The public estimator runs BEFORE Game.step.  Authoritative geometry and
 * world player state are read strictly AFTER Game.step, only for audit labels.
 * This module never returns control commands and never feeds an oracle into AI.
 */
import {rayWorld,forwardVec} from './source-main/shared/geometry.js';
import {eyeHeightOf} from './source-main/shared/movement.js';
import {PLAYER,LEAN} from './source-main/shared/constants.js';
import {publicFiringLaneC35I} from './public-firing-corridor-c35i.mjs';

export const C35J_SCHEMA='fpsarena-c35j-public-3d-calibration-v1';
const finite=Number.isFinite;
const rounded=x=>finite(x)?+x.toFixed(5):null;
const fields=['x0','x1','y0','y1','z0','z1'];
const safeBoxes=boxes=>Array.isArray(boxes)&&boxes.every(b=>fields.every(k=>finite(b?.[k]))&&b.x0<=b.x1&&b.y0<=b.y1&&b.z0<=b.z1);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=v=>Math.hypot(...v);
function pointToTarget(o,p,boxes){
 const d=[p[0]-o[0],p[1]-o[1],p[2]-o[2]],len=length(d);
 if(!finite(len)||len<1e-6)return {clear:null,distance:null,firstObstacle:null};
 const unit=d.map(v=>v/len),t=rayWorld(o,unit,boxes,len);
 return {clear:t>=len-1e-4,distance:rounded(len),firstObstacle:finite(t)&&t<len-1e-4?rounded(t):null};
}
const centerY=(pos,stance=0,slide=false)=>pos.y+(slide?PLAYER.slideBodyHeight:PLAYER.bodyH[stance]??PLAYER.bodyHeight)*.5;
function aimAngle(o,p,dir){
 const diff=p.map((v,i)=>v-o[i]);const l=length(diff);
 return l>1e-6?180*Math.acos(Math.max(-1,Math.min(1,dot(diff,dir)/l)))/Math.PI:null;
}
// Server public snapshots publish remote tm as 0/1; the local team may be
// exposed as 'red'/'blue'. Never mix those encodings while classifying hostiles.
const teamCode=v=>v===0||v==='red'?0:v===1||v==='blue'?1:null;
function groundLine2D(o,p,boxes){
 for(const b of boxes){
  let low=0,high=1;
  for(const [v,d,min,max] of [[o[0],p[0]-o[0],b.x0,b.x1],[o[2],p[2]-o[2],b.z0,b.z1]]){
   if(Math.abs(d)<1e-9){if(v<min||v>max){low=2;break;}continue;}
   const a=(min-v)/d,c=(max-v)/d;low=Math.max(low,Math.min(a,c));high=Math.min(high,Math.max(a,c));
  }
  if(low<=high&&high>=0&&low<=1)return false;
 }
 return true;
}
/** Includes predecision public properties ONLY, never world/server/labels. */
export function publicCorridorC35J(client,cmd,now){
 const legacy=publicFiringLaneC35I(client,cmd,now);
 const error=[];
 if(!legacy.valid)error.push(...legacy.reasons);
 const mv=client?.local?.mv,pos=client?.pos,rig=client?.rig;
 const boxes=client?.map?.boxes;
 if(![pos?.x,pos?.y,pos?.z,rig?.yaw,rig?.pitch].every(finite)||!mv||!finite(mv.stance??0)||!finite(mv.lean??0))error.push('missing-public-3d-pose');
 if(!safeBoxes(boxes))error.push('invalid-public-3d-map');
 const localTeam=teamCode(client?.you?.tm??client?.local?.team);
 if(localTeam===null)error.push('unknown-public-team-code');
 const publicSelected=client?.remotes?.list?.find(q=>String(q.id)===String(legacy.targetId));
 if(publicSelected&&!finite(publicSelected.pos?.y))error.push('missing-public-target-height');
 // Do not manufacture a 3D answer from the old 2D footprint if height is absent.
 if(error.length)return {valid:false,reasons:[...new Set(error)],legacy2D:legacy.staticFootprintClear,targetId:legacy.targetId,nearestHostileId:null,corrected2D:null,aimCandidateId:null,
  nearest3DClear:null,aimCandidate3DClear:null,aimCandidateAngleDeg:null,aimRayFirstObstacle:null,aimCandidateDiffers:false,observedHostiles:0};
 const eye=[pos.x+Math.cos(rig.yaw)*(mv.lean||0)*LEAN.offset,pos.y+eyeHeightOf(mv),pos.z-Math.sin(rig.yaw)*(mv.lean||0)*LEAN.offset];
 const forward=forwardVec(rig.yaw,rig.pitch);
 const all=client?.remotes?.list||[];
 const targets=all.filter(q=>teamCode(q.team)!==null&&teamCode(q.team)!==localTeam&&q.alive!==false&&!q.invisible&&
  [q.pos?.x,q.pos?.y,q.pos?.z].every(finite)&&Number.isFinite(q.buf?.at(-1)?.t)&&now-q.buf.at(-1).t<=.2&&now>=q.buf.at(-1).t);
 const nearest=targets.sort((a,b)=>Math.hypot(a.pos.x-pos.x,a.pos.z-pos.z)-Math.hypot(b.pos.x-pos.x,b.pos.z-pos.z)||String(a.id).localeCompare(String(b.id)))[0]||null;
 const targetPos=q=>[q.pos.x,centerY(q.pos,q.stance??0,q.sliding),q.pos.z];
 const aimed=targets.map(q=>({q,angle:aimAngle(eye,targetPos(q),forward)}))
  .filter(a=>finite(a.angle)).sort((a,b)=>a.angle-b.angle||String(a.q.id).localeCompare(String(b.q.id)))[0];
 const nearestRay=nearest?pointToTarget(eye,targetPos(nearest),boxes):null;
 const corrected2D=nearest?groundLine2D(eye,targetPos(nearest),boxes):null;
 const aimedRay=aimed?pointToTarget(eye,targetPos(aimed.q),boxes):null;
 const maxD=legacy.weaponMaxRange??240,aimStop=rayWorld(eye,forward,boxes,maxD);
 return {valid:true,reasons:[],targetId:legacy.targetId,legacy2D:legacy.staticFootprintClear,
  nearestHostileId:nearest?.id??null,legacyTargetIsHostile:targets.some(q=>String(q.id)===String(legacy.targetId)),corrected2D,
  nearest3DClear:nearestRay?.clear??null,nearest3DDistance:nearestRay?.distance??null,
  aimCandidateId:aimed?.q.id??null,aimCandidate3DClear:aimedRay?.clear??null,
  aimCandidateAngleDeg:rounded(aimed?.angle),aimCandidateDiffers:!!(aimed&&nearest&&String(aimed.q.id)!==String(nearest.id)),
  aimRayFirstObstacle:aimStop<maxD-1e-4?rounded(aimStop):null,
  observedHostiles:targets.length,assumptions:['public snapshot delayed', '3D ray to approximate body center, not ballistic spread or authoritative hit',
   'aim candidate is minimum angular difference, not player intent', 'static boxes only: excludes dynamic foam and lag compensation']};
}

/** Post-step-only oracle; deliberately NOT an exact hit/shot oracle.
 * Oracle compares 3D ray geometry after server step, which is not the firing-time
 * position and does not account for target rewind, bullet spread or aim drift.
 */
export function serverGeometryLabelC35J(world,player,publicTargetId,publicAimTargetId){
 if(!world||!player||typeof world.worldBoxes!=='function')throw Error('C35J oracle requires Game.step result');
 const w=world.worldBoxes(),staticBoxes=world.map.boxes;
 if(!safeBoxes(w)||!safeBoxes(staticBoxes))throw Error('C35J server geometry invalid');
 const eye=[player.x+Math.cos(player.yaw)*(player.lean||0)*LEAN.offset,player.y+eyeHeightOf(player),player.z-Math.sin(player.yaw)*(player.lean||0)*LEAN.offset];
 const make=id=>{
  const target=id==null?null:world.players.get(id);
  if(!target||!target.alive||!world.hostile(player,target))return {available:false,staticClear:null,worldClear:null};
  const p=[target.x,centerY(target,target.stance??0,target.slideT>0),target.z];
  return {available:true,staticClear:pointToTarget(eye,p,staticBoxes).clear,worldClear:pointToTarget(eye,p,w).clear};
 };
 const n=make(publicTargetId),a=make(publicAimTargetId);
 return {phase:'POST_GAME_STEP_DIAGNOSTIC_ONLY',nearest:n,aimCandidate:a,dynamicBoxes:w.length-staticBoxes.length};
}
export class FiringCorridorCalibrationObserverC35J{
 constructor({matchId,policy,maxRows=3000}={}){
  if(!matchId||!['observe','lateral'].includes(policy)||!Number.isInteger(maxRows)||maxRows<1)throw Error('C35J invalid configuration');
  this.matchId=matchId;this.policy=policy;this.maxRows=maxRows;this.pending=null;this.last=-Infinity;this.rows=[];
  this.counts={ticks:0,fireTicks:0,validPublic:0,invalidPublic:0,storedDropped:0,
   public2DBlocked3DClear:0,public2DClear3DBlocked:0,publicTargetsDiffer:0,legacySelectedAllyOrMissing:0,
   publicNearestPostStepMismatch:0,publicAimPostStepMismatch:0,
   serverShots:0,serverHits:0,fireModified:0,oracleAvailable:0};
 }
 beforeStep({now,client,incumbent,applied,serverShots,serverHits}){
  if(this.pending)throw Error('C35J pending tick');
  if(!finite(now)||now<=this.last)throw Error('C35J nonmonotonic time');
  if(!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits))throw Error('C35J bad server baseline');
  this.last=now;this.counts.ticks++;
  if(!!incumbent?.fire!==!!applied?.fire)this.counts.fireModified++;
  if(!incumbent?.fire){this.pending={row:null,serverShots,serverHits};return;}
  this.counts.fireTicks++;
  const pub=publicCorridorC35J(client,incumbent,now);
  if(pub.valid){
   this.counts.validPublic++;
   if(pub.corrected2D===false&&pub.nearest3DClear===true)this.counts.public2DBlocked3DClear++;
   if(pub.corrected2D===true&&pub.nearest3DClear===false)this.counts.public2DClear3DBlocked++;
   if(!pub.legacyTargetIsHostile)this.counts.legacySelectedAllyOrMissing++;
   if(pub.aimCandidateDiffers)this.counts.publicTargetsDiffer++;
  }else this.counts.invalidPublic++;
  // JSON boundary prevents references to mutable client/command state escaping.
  this.pending={row:{t:rounded(now),public:pub},serverShots,serverHits};
 }
 afterStep({world,player,serverShots,serverHits}){
  const p=this.pending;if(!p)throw Error('C35J missing beforeStep');
  if(!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits)||serverShots<p.serverShots||serverHits<p.serverHits)throw Error('C35J nonmonotonic server counters');
  if(p.row){
   const label=serverGeometryLabelC35J(world,player,p.row.public.nearestHostileId,p.row.public.aimCandidateId);
   const delta={shots:serverShots-p.serverShots,hits:serverHits-p.serverHits};
   this.counts.serverShots+=delta.shots;this.counts.serverHits+=delta.hits;
   if(label.nearest.available){this.counts.oracleAvailable++;
    if(p.row.public.nearest3DClear!==null&&p.row.public.nearest3DClear!==label.nearest.staticClear)this.counts.publicNearestPostStepMismatch++;
   }
   if(label.aimCandidate.available&&p.row.public.aimCandidate3DClear!==null&&p.row.public.aimCandidate3DClear!==label.aimCandidate.staticClear)this.counts.publicAimPostStepMismatch++;
   if(this.rows.length<this.maxRows)this.rows.push({...p.row,serverLabelsAfterStep:delta,postStepOracle:label});
   else this.counts.storedDropped++;
  }
  this.pending=null;
 }
 finish(){
  if(this.pending)throw Error('C35J unclosed pending tick');
  if(this.counts.fireModified)throw Error('C35J modified firing commands');
  if(this.counts.validPublic+this.counts.invalidPublic!==this.counts.fireTicks)throw Error('C35J denominator mismatch');
  if(this.rows.length+this.counts.storedDropped!==this.counts.fireTicks)throw Error('C35J dropped rows not reconciled');
  return {schema:C35J_SCHEMA,matchId:this.matchId,policy:this.policy,
   inferenceBoundary:'public BEFORE step; postStepOracle and serverLabelsAfterStep are audit only and MUST NOT feed any controller',
   causalStatus:'descriptive calibration; NOT actual shot ray or counterfactual utility',counts:this.counts,rows:this.rows};
 }
}
