// C35-C integrated opt-in experiment. C21 and C16 are never replaced.
// Public-only/causal preoffer eligibility; research-only; no production changes.
import {MicroActionReliabilityC35B} from './micro-action-reliability-c35b.mjs';
import {PublicPriorityForecasterC35D} from './macro-forecast-policy-c35d.mjs';
import {candidateSetC16} from './safe-action-explorer-c16.mjs';
import {decideC35CPreoffer,C35CPreofferAudit,C35COfferLedger,
 publicRiskBin,validateC35CConfig} from './c35c-option-arbitration.mjs';

const finite = Number.isFinite;
const KEYS=['fire','reload','skill','use','interact','plate','throw','jump','crouch','slide','prone'];
export const C35C_POLICIES=Object.freeze(['legacy80','hierarchical80','predictive80']);
export const C35C_SCHEMA='fpsarena-c35c-integrated-prospective-match-v1';
const ROUND=x=>finite(x)?+x.toFixed(5):null;

/** An explicitly labelled *heuristic*, not a learned/validated predictor.
 * Only the public incumbent command and its PAST history can be used.
 * Future server actions, postdecision C16 diagnosis and outcome labels are forbidden.
 */
export class PublicMacroQuietTimeC35C {
 constructor({quietMs=200,safeForecastMs=250}={}){
  this.quietMs=quietMs;this.safeForecastMs=safeForecastMs;
  this.quietSinceMs=null;this.lastNowMs=-Infinity;
 }
 observe(nowMs,cmd){
  if(!finite(nowMs)||nowMs<this.lastNowMs)throw Error('C35C non-monotone macro clock');
  this.lastNowMs=nowMs;
  const busy=KEYS.some(k=>cmd?.[k]===true)||finite(cmd?.slot)&&cmd.slot>=0;
  if(busy)this.quietSinceMs=null;
  else if(this.quietSinceMs===null)this.quietSinceMs=nowMs;
  return {source:'public-prediction',kind:'engage',
   nextPriorityEtaMs:!busy&&nowMs-this.quietSinceMs>=this.quietMs?this.safeForecastMs:0,
   type:'past-incumbent-quiet-time-heuristic',historicalQuietMs:
    this.quietSinceMs===null?0:ROUND(nowMs-this.quietSinceMs)};
 }
}

function packetFromPublic(now,cmd,set,forecast){
 const observedAge=set?.state?.features?.snapshotAge;
 const stamp=finite(observedAge)&&observedAge>=0?(now-observedAge)*1000:null;
 const priority=!!(cmd?.use||cmd?.interact||cmd?.plate||cmd?.throw);
 const emergency=!!(cmd?.jump||cmd?.crouch||cmd?.slide||cmd?.prone);
 const symmetric=Object.fromEntries(['baseline','micro-left','micro-right'].map(a=>
  [a,!!set?.eligible&&set?.candidates?.includes(a)]));
 return {nowMs:Number((now*1000).toFixed(2)),publicSnapshot:{observedAtMs:stamp},
  incumbent:{source:'public-local',fire:!!cmd?.fire,reload:!!cmd?.reload,
   skill:!!cmd?.skill,objective:priority,emergency},macro:forecast,
  symmetricC16:symmetric,threat:null};
}

/**
 * Subclass at the precise C21 nextOfferAt boundary, leaving historical C21
 * hash and C16 per-tick action code untouched. If hierarchy vetoes an eligible
 * C16 opportunity, log it and schedule the same C21 rejection backoff; NO arm
 * is drawn and no intervention is delivered. All rejected probes remain counted.
 */
