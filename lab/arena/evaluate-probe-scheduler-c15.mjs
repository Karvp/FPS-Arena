// C15 — diagnostics of opportunity discovery. In control arm both schedulers
// queue IDENTICAL commands; comparing observed opportunity counts is valid.
// Forced treatment comparisons are not randomized causal estimates.
import {matchKeyC14,analyzeExplorationC14} from './evaluate-exploration-c14.mjs';
const finite=Number.isFinite;
const key=r=>matchKeyC14(r);
const gameplay=['kills','deaths','shots','hits','headHits','damageDealt','damageTaken','distance','score','errors'];
function unpack(report,dataset,expectedAlgorithm){
 const results=report?.results,matches=dataset?.matches;
 if(!Array.isArray(results)||!Array.isArray(matches)||results.length!==matches.length)throw Error('unmatched dataset/report');
 const out=new Map();
 results.forEach((r,i)=>{
  const m=matches[i],a=m?.metadata?.assignment,k=key(r);
  if(m?.metadata?.seed!==r.seed||m.metadata.map!==r.map||m.metadata.mode!==r.mode||
     m.metadata.loadout!==r.primaryLoadout||a?.arm!=='control'||a?.design!=='forced-arm-diagnostic'||
     out.has(k)||!Number.isInteger(m.diagnostics?.eligibleOffers)||
     m.diagnostics.interventionTicks!==0||m.offers.length!==m.diagnostics.recordedOffers||
     !m.offers.every(o=>o.selectedAction==='baseline')||
     (expectedAlgorithm==='c15'&&m.metadata.explorationAlgorithm!=='c15-rapid-rejection-retry')||
     (expectedAlgorithm==='c14'&&m.metadata.explorationAlgorithm!==undefined))throw Error('bad matched-control provenance');
  for(const f of gameplay)if(!finite(r[f]))throw Error('nonfinite server gameplay '+f);
  out.set(k,{r,m});
 });
 return out;
}
export function analyzeProbeSchedulingC15(c14Report,c14Data,c15Report,c15Data){
 const left=unpack(c14Report,c14Data,'c14'),right=unpack(c15Report,c15Data,'c15');
 if(!left.size||left.size!==right.size||[...left.keys()].some(k=>!right.has(k)))throw Error('unpaired probe comparison');
 const perMatch=[],reasons={};
 for(const k of [...left.keys()].sort()){
  const a=left.get(k),b=right.get(k),fields=gameplay.filter(f=>a.r[f]!==b.r[f]);
  for(const [reason,count] of Object.entries(b.m.diagnostics.firstRejectionReasons||{}))
   reasons[reason]=(reasons[reason]||0)+count;
  perMatch.push({key:k,gameplayParity:fields.length===0,mismatchedGameplay:fields,
   c14Offers:a.m.diagnostics.recordedOffers,c15Offers:b.m.diagnostics.recordedOffers,
   deltaOffers:b.m.diagnostics.recordedOffers-a.m.diagnostics.recordedOffers,
   c14Skipped:a.m.diagnostics.skipped,c15RejectedProbes:b.m.diagnostics.rejectedProbes,
   c15Probes:b.m.diagnostics.probeAttempts,c15InterventionTicks:b.m.diagnostics.interventionTicks});
 }
 const sum=f=>perMatch.reduce((n,r)=>n+r[f],0);
 return {schema:'fpsarena-c15-paired-control-probe-comparison-v1',design:'forced-control exact gameplay parity, nonrandomized diagnostic',
  status:perMatch.every(x=>x.gameplayParity)?'valid-paired-control-geometry-study':'INVALID-GAMEPLAY-NONPARITY',
  independentScenarios:perMatch.length,c14Offers:sum('c14Offers'),c15Offers:sum('c15Offers'),
  deltaOffers:sum('deltaOffers'),c15ProbeAttempts:sum('c15Probes'),
  c15RejectedProbes:sum('c15RejectedProbes'),firstBlockingReasons:reasons,
  gainedScenarios:perMatch.filter(x=>x.deltaOffers>0).length,
  reducedScenarios:perMatch.filter(x=>x.deltaOffers<0).length,
  equalScenarios:perMatch.filter(x=>x.deltaOffers===0).length,
  gameplayParity:perMatch.every(x=>x.gameplayParity),
  causalCombatAdvantageProved:false,policyTrainingAllowed:false,perMatch};
}
export function auditRandomizedC15(report,dataset){
 const base=analyzeExplorationC14(report,dataset);
 const matched=report.results.map((r,i)=>({r,m:dataset.matches[i]}));
 if(matched.some(({m})=>m.metadata?.explorationAlgorithm!=='c15-rapid-rejection-retry'||
   m.diagnostics?.probeAttempts!==m.diagnostics?.eligibleProbes+m.diagnostics?.rejectedProbes))throw Error('C15 telemetry integrity error');
 const diagnostics={controlProbes:0,treatmentProbes:0,rejected:0,eligible:0};
 for(const {m} of matched){const arm=m.metadata.assignment.arm;diagnostics[arm+'Probes']+=m.diagnostics.probeAttempts;
  diagnostics.rejected+=m.diagnostics.rejectedProbes;diagnostics.eligible+=m.diagnostics.eligibleProbes;}
 return {...base,schema:'fpsarena-c15-randomized-match-review-v1',probeDiagnostics:diagnostics,
  policyTrainingAllowed:false,causalPerOfferRewardAvailable:false};
}
