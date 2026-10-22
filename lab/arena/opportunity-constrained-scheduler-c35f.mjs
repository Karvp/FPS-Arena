/** C35-F research-only: keep every C16-eligible C21 assignment, permit a bounded
 * 1-tick start deferral for high predicted public priority risk. No new arm,
 * no veto, no change to C16, C21, engine or production page agent.
 * It is NOT an efficacy upgrade until tested prospectively.
 */
import {OpportunityPreservingShadowC35E} from './opportunity-preserving-shadow-c35e.mjs';
import {assignedActionC21} from './encounter-randomization-c21.mjs';

export const C35F_SCHEMA='fpsarena-c35f-opportunity-preserving-scheduler-v1';
export const C35F_RISK_THRESHOLD=0.20;
export const C35F_DELAY_TICKS=1;
const TICK_SECONDS=1/60;
const ACTIONS=['micro-left','micro-right'];

export class OpportunityConstrainedSchedulerC35F extends OpportunityPreservingShadowC35E {
 constructor({policy, ...opts}={}) {
  if(policy!=='stagger80')throw Error('C35F policy must be stagger80');
  super({...opts,policy:'shadow80'});
  this.c35fDecisions=[];
  this.c35fDelayed=0;
  this.c35fDeferredTicks=0;
 }
 command(now,client,original){
  const before=this.offers.length;
  const applied=super.command(now,client,original);
  if(this.offers.length===before)return applied;
  const o=this.offers.at(-1);
  const p=this.shadowPending.at(-1);
  if(!p||!p.assigned||p.offerId!==o.offerId)throw Error('C35F missing linked predecision record');
  if(o.assignedAction!==assignedActionC21(this.seed,this.totalEligible))throw Error('C35F C21 assignment corruption');
  const isMicro=ACTIONS.includes(o.assignedAction);
  // Deliberately precommit the threshold, never inspect future labels, damage or server world.
  const shouldDelay=isMicro && p.forecastRisk>=C35F_RISK_THRESHOLD;
  if(shouldDelay){
   // The C21 code has already accounted for an immediate first motor tick.
   // Suppressing its output BEFORE Game.step() requires exact counter rollback.
   const k=o.assignedAction==='micro-left'?'left':'right';
   if(!this.active || this.active!==o || !applied[k] || o.executedTicks!==1)
    throw Error('C35F expected first micro motor tick');
   this.interventionTicks--;this.researchTickCount--;o.executedTicks--;
   this.activeUntil+=TICK_SECONDS;
   this.c35fDelayed++;this.c35fDeferredTicks++;
  }
  const d={offerId:o.offerId,attemptId:p.attemptId,tMs:p.tMs,
   action:o.assignedAction,risk:p.forecastRisk,
   scheduled:shouldDelay?'one-tick-deferral':'immediate',
   deferralTicks:shouldDelay?1:0,
   priorityAtDecision:p.priorityAtDecision,
   assignmentUnchanged:true,predecisionOnly:true};
  this.c35fDecisions.push(d);
  o.c35f=d;
  // Important: this returns the EXACT original incumbent command, never clears its own movement/aim/fire.
  return shouldDelay?{...original}:applied;
 }
 finish(endTime){
  const r=super.finish(endTime);
  if(r.offers.length!==this.c35fDecisions.length)throw Error('C35F lost assignment ledger');
  let delivered=0,requested=0,delayedMicro=0,executedDelayed=0;
  for(const o of r.offers){
   if(!o.c35f || !o.c35f.predecisionOnly)throw Error('C35F orphan offer');
   if(o.assignedAction==='baseline')continue;
   requested+=Math.ceil(this.doseMs/1000*60);
   delivered+=o.executedTicks;
   if(o.c35f.deferralTicks){delayedMicro++;executedDelayed+=o.executedTicks;}
  }
  r.schema=C35F_SCHEMA;
  r.metadata.policy='stagger80';r.metadata.checkpoint='C35-F';
  r.metadata.motorSchedule='one-tick start deferral at >=20% frozen 120ms public-priority risk; no skipped arm';
  r.metadata.researchOnly=true;
  r.metadata.macroForecastStatus='C35-F active opt-in single-tick scheduler; predicts public priority only, no preassignment veto';
  r.c35f={schema:C35F_SCHEMA,policy:'stagger80',riskThreshold:C35F_RISK_THRESHOLD,
   maxDeferralTicks:C35F_DELAY_TICKS,assigned:r.offers.length,
   delayedMicro,requestedMicroTicks:requested,deliveredMicroTicks:delivered,
   deferredMotorTicks:this.c35fDeferredTicks,decisions:this.c35fDecisions};
  if(this.c35fDeferredTicks!==delayedMicro)throw Error('C35F deferral accounting mismatch');
  if(r.diagnostics.interventionTicks!==delivered)throw Error('C35F counter/tick mismatch');
  return r;
 }
}
