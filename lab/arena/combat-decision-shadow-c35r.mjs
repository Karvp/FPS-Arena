/** C35-R: public-only combat decision opportunities; NEVER actuates.
 * Public data frozen before authoritative Game.step(); server labels only after.
 * No ballistic truth/health from server enters candidate evaluation.
 */
import {publicLOSStratumC35K} from './public-target-los-c35k.mjs';
import {publicConfidenceC35P} from './public-target-confidence-c35p.mjs';
import {snapshotForShotC35O} from './public-track-freshness-c35o.mjs';
export const C35R_SCHEMA='fpsarena-c35r-combat-decision-shadow-v1';
const good=Number.isFinite;
const WEAPON_CATEGORIES=Object.freeze({mp5sd:'smg',m4a1:'rifle',aa12:'shotgun',hk_sl8:'dmr',uzi:'smg',l115a3:'sniper'});
export const C35R_REASONS=Object.freeze(['no-public-target','stale-snapshot','no-aim-alignment','static-cover','candidate-observable']);
export function combatCandidateC35R(client,now,cmd,model,{weapon='m4a1'}={}){
 if(!good(now)||now<0||!WEAPON_CATEGORIES[weapon])throw Error('C35R invalid public clock/weapon');
 const stratum=publicLOSStratumC35K(client,now,cmd);
 const confidence=publicConfidenceC35P(client,now,model);
 const shot=snapshotForShotC35O(client,now).thresholdsMs['350'];
 const age=confidence?.publicAgeMs;
 const aimId=stratum.aimCandidateId;
 const aimSeparation=shot?.aimAngleDeg;
 let reason='candidate-observable';
 if(!stratum.valid||!aimId)reason='no-public-target';
 else if(!confidence.eligible||!good(age)||age>275)reason='stale-snapshot';
 else if(!good(aimSeparation)||aimSeparation>8)reason='no-aim-alignment';
 else if(stratum.nearest3DClear===false&&stratum.aimCandidateId===stratum.targetId)reason='static-cover';
 const category=WEAPON_CATEGORIES[weapon];
 // These are only diagnostic reasons, NOT firing instructions or counterfactual truth.
 return {provenance:'PUBLIC_BEFORE_STEP_ONLY',reason,category,weapon,
  incumbentFire:cmd?.fire===true,incumbentAim:cmd?.aim===true,
  incumbentMoving:!!(cmd?.forward||cmd?.backward||cmd?.left||cmd?.right),
  targetId:aimId??null,ageMs:good(age)?age:null,
  nearestStaticLOS:stratum.nearest3DClear===true,nearestEqualsAim:aimId===stratum.targetId,
  targetAngularSeparationDeg:good(aimSeparation)?aimSeparation:null,
  pHit:confidence?.eligible?confidence.pHit:null,
  // Never assume an unobserved opponent's position, client LOS is not shot truth.
  candidateEligible:reason==='candidate-observable'};
}
export class CombatDecisionShadowC35R{
 constructor({matchId,model,weapon='m4a1',sampleEvery=6,maxRows=5000}={}){
  if(!matchId||!WEAPON_CATEGORIES[weapon]||!Number.isInteger(sampleEvery)||sampleEvery<1||sampleEvery>60||
    !Number.isInteger(maxRows)||maxRows<1)throw Error('C35R invalid configuration');
  this.matchId=matchId;this.model=model;this.weapon=weapon;this.sampleEvery=sampleEvery;this.maxRows=maxRows;
  this.rows=[];this.pending=null;this.last=-Infinity;this.tick=0;
  this.counts={ticks:0,fireIntents:0,confirmedShots:0,candidateSamples:0,noFireSamples:0,
    sampledEligible:0,modifiedCommands:0,storedDropped:0,reasonCounts:{}};
 }
 beforeStep({now,client,incumbent,applied,serverShots}){
  if(this.pending||!good(now)||now<=this.last||!Number.isSafeInteger(serverShots))throw Error('C35R pre-step ordering');
  this.last=now;this.tick++;this.counts.ticks++;
  // Exact structural equality across all applied/command values cannot be expected
  // because C21 micro may alter movement, but C35R itself makes NO actuation.
  if(incumbent?.fire!==applied?.fire)this.counts.modifiedCommands++;
  if(incumbent?.fire)this.counts.fireIntents++;
  const sample=!!incumbent?.fire||this.tick%this.sampleEvery===0;
  let row=null;
  if(sample){
   const candidate=combatCandidateC35R(client,now,incumbent,this.model,{weapon:this.weapon});
   row={t:+now.toFixed(6),publicBeforeStep:JSON.parse(JSON.stringify(candidate)),serverLabelsAfterStep:null};
   this.counts.candidateSamples++;
   if(!incumbent?.fire)this.counts.noFireSamples++;
   if(candidate.candidateEligible)this.counts.sampledEligible++;
   this.counts.reasonCounts[candidate.reason]=(this.counts.reasonCounts[candidate.reason]||0)+1;
  }
  this.pending={row,serverShots,wasFire:!!incumbent?.fire};
 }
 afterStep({serverShots}){
  const p=this.pending;
  if(!p||!Number.isSafeInteger(serverShots)||serverShots<p.serverShots)throw Error('C35R after-step ordering');
  const shots=serverShots-p.serverShots;this.counts.confirmedShots+=shots;
  if(shots&&!p.wasFire)throw Error('C35R server shot without public fire intent');
  if(p.row){p.row.serverLabelsAfterStep={confirmedShots:shots};
   if(this.rows.length<this.maxRows)this.rows.push(p.row);else this.counts.storedDropped++;}
  this.pending=null;
 }
 finish(){
  if(this.pending||this.counts.modifiedCommands||this.counts.candidateSamples!==this.rows.length+this.counts.storedDropped||
    Object.values(this.counts.reasonCounts).reduce((a,b)=>a+b,0)!==this.counts.candidateSamples)
    throw Error('C35R audit invariant failed');
  return {schema:C35R_SCHEMA,matchId:this.matchId,scope:'PASSIVE ONLY; no production or research control changed',
   caveat:'Non-firing samples are opportunities for descriptive analysis, NOT causal missed shots or guaranteed fire readiness',
   weapon:this.weapon,sampleEvery:this.sampleEvery,counts:this.counts,rows:this.rows};
 }
}
