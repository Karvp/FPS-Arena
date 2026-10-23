/** V64 public-only tactical geometry and team context. No privileged game memory.
 * Strict team/freshness check; static boxes already present in public client.map.
 * Research observational features only; privileged witnesses are separate.
 */
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {rayWorld} from './source-main/shared/geometry.js';
export const V64_CONTEXT_SCHEMA='fpsarena-v64-public-geometry-motion-team-v1';
const finite=Number.isFinite;
const boxFields=['x0','x1','y0','y1','z0','z1'];
const fmt=x=>finite(x)?+x.toFixed(5):null;
const tcode=x=>x==='red'||x===0?0:x==='blue'||x===1?1:null;
function velocity(remote) {
 const b=remote?.buf;
 if(!Array.isArray(b)||b.length<2)return {valid:false,vx:0,vz:0};
 const older=b.at(-2),latest=b.at(-1),dt=latest?.t-older?.t;
 if(!finite(dt)||dt<.025||dt>.35||![older?.x,older?.z,latest?.x,latest?.z].every(finite))
  return {valid:false,vx:0,vz:0};
 const vx=(latest.x-older.x)/dt,vz=(latest.z-older.z)/dt;
 if(!finite(vx)||!finite(vz)||Math.hypot(vx,vz)>12.5)return {valid:false,vx:0,vz:0};
 return {valid:true,vx,vz};
}
function footprintEntry(x,z,dx,dz,b) {
 let lo=0,hi=1;
 for(const [origin,diff,min,max] of [[x,dx,b.x0,b.x1],[z,dz,b.z0,b.z1]]) {
  if(Math.abs(diff)<1e-8){if(origin<min||origin>max)return null;continue}
  let a=(min-origin)/diff,c=(max-origin)/diff;
  if(a>c)[a,c]=[c,a];
  lo=Math.max(lo,a);hi=Math.min(hi,c);
  if(lo>hi)return null;
 }
 return hi>=0&&lo<=1?Math.max(0,lo):null;
}
function nearestFootprintDistance(p,b) {
 const xx=Math.max(b.x0-p.x,0,p.x-b.x1),zz=Math.max(b.z0-p.z,0,p.z-b.z1);
 return Math.hypot(xx,zz);
}
export function publicTacticalContextV64(client,now,{maxAge=.275}={}) {
 const sel=publicHostilesC35K(client,now,{maxAge});
 const p=client?.pos,boxes=client?.map?.boxes,remotes=client?.remotes?.list;
 if(!sel.valid||![p?.x,p?.y,p?.z].every(finite)||!Array.isArray(boxes)||
    boxes.length>2500||!boxes.every(b=>boxFields.every(f=>finite(b?.[f]))&&
        b.x0<=b.x1&&b.y0<=b.y1&&b.z0<=b.z1)) {
  return {schema:V64_CONTEXT_SCHEMA,valid:false,reason:!sel.valid?sel.reason:'invalid-public-geometry'};
 }
 const target=sel.hostiles[0];
 if(!target) return {schema:V64_CONTEXT_SCHEMA,valid:false,reason:'no-fresh-public-target'};
 const dx=target.pos.x-p.x,dz=target.pos.z-p.z,d=Math.hypot(dx,dz);
 if(!(d>=1e-4))return {schema:V64_CONTEXT_SCHEMA,valid:false,reason:'overlapping-target'};
 const ux=dx/d,uz=dz/d;
 // Static map approximate LOS through body-center; not an actual firing ray.
 const eye=[p.x,p.y+1.5,p.z],t=[target.pos.x,target.pos.y+1,target.pos.z];
 const delta=t.map((v,i)=>v-eye[i]),rayLen=Math.hypot(...delta);
 const direct=rayWorld(eye,delta.map(v=>v/rayLen),boxes,rayLen);
 const losClear=direct>=rayLen-1e-4;
 const covering=boxes.filter(b=>footprintEntry(p.x,p.z,dx,dz,b)!==null);
 const closeCover=boxes.reduce((best,b)=>Math.min(best,nearestFootprintDistance(p,b)),Infinity);
 const lastAge=now-target.buf?.at(-1)?.t;
 const motion=velocity(target);
 const allied=[];
 for(const q of remotes){
  if(tcode(q?.team??q?.tm)!==sel.localTeam||q?.alive!==true||q?.invisible===true||
    ![q?.pos?.x,q?.pos?.y,q?.pos?.z].every(finite))continue;
  const age=now-q.buf?.at(-1)?.t;
  if(!finite(age)||age<0||age>maxAge)continue;
  const dist=Math.hypot(q.pos.x-p.x,q.pos.z-p.z);
  if(dist<=30)allied.push({q,dist});
 }
 const nearbyAllies=allied.filter(v=>v.dist<=20).length;
 const supportNearTarget=allied.filter(({q})=>Math.hypot(q.pos.x-target.pos.x,q.pos.z-target.pos.z)<=25).length;
 const radial=motion.vx*ux+motion.vz*uz,lateral=-motion.vx*uz+motion.vz*ux;
 return {schema:V64_CONTEXT_SCHEMA,valid:true,reason:null,
  provenance:'PUBLIC_CLIENT_SNAPSHOT_BEFORE_GAME_STEP_ONLY',
  targetId:String(target.id),distance:fmt(d),snapshotAge:fmt(lastAge),
  validMotion:motion.valid,radialSpeed:fmt(radial),lateralSpeed:fmt(lateral),
  motionSpeed:fmt(Math.hypot(motion.vx,motion.vz)),
  los3DClear:losClear,
  coverFootprint:covering.length>0,
  interveningCoverCount:covering.length,
  nearbyCoverDistance:fmt(Number.isFinite(closeCover)?Math.min(closeCover,40):40),
  teammatesNearby20m:nearbyAllies,
  teammatesSupportingTarget25m:supportNearTarget,
  visibleEnemies:sel.hostiles.length,
  noPrivateServerInput:true};
}
