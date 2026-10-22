// C14 descriptive analysis: match is the independent unit; treatment never gets
// an invented per-offer counterfactual. Reject forced diagnostics as randomized.
const finite=Number.isFinite;
export const matchKeyC14=(r)=>`${r.mode}|${r.map}|${r.seed}|${r.primaryLoadout}`;
export function analyzeExplorationC14(runReport,offerDataset,{minimumIndependentPerArm=20,minimumExposedPerArm=10}={}){
 const results=runReport?.results||[],matches=offerDataset?.matches||[];
 if(!Array.isArray(results)||!Array.isArray(matches)||results.length!==matches.length)
  throw Error('C14 report / dataset mismatch');
 const rows=[],seen=new Set();
 for(let i=0;i<results.length;i++){
  const a=results[i],m=matches[i],meta=m?.metadata,assign=meta?.assignment;
  if(!assign||a.seed!==meta.seed||a.mode!==meta.mode||a.map!==meta.map||
     a.primaryLoadout!==meta.loadout||!['control','treatment'].includes(assign.arm)||
     !['randomized-match','forced-arm-diagnostic'].includes(assign.design)||
     !finite(a.kills)||!finite(a.deaths)||!finite(a.shots)||!finite(a.damageDealt)||
     !Number.isInteger(m.diagnostics?.interventionTicks))throw Error('invalid C14 provenance or observations');
  if(assign.randomized!==(assign.design==='randomized-match'))throw Error('C14 assignment source mismatch');
  if((assign.arm==='control'&&m.diagnostics.interventionTicks!==0)||
     (assign.arm==='treatment'&&!m.offers.every(o=>o.selectedAction!=='baseline')))
     throw Error('C14 actuation/assignment mismatch');
  const key=matchKeyC14(a);
  if(seen.has(key))throw Error('duplicate C14 independent match');seen.add(key);
  for(const o of m.offers){if(o.seed!==a.seed||o.mode!==a.mode||o.arm!==assign.arm||
      o.candidateSet?.length!==3||o.validity?.serverOnlyFeaturesUsed!==false||
      o.validity?.counterfactualOutcomeObserved!==false)throw Error('invalid C14 opportunity row');}
  rows.push({key,seed:a.seed,map:a.map,arm:assign.arm,design:assign.design,
   kills:a.kills,deaths:a.deaths,shots:a.shots,damageDealt:a.damageDealt,
   damageTaken:a.damageTaken,offers:m.offers.length,interventionTicks:m.diagnostics.interventionTicks,
   errors:a.errors});
 }
 const group=arm=>{
  const v=rows.filter(x=>x.arm===arm),n=v.length;
  const total=k=>v.reduce((s,x)=>s+(x[k]||0),0);
  return {matches:n,exposedMatches:v.filter(x=>x.offers>0).length,offers:total('offers'),
   interventionTicks:total('interventionTicks'),kills:total('kills'),deaths:total('deaths'),
   shots:total('shots'),damageDealt:total('damageDealt'),damageTaken:total('damageTaken'),errors:total('errors'),
   averageKillDifferential:n?(total('kills')-total('deaths'))/n:null};
 };
 const control=group('control'),treatment=group('treatment'),randomized=rows.every(x=>x.design==='randomized-match');
 const differences=control.matches&&treatment.matches?{
  observedKillDiffPerMatch:treatment.averageKillDifferential-control.averageKillDifferential,
  interpretation:'unadjusted descriptive intention-to-treat difference; NOT a causal per-offer reward'}:null;
 const reasons=[];
 if(!randomized)reasons.push('includes-forced-diagnostic-arms');
 if(control.matches<minimumIndependentPerArm||treatment.matches<minimumIndependentPerArm)reasons.push('too-few-independent-match-units');
 if(control.exposedMatches<minimumExposedPerArm||treatment.exposedMatches<minimumExposedPerArm)reasons.push('insufficient-opportunity-overlap');
 if(rows.some(x=>x.errors))reasons.push('runtime-errors');
 return {schema:'fpsarena-c14-offline-evaluation-v1',status:reasons.length?'not-eligible-for-policy-training':'sufficient-for-further-statistical-review',
  promotionEligible:false,policyActuationEnabled:false,randomizedDesign:randomized,
  reasonCodes:reasons,designUnit:'match',control,treatment,differences,individualMatches:rows};
}
export function analyzePairedDiagnosticsC14(controlRun,treatmentRun,controlData,treatmentData){
 const c=analyzeExplorationC14(controlRun,controlData),t=analyzeExplorationC14(treatmentRun,treatmentData);
 const cm=new Map(c.individualMatches.map(x=>[x.key,x])),tm=new Map(t.individualMatches.map(x=>[x.key,x]));
 if(cm.size!==tm.size||[...cm.keys()].some(x=>!tm.has(x))||
    [...cm.values()].some(x=>x.arm!=='control')||[...tm.values()].some(x=>x.arm!=='treatment'))
    throw Error('paired C14 conditions must match by map, seed, loadout and mode');
 const pairs=[...cm.keys()].sort().map(key=>{
  const a=cm.get(key),b=tm.get(key);
  return {key,controlKills:a.kills,treatmentKills:b.kills,killDelta:b.kills-a.kills,
   controlDeaths:a.deaths,treatmentDeaths:b.deaths,deathDelta:b.deaths-a.deaths,
   controlShots:a.shots,treatmentShots:b.shots,offers:b.offers,interventionTicks:b.interventionTicks};
 });
 return {schema:'fpsarena-c14-forced-pairs-diagnostic-v1',status:'diagnostic-only-not-randomized',
  pairs,exposedPairs:pairs.filter(x=>x.offers>0).length,
  improved:pairs.filter(x=>x.killDelta>0).length,harmed:pairs.filter(x=>x.killDelta<0).length,
  unchanged:pairs.filter(x=>x.killDelta===0).length,promotionEligible:false};
}
