import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProbeSchedulingC15,auditRandomizedC15} from '../lab/arena/evaluate-probe-scheduler-c15.mjs';
import {matchAssignmentC15} from '../lab/arena/safe-action-explorer-c15.mjs';
const row=(seed,algorithm='c15',arm='control')=>{
 const result={seed,mode:'tdm',map:'arena',primaryLoadout:'mp5sd',kills:2,deaths:0,shots:4,hits:3,headHits:2,
  damageDealt:120,damageTaken:20,distance:20,score:2,errors:0};
 const assignment=matchAssignmentC15(seed,{forcedArm:arm});
 const diag={eligibleOffers:algorithm==='c14'?1:2,recordedOffers:algorithm==='c14'?1:2,interventionTicks:arm==='control'?0:4,
  probeAttempts:4,eligibleProbes:2,rejectedProbes:2,firstRejectionReasons:{'distance':2},skipped:{distance:2}};
 const offers=Array.from({length:diag.recordedOffers},(_,i)=>({seed,mode:'tdm',arm,selectedAction:arm==='control'?'baseline':'micro-right',candidateSet:['baseline','micro-left','micro-right'],validity:{serverOnlyFeaturesUsed:false,counterfactualOutcomeObserved:false}}));
 return {result,match:{metadata:{seed,mode:'tdm',map:'arena',loadout:'mp5sd',assignment,
  ...(algorithm==='c15'?{explorationAlgorithm:'c15-rapid-rejection-retry'}:{})},diagnostics:diag,offers}};
};
const pack=xs=>[{results:xs.map(x=>x.result)},{matches:xs.map(x=>x.match)}];
test('C15 paired control can document extra naturally safe opportunities, never combat causality',()=>{
 const [a,ad]=pack([row(1,'c14'),row(2,'c14')]),[b,bd]=pack([row(1),row(2)]);
 const result=analyzeProbeSchedulingC15(a,ad,b,bd);
 assert.equal(result.gameplayParity,true);assert.equal(result.deltaOffers,2);
 assert.equal(result.firstBlockingReasons.distance,4);
 assert.equal(result.policyTrainingAllowed,false);
});
test('C15 refuses mismatch in gameplay or mismatched control assignment',()=>{
 const [a,ad]=pack([row(1,'c14')]),[b,bd]=pack([row(1)]);
 b.results[0].kills=3;
 const result=analyzeProbeSchedulingC15(a,ad,b,bd);
 assert.equal(result.status,'INVALID-GAMEPLAY-NONPARITY');
 bd.matches[0].metadata.assignment.arm='treatment';
 assert.throws(()=>analyzeProbeSchedulingC15(a,ad,b,bd));
});
test('C15 refuses duplicate match units',()=>{
 const [a,ad]=pack([row(1,'c14'),row(1,'c14')]);
 const [b,bd]=pack([row(1),row(1)]);
 assert.throws(()=>analyzeProbeSchedulingC15(a,ad,b,bd));
});
test('C15 audit rejects forced arm as RCT and blocks action-value training',()=>{
 const [a,ad]=pack([row(1)]);
 const result=auditRandomizedC15(a,ad);
 assert.equal(result.randomizedDesign,false);
 assert.equal(result.policyTrainingAllowed,false);
});