export class MacroMicroIntegrationC35C extends MicroActionReliabilityC35B {
 constructor({policy,setupId,forecastModel=null,...options}={}){
  if(!C35C_POLICIES.includes(policy)||!setupId)throw Error('C35C invalid policy/setupId');
  super({...options,doseMs:80});
  this.policy=policy;this.setupId=String(setupId);
  this.c35cConfig=validateC35CConfig();
  this.c35cMacro=policy==='predictive80'?new PublicPriorityForecasterC35D(forecastModel):new PublicMacroQuietTimeC35C();
  this.c35cPreoffers=new C35CPreofferAudit();
  this.c35cLedger=new C35COfferLedger({windowMs:this.c35cConfig.windowMs});
  this.c35cBlocked={};this.c35cAttempts=0;this.c35cEligible=0;
 }
 command(now,client,original){
  if(!finite(now)||now<0)return super.command(now,client,original);
  const macro=this.c35cMacro.observe(now*1000,original);
  // Every attempt is counted, including C16 rejection, stale snapshots and
  // hierarchical macro refusals. Active micro ticks are always delegated to C16.
  if(now+1e-6<this.nextOfferAt || this.offers.length>=this.maximumOffers)
   return super.command(now,client,original);
  const set=candidateSetC16(client,original,now,this.mode);
  const packet=packetFromPublic(now,original,set,macro);
  const decision=this.policy==='legacy80'?{
   eligible:set.eligible,reason:set.eligible?'legacy-c16-eligible':set.reasons.join('|')||'legacy-c16-refusal',
   availableArms:set.eligible?[...set.candidates]:[],riskBin:publicRiskBin(null),durationMs:80,
   predecisionOnly:true,requiresAuthoritativePerTickC16:true,
  }:decideC35CPreoffer(packet,this.c35cConfig);
  const attemptId=`${this.matchId}:attempt:${++this.c35cAttempts}`;
  this.c35cPreoffers.record({attemptId,matchId:this.matchId,setupId:this.setupId,
   nowMs:packet.nowMs,decision:{...decision,predictedPriorityRisk120ms:macro.predictedPriorityRisk120ms??null}});
  if(decision.eligible)this.c35cEligible++;
  if(this.policy!=='legacy80' && set.eligible && !decision.eligible){
   // The only new actuation change: research micro never overrides existing
   // macro controls; a skipped opportunity does not consume a C21 ordinal.
   this.probes++;this.rejected++;
   this.skipped['c35c-'+decision.reason]=(this.skipped['c35c-'+decision.reason]||0)+1;
   this.c35cBlocked[decision.reason]=(this.c35cBlocked[decision.reason]||0)+1;
   this.nextOfferAt=now+this.rejectionRetrySeconds;
   return {...original};
  }
  const previous=this.offers.length;
  const applied=super.command(now,client,original);
  if(this.offers.length>previous){
   const o=this.offers.at(-1);
   if(!decision.eligible || !set.eligible)throw Error('C35C preassignment mismatch');
   o.c35c={attemptId,policy:this.policy,setupId:this.setupId,riskBin:decision.riskBin,
    macroHeuristic:macro.type,macroQuietMs:macro.historicalQuietMs,
    predictedPriorityRisk120ms:macro.predictedPriorityRisk120ms??null,
    forecastPriorityEtaMs:macro.nextPriorityEtaMs,predecisionOnly:true,
    allThreeArmsC16Eligible:true};
   this.c35cLedger.recordAssignment({offerId:o.offerId,attemptId,policy:this.policy,
    matchId:this.matchId,setupId:this.setupId,startMs:packet.nowMs,
    assignment:o.assignedAction,decision,propensity:{baseline:1/3,'micro-left':1/3,'micro-right':1/3}});
  }else if(decision.eligible&&set.eligible){
   throw Error('C35C preoffer unexpectedly failed to assign');
  }
  return applied;
 }
 finish(endTime){
  const r=super.finish(endTime);
  for(const o of r.offers){
   if(!o.c35c)throw Error('C35C missing prospective linkage');
   const complete=o.outcome.censored===false;
   this.c35cLedger.recordPostdecision({offerId:o.offerId,completed:complete,
    executedTicks:o.assignedAction==='baseline'?0:o.executedTicks,
    plannedTicks:Math.ceil(this.doseMs/1000*60),
    interruptReason:o.interrupted?o.c35b?.interruption?.reasons?.[0]||'c16-refusal':null,
    hostileHits:complete?o.outcome.hostileWeaponHits:null,
    hitPositive:complete?o.outcome.hostileWeaponHits>0:null,
    shotsFired:o.outcome.shots,shotsLost:null,
    damageTaken:o.outcome.damageTaken,damageDealt:o.outcome.damageDealt});
  }
  r.schema=C35C_SCHEMA;r.metadata.checkpoint=this.policy==='predictive80'?'C35-D2':'C35-C3';r.metadata.policy=this.policy;
  r.metadata.setupId=this.setupId;r.metadata.design+='; C35C predecision macro arbitration at 80ms, causal heuristic only';
  r.metadata.macroForecastStatus=this.policy==='predictive80'?'independently trained public command logistic; forecast proxy, NOT verified motor utility':'public past-command quiet-time HEURISTIC, not calibrated or validated';
  r.c35c={preoffers:this.c35cPreoffers.rows().map(p=>({...p,policy:this.policy})),offers:this.c35cLedger.rows(),
   diagnostics:{attempts:this.c35cAttempts,predecisionEligible:this.c35cEligible,
    recordedAssignments:r.offers.length,blockedByMacro:this.c35cBlocked,
    coverageVsAttempts:this.c35cAttempts?r.offers.length/this.c35cAttempts:null}};
  if(r.c35c.offers.length!==r.offers.length||this.c35cLedger.pendingCount()!==0)
   throw Error('C35C postdecision ledger not closed');
  return r;
 }
}
