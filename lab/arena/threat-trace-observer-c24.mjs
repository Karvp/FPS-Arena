// C24 laboratory telemetry ONLY. The main engine is hitscan: received tracers
// cannot be used to dodge a shot that has already resolved on the server.
// Public cues are derived exclusively from shot packets *delivered before*
// action assignment. Server-side shot geometry/hits are POST-ACTION labels.
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(5):null;
export const C24_NEAR_TRACER_METERS=2.5;
export const C24_PUBLIC_CUE_SECONDS=1.5;
export const C24_PUBLIC_CUE_METERS=65;
export function tracerSegmentDistanceC24(origin,end,point){
 if(!Array.isArray(origin)||!Array.isArray(end)||!Array.isArray(point)||
  [origin,end,point].some(v=>v.length!==3||v.some(x=>!finite(x))))return null;
 const v=end.map((x,i)=>x-origin[i]),w=point.map((x,i)=>x-origin[i]);
 const vv=v.reduce((a,x)=>a+x*x,0);
 if(!finite(vv)||vv<1e-10)return null;
 const t=Math.max(0,Math.min(1,v.reduce((a,x,i)=>a+x*w[i],0)/vv));
 return Math.hypot(...origin.map((x,i)=>x+t*v[i]-point[i]));
}
export function tracerProximityC24(shot,position){
 // The engine exports at most THREE displayed tracer endpoints, even for a
 // multi-pellet weapon. Do NOT claim to reconstruct all pellet trajectories.
 if(!shot||!Array.isArray(shot.o)||!Array.isArray(shot.e)||
  !position||![position.x,position.y,position.z].every(finite))return null;
 const p=[position.x,position.y+1.1,position.z];
 const ds=shot.e.slice(0,3).map(e=>tracerSegmentDistanceC24(shot.o,e,p)).filter(finite);
 return ds.length?Math.min(...ds):null;
}
export class ThreatTraceObserverC24{
 constructor({cueSeconds=C24_PUBLIC_CUE_SECONDS,cueMeters=C24_PUBLIC_CUE_METERS,nearMeters=C24_NEAR_TRACER_METERS}={}){
  if(![cueSeconds,cueMeters,nearMeters].every(finite)||cueSeconds<.2||cueSeconds>5||cueMeters<=0||nearMeters<=0)throw Error('C24 invalid parameters');
  Object.assign(this,{cueSeconds,cueMeters,nearMeters});this.publicDelivered=[];
  this.counts={hostileServerShots:0,hostileNearTracers:0,hostileWeaponHits:0,hostileWeaponDamage:0,
   publicNearbyShotsDelivered:0,publicNearTracersDelivered:0};
 }
 observeDeliveredShot(now,shot,publicPosition){
  if(!finite(now)||now<0||!shot||shot.id==='trainee'||!publicPosition||
   ![publicPosition.x,publicPosition.y,publicPosition.z].every(finite)||!Array.isArray(shot.o)||
   shot.o.length!==3||shot.o.some(x=>!finite(x)))return;
  // Public shot packet origin + our publicly known local position. Not secretly
  // filtered by hostility (team identity may not yet be known).
  const originMeters=Math.hypot(shot.o[0]-publicPosition.x,shot.o[1]-(publicPosition.y+1.1),shot.o[2]-publicPosition.z);
  if(originMeters>this.cueMeters)return;
  const distance=tracerProximityC24(shot,publicPosition);
  this.publicDelivered.push({receivedAt:now,near:distance!==null&&distance<=this.nearMeters,distance});
  this.counts.publicNearbyShotsDelivered++;
  if(distance!==null&&distance<=this.nearMeters)this.counts.publicNearTracersDelivered++;
  this.publicDelivered=this.publicDelivered.filter(e=>now-e.receivedAt<=this.cueSeconds+1);
 }
 publicCueAt(now){
  if(!finite(now))throw Error('C24 invalid cue time');
  const recent=this.publicDelivered.filter(e=>e.receivedAt<=now+1e-8&&now-e.receivedAt>=0&&now-e.receivedAt<=this.cueSeconds);
  const d=recent.map(e=>e.distance).filter(finite);
  return {receivedShotCount:recent.length,receivedNearTracerCount:recent.filter(e=>e.near).length,
   nearestReceivedTracerMeters:d.length?round(Math.min(...d)):null,lookbackSeconds:this.cueSeconds,
   cueDefinition:'delivered public shot packets only; may include friendlies; no future server labels'};
 }
 attachOffer(offer,now){
  if(!offer||offer.publicCueBeforeAction)throw Error('C24 duplicate/missing offer');
  offer.publicCueBeforeAction=this.publicCueAt(now);
  offer.threatOutcome={hostileShotEvents:0,hostileNearTracerEvents:0,hostileWeaponHitEvents:0,
   hostileWeaponDamage:0,closestServerTracerMeters:null,
   validity:'AFTER action, server-only labels; displayed tracer segments (max 3), not a bullet flight forecast'};
 }
 currentOffer(explorer,now){
  const o=explorer?.open;
  return o?.threatOutcome&&finite(now)&&now+1e-6>=o.time&&now<o.windowEnd-1e-6?o:null;
 }
 serverShot(now,shot,serverPosition,hostile,explorer){
  if(!hostile||!finite(now))return;
  this.counts.hostileServerShots++;
  const distance=tracerProximityC24(shot,serverPosition);
  const near=distance!==null&&distance<=this.nearMeters;
  if(near)this.counts.hostileNearTracers++;
  const offer=this.currentOffer(explorer,now);
  if(!offer)return;
  const o=offer.threatOutcome;o.hostileShotEvents++;
  if(near)o.hostileNearTracerEvents++;
  if(distance!==null)o.closestServerTracerMeters=round(o.closestServerTracerMeters===null?distance:Math.min(distance,o.closestServerTracerMeters));
 }
 serverWeaponHit(now,damage,explorer){
  if(!finite(now)||!finite(damage)||damage<=0)return;
  this.counts.hostileWeaponHits++;this.counts.hostileWeaponDamage+=damage;
  const offer=this.currentOffer(explorer,now);
  if(offer){offer.threatOutcome.hostileWeaponHitEvents++;offer.threatOutcome.hostileWeaponDamage=round(offer.threatOutcome.hostileWeaponDamage+damage);}
 }
 finish(){return {schema:'fpsarena-c24-threat-trace-audit-v1',...this.counts,
  definitions:{hostileShot:'server-confirmed enemy trigger; may not aim at trainee',
   hostileNearTracer:'at least one of up to 3 public tracer segments within 2.5m of current server trainee torso center, not exact near miss',
   hostileWeaponHit:'server-confirmed positive HP/armor loss with hostile weapon attribution',
   publicCue:'received shot packet before action; includes non-hostile shots and network delay; historical only'}};}
}
