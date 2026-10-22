/** C35-AD: preregistrable ADS pre-fire / retention randomization, research only.
 * All eligibility/assignments precede Game.step(); only ADS may change, and
 * NEVER on ticks with fire intent. Factual 0.7s windows, unselected unknown.
 */
import {publicAimMovementFeaturesC35AA} from './aim-movement-audit-c35aa.mjs';
export const C35AD_SCHEMA='fpsarena-c35ad-prefire-ads-v1';
const finite=Number.isFinite;
const num=x=>finite(x)?+x.toFixed(5):null;
function mix32(x){x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return(x^(x>>>16))>>>0;}
export function assignC35AD(seed,index){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(index)||index<1)throw Error('C35AD invalid RNG seed/offer');
 return mix32((seed^Math.imul(index,0x69ba01d3)^0xc35ad734)>>>0)<0x80000000?'control':'toggle';
}
const priority=['skill','use','reload','jump','crouch','slide','prone','interact'];
export class PrefireAdsRandomizerC35AD{
 constructor({seed,matchId,setupId,weapon,policy='observe',windowSeconds=.7,doseSeconds=.28,cooldownSeconds=1.2,maxOffers=300}={}){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!matchId||!setupId||!weapon||!['observe','randomized'].includes(policy)||
   !finite(windowSeconds)||windowSeconds<.5||windowSeconds>1||!finite(doseSeconds)||doseSeconds<.1||doseSeconds>=windowSeconds||
   !finite(cooldownSeconds)||cooldownSeconds<windowSeconds||!Number.isSafeInteger(maxOffers)||maxOffers<1)throw Error('C35AD invalid config');
  Object.assign(this,{seed,matchId,setupId,weapon,policy,windowSeconds,doseSeconds,cooldownSeconds,maxOffers,lastNow:-Infinity,nextAt:0,active:null,pendingStep:false,rows:[],counts:{ticks:0,eligible:0,control:0,toggle:0,baselineADS:0,baselineHip:0,changedTicks:0,changeAttempted:0,shotsObserved:0,hitShotsObserved:0,pelletHitsObserved:0,completed:0,censored:0,fireModified:0,unsafeCancelled:0,refused:{}}});
 }
 refuse(reason){this.counts.refused[reason]=(this.counts.refused[reason]||0)+1;}
 eligible(now,client,original,applied){
  if(!!original?.fire!==!!applied?.fire){this.counts.fireModified++;throw Error('C35AD upstream fire mutation');}
  if(Object.keys({...original,...applied}).some(k=>original[k]!==applied[k]))return {ok:false,reason:'upstream-priority'};
  if(!!applied?.fire)return {ok:false,reason:'fire-intent'};
  if(priority.some(k=>!!applied?.[k])||applied?.lean)return {ok:false,reason:'priority-action'};
  const m=client?.local?.mv;
  if(client?.local?.alive===false||client?.local?.down||client?.local?.frozen||!m?.onGround||m.slideT>0||m.zip||m.heli||m.air||m.hk||m.gs)return {ok:false,reason:'unsafe-motion-state'};
  const f=publicAimMovementFeaturesC35AA(now,client,applied,{weapon:this.weapon,maxAge:.275});
  if(!f.valid||f.targetStatus!=='fresh'||f.targetAgeMs===null||f.targetAgeMs<0||f.targetAgeMs>275||f.aimAngleDeg===null||f.aimAngleDeg>14||f.targetRange<2||f.targetRange>100)return {ok:false,reason:'no-fresh-target'};
  return {ok:true,f};
 }
 command(now,client,original,applied){
  if(!finite(now)||now<=this.lastNow||this.pendingStep)throw Error('C35AD time/phase');
  this.lastNow=now;this.counts.ticks++;this.pendingStep=true;
  if(this.policy==='observe')return applied;
  if(this.active){
   const row=this.active;
   if(now<row.start+this.doseSeconds&&row.assignedArm==='toggle'){
    const safety=this.eligible(now,client,original,applied);
    if(safety.ok&&safety.f.targetId===row.publicFeatures.targetId){
     const out={...applied,aim:!row.baselineADS};
     if(!!out.fire!==!!applied.fire||Object.keys({...applied,...out}).some(k=>out[k]!==applied[k]&&k!=='aim'))throw Error('C35AD exceeded ADS action boundary');
     row.doseTicks++;if(out.aim!==!!applied.aim){row.changedTicks++;this.counts.changedTicks++;}
     return out;
    }
    row.interruptions++;this.counts.unsafeCancelled++;
   }
   return applied;
  }
  if(now<this.nextAt||this.rows.length>=this.maxOffers)return applied;
  const e=this.eligible(now,client,original,applied);
  if(!e.ok){this.refuse(e.reason);return applied;}
  const index=this.rows.length+1,arm=assignC35AD(this.seed,index),baselineADS=!!applied.aim;
  const row={schema:C35AD_SCHEMA,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,index,start:num(now),baselineADS,assignedArm:arm,
    propensity:.5,assignmentDistribution:{control:.5,toggle:.5},publicFeatures:e.f,baselineCommand:{...applied},
    firstCommand:null,doseTicks:0,changedTicks:0,interruptions:0,
    outcome:null,unselectedOutcome:null,provenance:'PRE_STEP_PUBLIC_RANDOMIZED_ADS_ONLY'};
  this.active=row;this.rows.push(row);this.nextAt=now+this.cooldownSeconds;this.counts.eligible++;this.counts[arm]++;this.counts[baselineADS?'baselineADS':'baselineHip']++;
  let out=applied;
  if(arm==='toggle'){
   this.counts.changeAttempted++;out={...applied,aim:!baselineADS};row.doseTicks++;row.changedTicks++;this.counts.changedTicks++;
  }
  row.firstCommand={...out};
  row.outcome={observedSteps:0,serverShots:0,serverHitEvents:0,confirmedBallisticShots:0,hitShots:0,hitPellets:0,serverKills:0,damageTaken:0,aliveAtLastStep:null,complete:false,censored:false,source:'FACTUAL_AUTHORITATIVE_AFTER_STEP_ONLY'};
  return out;
 }
 onShot(shot){
  const row=this.active;if(!row)return;
  if(shot?.schema!=='fpsarena-c35l-authoritative-ballistics-v1'||!Array.isArray(shot.pellets))throw Error('C35AD malformed ballistic truth');
  row.outcome.confirmedBallisticShots++;
  const hits=shot.pellets.filter(p=>p.hitKind==='player').length;
  row.outcome.hitShots+=+(hits>0);row.outcome.hitPellets+=hits;
 }
 afterStep({now,serverShotsBefore,serverShotsAfter,serverHitsBefore,serverHitsAfter,serverKillsBefore,serverKillsAfter,damageBefore,damageAfter,alive}){
  if(!this.pendingStep||!finite(now)||![serverShotsBefore,serverShotsAfter,serverHitsBefore,serverHitsAfter,serverKillsBefore,serverKillsAfter].every(Number.isSafeInteger)||
   ![damageBefore,damageAfter].every(finite))throw Error('C35AD invalid after-step phase');
  this.pendingStep=false;
  if(serverShotsAfter<serverShotsBefore||serverHitsAfter<serverHitsBefore||serverKillsAfter<serverKillsBefore||damageAfter<damageBefore)throw Error('C35AD counters reversed');
  const r=this.active;if(!r)return;
  const o=r.outcome;o.observedSteps++;o.serverShots+=serverShotsAfter-serverShotsBefore;o.serverHitEvents+=serverHitsAfter-serverHitsBefore;
  o.serverKills+=serverKillsAfter-serverKillsBefore;o.damageTaken+=damageAfter-damageBefore;o.aliveAtLastStep=!!alive;
  if(o.confirmedBallisticShots!==o.serverShots)throw Error('C35AD authoritative shot parity');
  if(now-r.start>=this.windowSeconds-1e-6){o.complete=true;this.counts.completed++;this.counts.shotsObserved+=o.serverShots;this.counts.hitShotsObserved+=o.hitShots;this.counts.pelletHitsObserved+=o.hitPellets;this.active=null;}
 }
 finish(){
  if(this.pendingStep||this.counts.fireModified)throw Error('C35AD unmatched steps/fire mutation');
  if(this.active){this.active.outcome.censored=true;this.counts.censored++;this.active=null;}
  if(this.counts.eligible!==this.rows.length||this.counts.control+this.counts.toggle!==this.rows.length||this.counts.completed+this.counts.censored!==this.rows.length)throw Error('C35AD final invariant');
  return {schema:C35AD_SCHEMA,policy:this.policy,seed:this.seed,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,
   counts:this.counts,rows:this.rows,caveat:'Randomized pre-fire ADS impulse: within-setup dependent offers; factual 0.7-second ITT results only; no unselected labels; no randomized ADS state at the moment of shooting. Does not establish causal long-term combat benefit.'};
 }
}
