import {analyzeExplorationC14} from './evaluate-exploration-c14.mjs';
const gameplay=['kills','deaths','shots','hits','headHits','damageDealt','damageTaken','distance','score','errors'];
const offerComparable=o=>JSON.stringify({time:o.time,selectedAction:o.selectedAction,
  originalAction:o.originalAction,clearance:o.clearance,candidateSet:o.candidateSet,
  interrupted:o.interrupted,publicFeatures:o.publicFeatures,publicTargetId:o.publicTargetId,
  outcome:o.outcome});
export function compareC16Replay(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('empty C16 pairs');
 const grouped=new Map();
 for(const r of rows){
  if(r.cohort!=='pair'||!['15','16'].includes(r.variant)||!['control','treatment'].includes(r.arm))throw Error('invalid paired variant');
  const k=`${r.seed}|${r.map}|${r.weapon}|${r.arm}`;
  const m=grouped.get(k)||{};
  if(m[r.variant])throw Error('duplicate variant '+k);
  m[r.variant]=r;grouped.set(k,m);
 }
 const pairs=[];
 for(const [key,p] of grouped){
  const a=p['15'],b=p['16'];if(!a||!b)throw Error('missing replay arm '+key);
  const x=a.observation,y=b.observation,ra=a.result,rb=b.result;
  if(x.metadata.assignment.arm!==y.metadata.assignment.arm||
     x.metadata.assignment.design!=='forced-arm-diagnostic'||
     y.metadata.assignment.design!=='forced-arm-diagnostic')throw Error('assignment mismatch');
  const mismatch=gameplay.filter(k=>ra[k]!==rb[k]);
  const diagnostics=['recordedOffers','eligibleOffers','interventionTicks','interruptions','probeAttempts','eligibleProbes','rejectedProbes'];
  const diagMismatch=diagnostics.filter(k=>x.diagnostics[k]!==y.diagnostics[k]);
  const offersEqual=x.offers.length===y.offers.length&&
   x.offers.every((o,i)=>offerComparable(o)===offerComparable(y.offers[i]));
  const p15=ra.explorationProfiler,p16=rb.explorationProfiler;
  if(!p15||!p16||p15.calls!==p16.calls||p15.calls<=0)throw Error('missing paired CPU profiling');
  if(y.diagnostics.lazyGeometry.earlyRejectedEvaluations<0||
     y.diagnostics.lazyGeometry.geometryEvaluations<0)throw Error('negative geometry metrics');
  pairs.push({key,arm:a.arm,identicalGameplay:mismatch.length===0,identicalOffers:offersEqual,
   identicalOfferCount:x.offers.length===y.offers.length,identicalDiagnostics:diagMismatch.length===0,
   mismatch,diagMismatch,offers:x.offers.length,probes:y.diagnostics.probeAttempts,
   geometrySkips:y.diagnostics.lazyGeometry.earlyRejectedEvaluations,
   geometryChecks:y.diagnostics.lazyGeometry.geometryEvaluations,
   c15TotalMs:p15.totalMs,c16TotalMs:p16.totalMs,measuredCalls:p16.calls,
   c15P95Ms:p15.p95Ms,c16P95Ms:p16.p95Ms});
 }
 const total=k=>pairs.reduce((s,r)=>s+r[k],0);
 const allParity=pairs.every(x=>x.identicalGameplay&&x.identicalOffers&&x.identicalDiagnostics);
 return {schema:'fpsarena-c16-same-seed-replay-audit-v1',status:allParity?'identical':'PARITY_FAILED',
  pairedReplayArms:pairs.length,independentSeeds:new Set(pairs.map(p=>p.key.split('|')[0])).size,
  gameplayAndOffersIdentical:allParity,eligibleOffers:total('offers'),probeAttempts:total('probes'),
  skippedGeometryEvaluations:total('geometrySkips'),performedGeometryEvaluations:total('geometryChecks'),
  profiledCalls:total('measuredCalls'),c15CommandTotalMs:total('c15TotalMs'),c16CommandTotalMs:total('c16TotalMs'),
  speedupOfExplorerOnly:total('c16TotalMs')?total('c15TotalMs')/total('c16TotalMs'):null,
  performanceLimit:'Process wall CPU is noisy; paired runs can be affected by scheduling/GC, not browser FPS',
  causalCombatAdvantageProved:false,rows:pairs};
}
export function reviewRandomizedC16(rows,{minimumIndependentPerArm=20,minimumExposedPerArm=10}={}){
 if(!Array.isArray(rows)||!rows.length)throw Error('empty randomized C16 study');
 const results=[],matches=[];
 for(const r of rows){
  if(r.cohort!=='randomized'||r.variant!=='16'||r.arm!=='randomized'||
     r.observation?.metadata?.explorationAlgorithm!=='c16-lazy-geometry-c15-scheduler'||
     r.observation?.metadata?.assignment?.design!=='randomized-match'||
     r.observation?.metadata?.assignment?.randomized!==true||
     !r.result?.explorationProfiler||
     r.observation.diagnostics.lazyGeometry.earlyRejectedEvaluations<0)
    throw Error('invalid C16 random provenance');
  results.push(r.result);matches.push(r.observation);
 }
 const base=analyzeExplorationC14({results},{matches},{minimumIndependentPerArm,minimumExposedPerArm});
 return {...base,schema:'fpsarena-c16-randomized-match-review-v1',
  policyTrainingAllowed:false,causalPerOfferRewardAvailable:false,
  exposureNote:'Presence of an opportunity is post-assignment and may depend on treatment; never condition causal estimate on exposed subset',
  promotionEligible:false};
}
