/** C35-G: POST-selection telemetry on unchanged C35-E/F commands.
 * Absolutely no callback into exploration, C16, C21, client or the actor.
 * Server weapon state is a labelled *diagnostic proxy*, not legal policy input
 * and not proof of a target, a hit, or a counterfactual shot.
 */
import {curWeapon} from './source-main/shared/weaponstate.js';
import {DT} from './source-main/shared/constants.js';

export const C35G_SCHEMA='fpsarena-c35g-fire-motor-opportunity-audit-v1';
const move=c=>!!(c?.forward||c?.backward||c?.left||c?.right||c?.jump||c?.slide);
const axes=c=>[!!c?.forward,!!c?.backward,!!c?.left,!!c?.right,!!c?.jump,!!c?.slide];
function readyProxy(p){
 const ws=p?.ws;
 if(!p?.alive||p?.down||p?.frozen||p?.air||p?.echelonOwner||!ws||!ws.guns?.[ws.slot])return false;
 let w;try{w=curWeapon(ws);}catch{return false;}
 if(w.unarmed||w.melee||ws.reloading||ws.plateT>DT||ws.switchT>DT||ws.wind>0)return false;
 if(!w.infinite&&ws.guns[ws.slot].mag<=0)return false;
 // A firing-capability proxy; this does NOT model line-of-sight, stance/skill
 // locks, semantic target, burst transitions, or an independent shot outcome.
 return Number(ws.cd||0)<=DT*(1+1e-6);
}
const NAMES=['totalTicks','incumbentFireTicks','appliedFireTicks','fireSuppressionTicks',
 'fireInjectionTicks','incumbentMotionTicks','appliedMotionTicks',
 'movementModifiedTicks','fireAndMotionTicks','readyProxyTicks',
 'readyAndIncumbentFireTicks','readyAndAppliedFireTicks',
 'readyWithoutAppliedFireTicks','serverShotTicks','serverShots','motorActiveTicks',
 'motorWithIncumbentFireTicks','motorWithAppliedFireTicks','motorAndServerShotTicks',
 'motorMovementModifiedTicks'];
export class FiringOpportunityObserverC35G {
 constructor({matchId,policy,storeRows=true}={}){
  if(!matchId||!['shadow80','stagger80'].includes(policy))throw Error('C35G valid match/policy required');
  this.matchId=matchId;this.policy=policy;this.storeRows=storeRows;this.rows=[];
  this.counts=Object.fromEntries(NAMES.map(k=>[k,0]));this.pending=null;
  this.lastNow=-Infinity;this.lastServerShots=0;this.tick=-1;
 }
 beforeStep({now,incumbent,applied,player,serverShots,motorActive}){
  if(this.pending)throw Error('C35G previous tick not closed');
  if(!Number.isFinite(now)||now<=this.lastNow)throw Error('C35G nonmonotonic clock');
  if(!Number.isSafeInteger(serverShots)||serverShots<this.lastServerShots)throw Error('C35G shot counter regression');
  this.lastNow=now;this.tick++;
  const originalFire=!!incumbent?.fire, finalFire=!!applied?.fire;
  const originalMove=move(incumbent),finalMove=move(applied);
  const modified=axes(incumbent).some((v,i)=>v!==axes(applied)[i]);
  this.pending={tick:this.tick,tMs:Math.round(now*1000*100)/100,
   originalFire,finalFire,originalMove,finalMove,movementModified:modified,
   motorActive:!!motorActive,readyProxy:readyProxy(player),serverShotsBefore:serverShots,
   alive:!!player?.alive};
 }
 afterStep({serverShots}){
  const p=this.pending;if(!p)throw Error('C35G afterStep without beforeStep');
  if(!Number.isSafeInteger(serverShots)||serverShots<p.serverShotsBefore)throw Error('C35G shot regression');
  const shots=serverShots-p.serverShotsBefore;
  if(shots>1)throw Error('C35G unexpected multiple trainee shots in one official server tick');
  const c=this.counts;const plus=(name,ok)=>{if(ok)c[name]++;};
  c.totalTicks++;c.serverShots+=shots;
  plus('incumbentFireTicks',p.originalFire);plus('appliedFireTicks',p.finalFire);
  plus('fireSuppressionTicks',p.originalFire&&!p.finalFire);
  plus('fireInjectionTicks',!p.originalFire&&p.finalFire);
  plus('incumbentMotionTicks',p.originalMove);plus('appliedMotionTicks',p.finalMove);
  plus('movementModifiedTicks',p.movementModified);
  plus('fireAndMotionTicks',p.finalFire&&p.finalMove);
  plus('readyProxyTicks',p.readyProxy);
  plus('readyAndIncumbentFireTicks',p.readyProxy&&p.originalFire);
  plus('readyAndAppliedFireTicks',p.readyProxy&&p.finalFire);
  plus('readyWithoutAppliedFireTicks',p.readyProxy&&!p.finalFire);
  plus('serverShotTicks',shots>0);
  plus('motorActiveTicks',p.motorActive);
  plus('motorWithIncumbentFireTicks',p.motorActive&&p.originalFire);
  plus('motorWithAppliedFireTicks',p.motorActive&&p.finalFire);
  plus('motorAndServerShotTicks',p.motorActive&&shots>0);
  plus('motorMovementModifiedTicks',p.motorActive&&p.movementModified);
  if(this.storeRows)this.rows.push({t:p.tMs,of:+p.originalFire,af:+p.finalFire,
    om:+p.originalMove,am:+p.finalMove,dm:+p.movementModified,
    m:+p.motorActive,ready:+p.readyProxy,shots});
  this.lastServerShots=serverShots;this.pending=null;
 }
 finish({serverShots}={}){
  if(this.pending)throw Error('C35G unfinished final tick');
  if(serverShots!==undefined&&this.counts.serverShots!==serverShots)throw Error('C35G server event reconciliation failed');
  if(this.counts.fireSuppressionTicks||this.counts.fireInjectionTicks)throw Error('C35G priority fire input changed under research motor');
  if(this.storeRows&&this.rows.length!==this.counts.totalTicks)throw Error('C35G tick ledger mismatch');
  return {schema:C35G_SCHEMA,matchId:this.matchId,policy:this.policy,counts:{...this.counts},
   labels:'incumbent and applied commands before official Game.step; server-confirmed shot after Game.step',
   readyProxyWarning:'server-only weapon capability diagnostic; NOT public policy input, guaranteed firing window, enemy target, or counterfactual shot',
   rows:this.storeRows?this.rows:undefined};
 }
}
