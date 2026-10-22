// C35 research-only: C21 three-arm assignment + C16 safety + C34-style
// PRE-decision public snapshot / POST-decision authoritative audit.
// C35 does not infer unexecuted counterfactuals and never modifies production.
import {EncounterRandomizerC21,C21_ACTIONS,assignedActionC21} from './encounter-randomization-c21.mjs';
import {pressureBandC22} from './risk-aware-encounters-c22.mjs';
import {candidateSetC16} from './safe-action-explorer-c16.mjs';
const finite=Number.isFinite;
const fixed=x=>finite(x)?+x.toFixed(5):null;
const vec=p=>p&&[p.x,p.y,p.z].every(finite)?{x:fixed(p.x),y:fixed(p.y),z:fixed(p.z)}:null;
const keys=['forward','backward','left','right','fire','aim','reload','jump','crouch','slide','prone','skill','use','throw','plate','interact'];
const command=o=>Object.fromEntries(keys.map(k=>[k,!!o?.[k]]));
const aabb=b=>({x0:fixed(b.x0),x1:fixed(b.x1),y0:fixed(b.y0),y1:fixed(b.y1),z0:fixed(b.z0),z1:fixed(b.z1)});
export const C35_SCHEMA='fpsarena-c35-causal-match-v1';
export const C35_HORIZONS=Object.freeze([0.3,0.9,1.8]);
function emptyHorizon(){return {hostileHits:0,hostileDamage:0,damageTaken:0,damageDealt:0,death:false,censored:true};}
export function publicSnapshotC35(client,now,original,map,lagMs,selectedTargetId){
 const own=vec(client?.pos);const mv=client?.local?.mv||{};
 const enemies=(client?.remotes?.list||[]).filter(e=>e?.alive&&e.team!==client?.local?.team&&vec(e.pos));
 const target=enemies.find(e=>String(e.id)===String(selectedTargetId))||enemies.sort((a,b)=>
  Math.hypot(a.pos.x-(own?.x||0),a.pos.z-(own?.z||0))-Math.hypot(b.pos.x-(own?.x||0),b.pos.z-(own?.z||0)))[0];
 const boxList=(client?.map?.boxes||[]).filter(b=>own&&[b.x0,b.x1,b.y0,b.y1,b.z0,b.z1].every(finite)&&
  own.x>=b.x0-9&&own.x<=b.x1+9&&own.z>=b.z0-9&&own.z<=b.z1+9);
 const remoteStamp=target?.buf?.at(-1)?.t;
 return {now:fixed(now),own,ownVelocity:{vx:fixed(mv.vx),vz:fixed(mv.vz)},
  health:fixed(client?.local?.hp),armor:fixed(client?.local?.armor),weapon:client?.local?.weapon?.id||null,
  enemy:target?{id:String(target.id),position:vec(target.pos),bodyYaw:fixed(target.yaw),
   weapon:String(target.data?.w||'').toLowerCase()||null,snapshotTime:fixed(remoteStamp),snapshotAge:fixed(now-remoteStamp)}:null,
  incumbent:command(original),staticMap:{map,nearbyBoxes:boxList.slice(0,48).map(aabb),count:boxList.length},
  configuredLagMs:fixed(lagMs),
  source:'headless client public snapshot BEFORE assignment; server private data unavailable to this function'};
}
export class RandomizedSafeActionC35 extends EncounterRandomizerC21{
 constructor({seed,map,loadout,lagMs,matchId,registrationSHA256=null,...options}={}){
  super({...options,seed,map,loadout,mode:'tdm',offerCooldown:1.8,actionSeconds:.16});
  if(!finite(lagMs)||lagMs<0||lagMs>250||typeof matchId!=='string'||!matchId)throw Error('C35 invalid lag/match identity');
  this.matchId=matchId;this.lagMs=lagMs;this.registrationSHA256=registrationSHA256;
  this.researchTickCount=0;this.hostileEvents=0;this.lastOffer=null;
 }
 command(now,client,original){
  const before=this.offers.length;
  const delivered=super.command(now,client,original);
  if(this.offers.length>before){
   const o=this.offers.at(-1);
   o.schema='fpsarena-c35-causal-offer-v1';o.matchId=this.matchId;
   o.offerId=`${this.matchId}:${this.totalEligible}`;
   o.assignedAction=o.selectedAction;
   o.propensity=1/3;
   o.assignmentMethod='C21 assignedActionC21(seed, eligibleOrdinal)';
   o.registrationSHA256=this.registrationSHA256;
   o.public=publicSnapshotC35(client,now,original,this.map,this.lagMs,o.targetId);
   const gate=candidateSetC16(client,original,now,this.mode);
   if(!gate.eligible||gate.candidates.length!==3)throw Error('C35 safety gate changed between eligibility and recording');
   o.public.clearance=structuredClone(gate.clearance);
   o.public.riskBand=pressureBandC22(o.publicFeatures);
   o.horizons=Object.fromEntries(C35_HORIZONS.map(h=>[String(h),emptyHorizon()]));
   o.outcome.hostileWeaponHits=0;o.outcome.hostileWeaponDamage=0;
   o.deliveredAction=o.assignedAction==='baseline'?'baseline':'micro-action-started';
   o.serverAudit=null;
   o.validity.infoBoundary='publicSnapshotC35 receives only delayed headless client object before server evaluation';
   o.validity.intentionToTreat='original assignedAction never changed by interrupted/delivered ticks';
   this.lastOffer=o;
  }
  if(this.active && now<this.activeUntil-1e-6 && ((this.active.selectedAction==='micro-left'&&delivered.left)||
   (this.active.selectedAction==='micro-right'&&delivered.right)))this.researchTickCount++;
  return delivered;
 }
 afterCommand(now,world,trainee,applied){
  // Post-assignment, PRE Game.step() server audit ONLY. Never an argument to command().
  const o=this.lastOffer;
  if(!o||o.serverAudit||Math.abs(o.time-now)>0.00011)return;
  const enemy=o.public.enemy?world.players.get(o.public.enemy.id):null;
  o.actualFirstCommand=command(applied);
  o.serverAudit={own:vec(trainee),enemy:enemy?{position:vec(enemy),bodyYaw:fixed(enemy.yaw),
    weapon:enemy.ws?.guns?.[enemy.ws?.slot]?.id||null,alive:!!enemy.alive}:null,
   tick:world.tick,mapBoxCount:world.map?.boxes?.length||0,neverInput:true,timing:'postassignment-prestep'};
 }
 serverEvent(now,type,data){
  super.serverEvent(now,type,data);
  const o=this.open;
  if(!o||!finite(now)||now+1e-6<o.time||now>=o.time+1.8-1e-6)return;
  for(const h of C35_HORIZONS){
   if(now>=o.time+h-1e-6)continue;
   const y=o.horizons?.[String(h)];if(!y)continue;
   if(type==='dmg')y.damageTaken+=Math.max(0,Number(data?.h)||0)+Math.max(0,Number(data?.a)||0);
   else if(type==='hit')y.damageDealt+=Math.max(0,Number(data?.dmg)||0);
   else if(type==='kill'&&data?.v==='trainee')y.death=true;
  }
 }
 hostileWeaponHit(now,received){
  const o=this.open;
  if(!o||!finite(now)||!finite(received)||received<=0||now+1e-6<o.time||now>=o.time+1.8-1e-6)return;
  this.hostileEvents++;
  o.outcome.hostileWeaponHits++;
  o.outcome.hostileWeaponDamage=fixed(o.outcome.hostileWeaponDamage+received);
  for(const h of C35_HORIZONS)if(now<o.time+h-1e-6){const y=o.horizons[String(h)];y.hostileHits++;y.hostileDamage=fixed(y.hostileDamage+received);}
 }
 finish(endTime){
  const r=super.finish(endTime);
  r.schema=C35_SCHEMA;
  r.metadata={...r.metadata,checkpoint:'C35',matchId:this.matchId,controlledEnemyPrimary:null,
   snapshotLagMs:this.lagMs,registrationSHA256:this.registrationSHA256,
   design:'C21 uniform 3-arm assignment at C16 symmetrically eligible opportunities; no overlapping 1.8s windows',
   publicState:'C34-style delayed client observations, pre-assignment only',
   serverLabels:'actual observed world.damage and peer server events AFTER assignment; no hypothetical alternative-arm labels',
   intentToTreat:true,productionActuation:false,actionDurationSeconds:.16,horizonSeconds:1.8,
   knownLimits:['Only C16 safe-eligible states','Within-match sequential treatment interference','Headless client local state follows server sync','No real browser interpolation','No human adversary']};
  r.diagnostics.c35={hostileEvents:this.hostileEvents,interventionTicks:this.researchTickCount,
   assignedActionCounts:r.diagnostics.actionCounts};
  for(const o of r.offers){
   const interrupted=!!o.interrupted;
   o.deliveredAction=o.assignedAction==='baseline'?'baseline':interrupted?'interrupted':o.executedTicks>0?'micro-action-delivered':'no-action-delivered';
   o.runtimeOverride=interrupted||o.assignedAction!=='baseline'&&o.executedTicks===0;
   o.actionDurationSeconds=+Math.min(.16,o.executedTicks/60).toFixed(5);
   for(const h of C35_HORIZONS){const y=o.horizons[String(h)];y.censored=!finite(endTime)||endTime<o.time+h-.02;}
   // No post-randomization filter applied to ITT outcome. Incomplete window is censored, NOT zero labeled.
   o.eligibilityBeforeAssignment=o.assignment.eligibleBeforeAssignment;
   if(o.assignedAction!==assignedActionC21(this.seed,Number(o.offerId.split(':').at(-1))))throw Error('C35 assignment replay failure');
  }
  return r;
 }
}
export {C21_ACTIONS};
