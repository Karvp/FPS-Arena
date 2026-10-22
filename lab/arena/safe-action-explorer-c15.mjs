// C15 — faster retries ONLY after failed safety checks. Does not relax C14
// candidate validity, action duration, intervention priority or per-offer cooldown.
// All code is confined to headless research. Production code is never imported.
import {SafeActionExplorerC14,matchAssignmentC14} from './safe-action-explorer-c14.mjs';

const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(5):null;
export {matchAssignmentC14 as matchAssignmentC15};
export class SafeActionExplorerC15 extends SafeActionExplorerC14{
 constructor({rejectionRetrySeconds=.12,...options}={}){
  super(options);
  if(!finite(rejectionRetrySeconds)||rejectionRetrySeconds<.08||rejectionRetrySeconds>.3||
      rejectionRetrySeconds>=this.offerCooldown)throw Error('invalid C15 retry interval');
  this.rejectionRetrySeconds=rejectionRetrySeconds;
  this.probes=0;this.rejectedProbes=0;this.eligibleProbes=0;
  this.rejectionReasons={};this.firstRejectionReasons={};this.probeIntervalMin=null;
  this.lastProbeTime=null;
 }
 command(now,client,original){
  // Observe the exact eligibility probe that C14 will perform. No independent
  // geometry scan (and no additional access to simulation-private state).
  const wasDue=finite(now)&&now+1e-6>=this.nextOfferAt;
  const previouslyEligible=this.totalEligible;
  const previousSkipped={...this.skipped};
  const ret=super.command(now,client,original);
  if(!wasDue)return ret;
  this.probes++;
  if(this.lastProbeTime!==null){
   const interval=now-this.lastProbeTime;
   if(interval>=0)this.probeIntervalMin=this.probeIntervalMin===null?interval:Math.min(interval,this.probeIntervalMin);
  }
  this.lastProbeTime=now;
  if(this.totalEligible>previouslyEligible){this.eligibleProbes++;return ret;}
  this.rejectedProbes++;
  const newReasons=Object.keys(this.skipped).filter(k=>(this.skipped[k]||0)>(previousSkipped[k]||0));
  for(const reason of newReasons)this.rejectionReasons[reason]=(this.rejectionReasons[reason]||0)+1;
  if(newReasons.length){
   // First blocker is diagnostic categorization only. Actual eligibility still
   // evaluates every C14 safety reason, including geometry and priority input.
   const r=newReasons[0];this.firstRejectionReasons[r]=(this.firstRejectionReasons[r]||0)+1;
  }
  // A failed probe is NOT a successful opportunity. Revisit soon so short,
  // naturally arising safe states are not systematically skipped; successful
  // opportunities still enforce the original 0.9s offer cooldown.
  if(this.totalEligible===previouslyEligible&&this.offers.length<this.maximumOffers)
   this.nextOfferAt=now+this.rejectionRetrySeconds;
  return ret;
 }
 finish(endTime){
  const result=super.finish(endTime);
  result.schema='fpsarena-c15-adaptive-probe-match-v1';
  result.diagnostics={...result.diagnostics,probeAttempts:this.probes,rejectedProbes:this.rejectedProbes,
   eligibleProbes:this.eligibleProbes,retrySeconds:this.rejectionRetrySeconds,
   offerCooldownSeconds:this.offerCooldown,rejectionReasons:this.rejectionReasons,
   firstRejectionReasons:this.firstRejectionReasons,
   smallestProbeInterval:round(this.probeIntervalMin)};
  result.metadata.explorationAlgorithm='c15-rapid-rejection-retry';
  return result;
 }
}
