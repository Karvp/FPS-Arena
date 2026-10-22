// C11 — offline-only, guarded regression calibration of predicted damage.
// Values are raw server pre-armour damage/trigger, NOT causal rewards or hit probabilities.
// This module is deliberately never imported by page-agent.js or Tactical Director.
const finite=Number.isFinite;
const safe=(x)=>finite(x)&&x>=0&&x<100000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
/** Accept independent *scenario* summaries, never individual pellet or shot replicas.
 * Gain is estimated only when the group has enough DISTINCT scenario IDs.
 * The calibration cannot silently extrapolate to unobserved weapon/mode families.
 */
export function fitDamageCalibration(rows,{minContexts=4,minShots=256,maxGain=2,shrink=400,
 minHighImpactHeadEvents=12,maxUncertainTailFraction=.25}={}){
 const bins=new Map();
 for(const r of rows||[]){
  if(!r||typeof r.scenarioId!=='string'||!r.scenarioId||typeof r.family!=='string'||!r.family||
     !safe(r.predictedDamage)||!safe(r.observedDamage)||!Number.isInteger(r.shots)||r.shots<1)continue;
  let bin=bins.get(r.family);if(!bin){bin=new Map();bins.set(r.family,bin);}
  // duplicated intervention / different replay profile must NOT count twice
  const context=r.contextId||r.scenarioId;
  if(!bin.has(context))bin.set(context,r);
 }
 const groups={};
 for(const [family,records] of bins){
  const rr=[...records.values()],shots=rr.reduce((n,r)=>n+r.shots,0);
  const pred=rr.reduce((n,r)=>n+r.predictedDamage*r.shots,0);
  const observed=rr.reduce((n,r)=>n+r.observedDamage*r.shots,0);
  // A low-count, high-head-multiplier tail can dominate mean damage even
  // across thousands of trigger attempts. Abstain on such families instead
  // of learning a misleading gain from a few high-damage events.
  const uncertainTailRows=rr.filter(r=>{
   if(!finite(r.headMultiplier)||r.headMultiplier<=10||!Number.isInteger(r.headEvents))return false;
   // A zero-head-hit, zero-variance torso-aim scene is often deterministic;
   // only count it as a rare-tail concern when the predictor expects heads.
   const rareObservedHead=(r.headEvents>0||r.predictedHeadFraction>0)&&
     r.headEvents<minHighImpactHeadEvents;
   const relativeSE=finite(r.observedDamageStdError)?
     r.observedDamageStdError/Math.max(1,r.observedDamage):0;
   return rareObservedHead||relativeSE>.18;
  }).length;
  const tailFraction=rr.length?uncertainTailRows/rr.length:0;
  const stableTail=tailFraction<=maxUncertainTailFraction;
  const sufficient=rr.length>=minContexts&&shots>=minShots&&pred>1e-8&&stableTail;
  const raw=pred>1e-8?observed/pred:1;
  const weight=shots/(shots+shrink);
  const gain=sufficient?clamp(1+(raw-1)*weight,1/maxGain,maxGain):1;
  groups[family]={contexts:rr.length,shots,available:sufficient,gain,
   uncertainTailContexts:uncertainTailRows,uncertainTailFraction:tailFraction,
   calibrationAbstainReason:!stableTail?'rare-high-impact-headshots':
    (rr.length<minContexts||shots<minShots?'insufficient-independent-contexts':
    pred<=1e-8?'zero-predicted-signal':null),
   rawRatio:sufficient?raw:null,independentUnit:'scenarioId'};
 }
 return {format:'fpsarena-c11-damage-calibration-v1',researchOnly:true,
  noProbabilityClaim:true,minContexts,minShots,maxGain,minHighImpactHeadEvents,maxUncertainTailFraction,groups};
}
export function calibratedDamage(model,family,predicted){
 if(!safe(predicted))return null;
 const g=model?.groups?.[family];
 if(!model?.researchOnly||!g?.available||!finite(g.gain)||g.gain<=0)return {damage:predicted,usedCalibration:false};
 return {damage:predicted*g.gain,usedCalibration:true};
}
export function evaluateDamageCalibration(rows,model){
 const seen=new Set();
 const safeRows=(rows||[]).filter(r=>{
  if(!r||!safe(r.predictedDamage)||!safe(r.observedDamage)||r.shots<=0)return false;
  const key=r.contextId||r.scenarioId; if(!key||seen.has(key))return false;
  seen.add(key);return true;
 });
 const metrics=(get)=>{
  let mae=0,bias=0,mse=0,total=0;
  for(const r of safeRows){const delta=get(r)-r.observedDamage;total++;mae+=Math.abs(delta);bias+=delta;mse+=delta*delta;}
  return {contexts:total,mae:total?mae/total:null,bias:total?bias/total:null,rmse:total?Math.sqrt(mse/total):null};
 };
 return {raw:metrics(r=>r.predictedDamage),calibrated:metrics(r=>calibratedDamage(model,r.family,r.predictedDamage).damage),
  evaluationUnit:'distinct scenario, not shots',accuracyClaim:false};
}

/** Offline cross-run gate: independent spread seeds on the same geometry are
 * noise replications, NEVER fresh contexts. Every replicate must satisfy the
 * error gates; no adaptive model selection on the holdout is authorized.
 */
export function assessCalibrationReplicates(runs,{minRuns=2,minRelativeMAEGain=.03,
 maxRelativeRMSE=1.01}={}){
 const evidence=[],reasons=[];
 for(const run of runs||[]){
  const raw=run?.evaluation?.holdout?.raw,cal=run?.evaluation?.holdout?.calibrated;
  if(!raw||!cal||!finite(raw.mae)||!finite(cal.mae)||!finite(raw.rmse)||!finite(cal.rmse)||
     raw.mae<=0||raw.rmse<=0||raw.contexts!==cal.contexts||raw.contexts<2){
   reasons.push('invalid-replication-metrics');continue;
  }
  const relativeMAEGain=(raw.mae-cal.mae)/raw.mae;
  const relativeRMSE=cal.rmse/raw.rmse;
  const pass=relativeMAEGain>=minRelativeMAEGain&&relativeRMSE<=maxRelativeRMSE;
  evidence.push({seed:run.config?.seed??null,contexts:raw.contexts,relativeMAEGain,relativeRMSE,pass});
  if(!pass)reasons.push(`replicate-failed:${run.config?.seed??'unknown'}`);
 }
 if(evidence.length<minRuns)reasons.push('insufficient-replications');
 if(new Set(evidence.map(x=>x.seed)).size!==evidence.length)reasons.push('duplicate-shot-seeds');
 return {pass:reasons.length===0,reasons,evidence,replications:evidence.length,
  independentContexts:false,researchOnly:true,
  note:'Different spread seeds at matched geometry test noise stability, not independent scenes or match-level causality'};
}
