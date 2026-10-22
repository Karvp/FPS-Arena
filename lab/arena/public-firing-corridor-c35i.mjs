/** C35-I: predecision PUBLIC firing-lane diagnostics, HEADLESS RESEARCH ONLY.
 * Evaluates the incumbent's own weapon against client-delayed target and
 * client static map. Server shots are appended only after Game.step() as labels.
 * An observer: never changes, selects, or suggests any actuation.
 */
import {WEAPONS} from './source-main/shared/weapons.js';
import {publicPolicyState} from './encounter-policy-recorder-c13.mjs';
import {publicClearanceC14} from './safe-action-explorer-c14.mjs';
export const C35I_SCHEMA='fpsarena-c35i-public-firing-corridor-v1';
const finite=Number.isFinite;
const n=x=>finite(x)?+x.toFixed(5):null;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const moving=x=>!!(x?.forward||x?.backward||x?.left||x?.right);
function box2DLine(x,z,ex,ez,b){
 // Slab intersection on [0,1] with public static solid footprint. Conservative
 // xz occlusion proxy, NOT server LOS (doesn't account for low cover heights).
 let low=0,high=1;
 for(const [p,v,min,max] of [[x,ex-x,b.x0,b.x1],[z,ez-z,b.z0,b.z1]]){
  if(![p,v,min,max].every(finite))return true;
  if(Math.abs(v)<1e-9){if(p<min||p>max)return false;continue;}
  const t0=(min-p)/v,t1=(max-p)/v;
  low=Math.max(low,Math.min(t0,t1));high=Math.min(high,Math.max(t0,t1));
  if(low>high)return false;
 }
 return high>Math.max(low,0)&&low<1;
}
export function publicFiringLaneC35I(client,cmd,now,{mode='tdm',clearanceDistance=.8}={}){
 const s=publicPolicyState(client,now),f=s.features;
 const id=s.weaponId,w=WEAPONS[id];
 const reasons=[];
 if(mode!=='tdm')reasons.push('mode');
 if(!finite(now)||now<0)reasons.push('invalid-clock');
 if(!client?.local?.alive||client.local.down||client.local.frozen)reasons.push('player-unavailable');
 if(!s.eligible||!finite(f.snapshotAge)||f.snapshotAge>.2)reasons.push('stale-public-target');
 if(!w||w.unarmed||w.melee||w.skillWeapon||!Array.isArray(w.range)||!finite(w.range[1]))reasons.push('unknown-weapon');
 const localPos=client?.pos, yaw=client?.rig?.yaw;
 const remote=client?.remotes?.list?.find(q=>String(q.id)===s.targetId);
 if(![localPos?.x,localPos?.z,remote?.pos?.x,remote?.pos?.z,yaw].every(finite))reasons.push('missing-public-geometry');
 let bearingDeg=null, rangeFraction=null, los=null,sideClearance={left:false,right:false},laneScore=null;
 if(reasons.length===0){
  const dx=remote.pos.x-localPos.x,dz=remote.pos.z-localPos.z;
  const d=Math.hypot(dx,dz);
  const aimDot=clamp(((-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/d),-1,1);
  bearingDeg=180*Math.acos(aimDot)/Math.PI;
  rangeFraction=d/w.range[1];
  const boxes=client?.map?.boxes;
  if(!Array.isArray(boxes)||boxes.some(b=>![b.x0,b.x1,b.z0,b.z1].every(finite))){reasons.push('invalid-public-map');}
  else {
   los=!boxes.some(b=>box2DLine(localPos.x,localPos.z,remote.pos.x,remote.pos.z,b));
   sideClearance={left:publicClearanceC14(client,cmd,-1,{distance:clearanceDistance}),right:publicClearanceC14(client,cmd,1,{distance:clearanceDistance})};
   // All components are proxies, not learned utility nor guaranteed accuracy.
   const angular=clamp(1-bearingDeg/35);
   const distanceQuality=clamp(1-Math.max(0,rangeFraction-1)*.6);
   const mobility=(Number(sideClearance.left)+Number(sideClearance.right))/2;
   laneScore=n((los?1:0)*angular*distanceQuality*(.6+.4*mobility));
  }
 }
 const orientation=bearingDeg===null?'unknown':bearingDeg<=10?'aligned':bearingDeg<=30?'near':'off-axis';
 const band=rangeFraction===null?'unknown':rangeFraction<=.6?'near':rangeFraction<=1?'effective':rangeFraction<=1.6?'far':'extreme';
 return {valid:reasons.length===0,reasons,targetId:s.targetId,weaponId:id,
  weaponClass:w?.cat??'unknown',publicAge:n(f.snapshotAge),distance:n(f.distance),
  weaponFalloffEnd:w?.range?.[1]??null,weaponMaxRange:w?.maxRange??null,
  bearingDeg:n(bearingDeg),rangeFraction:n(rangeFraction),orientation,rangeBand:band,
  staticFootprintClear:los,sideClearance,laneScore,
  incumbent:{fire:!!cmd?.fire,aim:!!cmd?.aim,moving:moving(cmd),forward:!!cmd?.forward,
   lateral:!!(cmd?.left||cmd?.right)},
  warnings:['static 2D footprint proxy is conservative, not actual 3D LOS',
   'nearest visible hostile is not necessarily the commanded aim target']};
}
export class PublicFiringCorridorObserverC35I {
 constructor({matchId,policy,mode='tdm',samplePeriod=1,maxSamples=3000}={}){
  if(!matchId||!['observe','lateral'].includes(policy)||!Number.isInteger(samplePeriod)||samplePeriod<1||samplePeriod>30||!Number.isInteger(maxSamples)||maxSamples<1)throw Error('C35I configuration invalid');
  this.matchId=matchId;this.policy=policy;this.mode=mode;
  this.samplePeriod=samplePeriod;this.maxSamples=maxSamples;this.rows=[];this.pending=null;
  this.lastNow=-Infinity;this.ticks=0;
  this.counts={ticks:0,incumbentFire:0,appliedFire:0,suppressed:0,injected:0,incumbentFireMove:0,appliedFireMove:0,
   sampledFire:0,validSamples:0,staticClearSamples:0,bilateralClearSamples:0,macroModifiedSamples:0,
   sampledServerShots:0,sampledServerHits:0,unsampledFire:0,storedDropped:0,byWeapon:{},byRangeBand:{},byOrientation:{}};
 }
 beforeStep({now,client,incumbent,applied,serverShots,serverHits}){
  if(this.pending)throw Error('C35I pending tick not closed');
  if(!finite(now)||now<=this.lastNow)throw Error('C35I nonmonotonic clock');
  if(!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits))throw Error('C35I invalid server baseline');
  this.lastNow=now;
  const c=this.counts;c.ticks++;this.ticks++;
  const of=!!incumbent?.fire,af=!!applied?.fire;
  if(of)c.incumbentFire++;if(af)c.appliedFire++;
  if(of&&!af)c.suppressed++;if(!of&&af)c.injected++;
  if(of&&moving(incumbent))c.incumbentFireMove++;
  if(af&&moving(applied))c.appliedFireMove++;
  let sample=null;
  if(of&&(this.ticks-1)%this.samplePeriod===0){
   sample=publicFiringLaneC35I(client,incumbent,now,{mode:this.mode});
   c.sampledFire++;
   const by=(obj,key)=>obj[key]=(obj[key]||0)+1;
   by(c.byWeapon,sample.weaponId);by(c.byRangeBand,sample.rangeBand);by(c.byOrientation,sample.orientation);
   if(sample.valid)c.validSamples++;
   if(sample.staticFootprintClear===true)c.staticClearSamples++;
   if(sample.sideClearance.left&&sample.sideClearance.right)c.bilateralClearSamples++;
   if(applied.left!==incumbent.left||applied.right!==incumbent.right)c.macroModifiedSamples++;
  }else if(of)c.unsampledFire++;
  this.pending={sample,t:n(now),serverShots,serverHits};
 }
 afterStep({serverShots,serverHits}){
  const p=this.pending;if(!p)throw Error('C35I afterStep missing beforeStep');
  if(!Number.isSafeInteger(serverShots)||!Number.isSafeInteger(serverHits)||serverShots<p.serverShots||serverHits<p.serverHits)throw Error('C35I nonmonotonic server counters');
  if(p.sample){
   this.counts.sampledServerShots+=serverShots-p.serverShots;
   this.counts.sampledServerHits+=serverHits-p.serverHits;
   if(this.rows.length<this.maxSamples)this.rows.push({time:p.t,...p.sample,serverLabelsAfterStep:{shots:serverShots-p.serverShots,hits:serverHits-p.serverHits}});
   else this.counts.storedDropped++;
  }
  this.pending=null;
 }
 finish(){
  if(this.pending)throw Error('C35I unfinished tick');
  if(this.counts.suppressed||this.counts.injected)throw Error('C35I original fire has been modified');
  if(this.counts.sampledFire+this.counts.unsampledFire!==this.counts.incumbentFire)throw Error('C35I sample denominator mismatch');
  if(this.counts.sampledFire!==this.rows.length+this.counts.storedDropped)throw Error('C35I stored row count mismatch');
  return {schema:C35I_SCHEMA,matchId:this.matchId,policy:this.policy,
   preregisteredSampling:{everyNthGameTick:this.samplePeriod,maxRows:this.maxSamples,allTickDenominatorsRecorded:true},
   inferenceBoundary:'PUBLIC BEFORE Game.step; server shot/hit labels AFTER Game.step, never policy inputs',
   causalStatus:'descriptive observational proxy; no counterfactual and not safe actuation',counts:this.counts,rows:this.rows};
 }
}
