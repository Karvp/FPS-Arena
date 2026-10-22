// C22 research-only longer non-overlapping outcomes and PRE-ACTION public pressure audit.
// C16 safety gate unchanged. Server event outcomes are labels, never policy features.
import {EncounterRandomizerC21} from './encounter-randomization-c21.mjs';
import {candidateSetC16} from './safe-action-explorer-c16.mjs';
import {publicPolicyState} from './encounter-policy-recorder-c13.mjs';
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(5):null;
export const C22_HORIZONS=Object.freeze([0.9,1.8]);
function emptyOutcome(){return {shots:0,hits:0,kills:0,deaths:0,damageDealt:0,damageTaken:0,censored:true};}
export function pressureBandC22(features){
 if(!features||!['distance','observedHostiles','radialSpeed','healthFraction','armorFraction'].every(k=>finite(features[k])))return 'unobserved';
 // A *public feature proxy*, NOT ground-truth incoming fire or future damage.
 let score=0;
 if(features.distance<=35)score++;
 if(features.observedHostiles>=2)score++;
 if(features.healthFraction<.9)score++;
 if(features.armorFraction<.25)score++;
 if(Math.abs(features.radialSpeed)>=4)score++;
 return score>=3?'elevated':score>=2?'moderate':'low';
}
export class RiskAwareRandomizerC22 extends EncounterRandomizerC21{
 constructor({auditPeriod=.45,...opts}={}){
  if(!finite(auditPeriod)||auditPeriod<.25||auditPeriod>2)throw Error('C22 audit period invalid');
  super({...opts,offerCooldown:1.8});
  this.auditPeriod=auditPeriod;this.nextAuditAt=0;
  this.audits={sampled:0,byPressure:{low:0,moderate:0,elevated:0,unobserved:0},
   eligible:0,ineligible:0,reasons:{},byPressureEligible:{low:0,moderate:0,elevated:0,unobserved:0}};
 }
 command(now,client,cmd){
  if(finite(now)&&now>=this.nextAuditAt-1e-6){
   this.nextAuditAt=now+this.auditPeriod;
   // Observational, no assignment/RNG effects; audits even when current command
   // is blocked and therefore cannot produce a randomized opportunity.
   const observation=publicPolicyState(client,now);
   const band=pressureBandC22(observation.features);
   const safety=candidateSetC16(client,cmd,now,this.mode);
   this.audits.sampled++;this.audits.byPressure[band]++;
   if(safety.eligible){this.audits.eligible++;this.audits.byPressureEligible[band]++;}
   else {this.audits.ineligible++;for(const reason of safety.reasons)
    this.audits.reasons[reason]=(this.audits.reasons[reason]||0)+1;}
  }
  const before=this.offers.length;
  const command=super.command(now,client,cmd);
  if(this.offers.length>before){
   const row=this.offers[this.offers.length-1];
   row.schema='fpsarena-c22-risk-aware-opportunity-v1';
   row.pressureBand=pressureBandC22(row.publicFeatures);
   row.horizonSeconds=[...C22_HORIZONS];
   row.horizons=Object.fromEntries(C22_HORIZONS.map(s=>[String(s),emptyOutcome()]));
   row.validity.horizonEventsAfterActionOnly=true;
   row.validity.safetyGateUnchanged=true;
  }
  return command;
 }
 serverEvent(now,type,data){
  super.serverEvent(now,type,data);
  const row=this.open;
  if(!row||!finite(now)||now+1e-6<row.time)return;
  for(const h of C22_HORIZONS){
   if(now>=row.time+h-1e-6)continue;
   const o=row.horizons?.[String(h)];if(!o)continue;
   if(type==='shot'&&data?.id==='trainee')o.shots++;
   else if(type==='hit'){o.hits++;o.damageDealt+=Math.max(0,finite(data?.dmg)?data.dmg:0);}
   else if(type==='dmg')o.damageTaken+=Math.max(0,Number(data?.h)||0)+Math.max(0,Number(data?.a)||0);
   else if(type==='kill'){if(data?.k==='trainee')o.kills++;if(data?.v==='trainee')o.deaths++;}
  }
 }
 finish(endTime){
  const result=super.finish(endTime);
  result.schema='fpsarena-c22-risk-aware-match-v1';
  result.metadata.design='within-match 3-arm randomized opportunities; two nonoverlapping cumulative horizons';
  result.metadata.riskSource='delayed public target snapshots and local status only';
  result.metadata.windowSeconds=1.8;
  for(const row of result.offers){
   for(const h of C22_HORIZONS){
    const outcome=row.horizons[String(h)];outcome.censored=!finite(endTime)||endTime<row.time+h-.02;
   }
   // C21 primary outcome spans full 1.8 seconds. Cross-check cumulative labels.
   if(!row.horizons['1.8'].censored){for(const k of ['shots','hits','kills','deaths','damageDealt','damageTaken'])
    if(Math.abs(row.outcome[k]-row.horizons['1.8'][k])>1e-6)throw Error(`C22 divergent server label ${k}`);}
  }
  result.diagnostics.publicPressureAudit={...this.audits,auditPeriod:this.auditPeriod};
  result.metadata.safetyGate='unchanged C16 candidateSetC16; original priority and geometry checks';
  return result;
 }
}
