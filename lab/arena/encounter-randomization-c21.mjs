// C21: research-only, per-eligible-encounter three-arm randomized micro intervention.
// Does not import hidden server state. The authoritative server supplies labels AFTER action.
import {candidateSetC16} from './safe-action-explorer-c16.mjs';
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(5):null;
const ACTIONS=Object.freeze(['baseline','micro-left','micro-right']);
const hash32=x=>{x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return (x^(x>>>16))>>>0;};
export {ACTIONS as C21_ACTIONS};
export function assignedActionC21(seed,index){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(index)||index<1)
  throw Error('invalid C21 assignment seed/index');
 // Independent deterministic stream; MUST NOT draw from game Math.random().
 const u=hash32((seed^Math.imul(index,0x517cc1b7)^0xc21f7a39)>>>0)/4294967296;
 // Equal-width strata, probabilities recorded exactly 1/3, not rounded hash bins.
 return ACTIONS[Math.min(2,Math.floor(u*3))];
}
function serverOutcome(){return {shots:0,hits:0,kills:0,deaths:0,damageDealt:0,damageTaken:0,censored:true};}
export class EncounterRandomizerC21{
 constructor({seed,mode='tdm',map,loadout,offerCooldown=.9,rejectionRetrySeconds=.12,actionSeconds=.16,maximumOffers=1500}={}){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||mode!=='tdm'||!map||!loadout||
   !finite(offerCooldown)||offerCooldown<.5||!finite(rejectionRetrySeconds)||rejectionRetrySeconds<.08||rejectionRetrySeconds>.3||
   rejectionRetrySeconds>=offerCooldown||!finite(actionSeconds)||actionSeconds<=0||actionSeconds>.25||
   !Number.isInteger(maximumOffers)||maximumOffers<1)throw Error('invalid C21 study parameters');
  Object.assign(this,{seed,mode,map,loadout,offerCooldown,rejectionRetrySeconds,actionSeconds,maximumOffers});
  this.nextOfferAt=0;this.activeUntil=-1;this.active=null;this.open=null;
  this.offers=[];this.totalEligible=0;this.probes=0;this.rejected=0;this.skipped={};
  this.interventionTicks=0;this.interruptions=0;this.geometryChecks=0;this.skippedGeometry=0;
 }
 command(now,client,original){
  const base={...original};
  if(!finite(now)||now<0)return base;
  // Recheck all original safety gates for EACH modified tick; never override
  // priority commands, death, stale snapshots or dangerous map clearance.
  if(this.active && now<this.activeUntil-1e-6){
   const check=candidateSetC16(client,base,now,this.mode);
   if(check.eligible){
    this.interventionTicks++;this.active.executedTicks++;
    return {...base,[this.active.selectedAction==='micro-left'?'left':'right']:true};
   }
   this.active.interrupted=true;this.interruptions++;this.active=null;this.activeUntil=-1;
  }
  if(now+1e-6<this.nextOfferAt)return base;
  this.probes++;
  const set=candidateSetC16(client,base,now,this.mode);
  if(set.clearance.left===null)this.skippedGeometry++;else this.geometryChecks++;
  if(!set.eligible){
   this.rejected++;this.nextOfferAt=now+this.rejectionRetrySeconds;
   for(const r of set.reasons)this.skipped[r]=(this.skipped[r]||0)+1;
   return base;
  }
  // Even if bounded logging capacity is hit, NEVER perform unlogged actions.
  if(this.offers.length>=this.maximumOffers){this.nextOfferAt=now+this.offerCooldown;return base;}
  const index=++this.totalEligible,selectedAction=assignedActionC21(this.seed,index);
  const row={schema:'fpsarena-c21-randomized-opportunity-v1',
   offerId:`c21-${this.map}-${this.loadout}-${this.seed}-${index}`,seed:this.seed,map:this.map,loadout:this.loadout,
   time:round(now),windowEnd:round(now+this.offerCooldown),
   selectedAction,candidateSet:[...set.candidates],
   assignment:{unit:'eligible nonoverlapping encounter window',method:'seeded independent-of-game RNG hash',
    probability:1/3,eligibleBeforeAssignment:true},
   publicFeatures:{...set.state.features},targetId:set.state.targetId,
   publicProvenance:{...set.state.provenance},originalAction:set.originalAction,
   executedTicks:0,interrupted:false,outcome:serverOutcome(),
   validity:{preActionPublicFeaturesOnly:true,noUnobservedCounterfactualClaim:true,serverLabelsOnlyAfterAssignment:true}};
  this.offers.push(row);this.open=row;this.nextOfferAt=now+this.offerCooldown;
  this.active=null;this.activeUntil=-1;
  if(selectedAction!=='baseline'){
   this.active=row;this.activeUntil=now+this.actionSeconds;
   this.interventionTicks++;row.executedTicks++;
   return {...base,[selectedAction==='micro-left'?'left':'right']:true};
  }
  return base;
 }
 serverEvent(now,type,data){
  const row=this.open;
  if(!row||!finite(now)||now+1e-6<row.time||now>=row.windowEnd-1e-6)return;
  const o=row.outcome;
  if(type==='shot'&&data?.id==='trainee')o.shots++;
  else if(type==='hit'){
   // The peer socket is the trainee's receiver of server-confirmed hits.
   o.hits++;o.damageDealt+=Math.max(0,finite(data?.dmg)?data.dmg:0);
  }else if(type==='dmg')o.damageTaken+=Math.max(0,Number(data?.h)||0)+Math.max(0,Number(data?.a)||0);
  else if(type==='kill'){
   if(data?.k==='trainee')o.kills++;
   if(data?.v==='trainee')o.deaths++;
  }
 }
 finish(endTime){
  for(const o of this.offers)o.outcome.censored=!finite(endTime)||endTime<o.windowEnd-.02;
  const actionCounts=Object.fromEntries(ACTIONS.map(a=>[a,this.offers.filter(o=>o.selectedAction===a).length]));
  return {schema:'fpsarena-c21-encounter-randomization-match-v1',metadata:{seed:this.seed,mode:this.mode,map:this.map,
   loadout:this.loadout,design:'within-match per-opportunity three-arm random assignment',
   producer:'headless-simulator',productionActuation:false,assignmentBeforeOutcome:true,
   controlAction:'original Release Autopilot command',perArmProbability:1/3},
   diagnostics:{offers:this.offers.length,actionCounts,eligibleOffers:this.totalEligible,probes:this.probes,
    rejected:this.rejected,skipped:this.skipped,geometryChecks:this.geometryChecks,
    skippedGeometry:this.skippedGeometry,interventionTicks:this.interventionTicks,interruptions:this.interruptions},offers:this.offers};
 }
}
