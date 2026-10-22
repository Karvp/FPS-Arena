import test from 'node:test';
import assert from 'node:assert/strict';
import {compareC16Replay,reviewRandomizedC16} from '../lab/arena/evaluate-optimized-exploration-c16.mjs';
const makeRow=(variant,arm,forced=true,seed=160010)=>({cohort:forced?'pair':'randomized',variant,
 arm:forced?arm:'randomized',seed,map:'arena',weapon:'mp5sd',
 result:{seed,mode:'tdm',map:'arena',primaryLoadout:'mp5sd',kills:2,deaths:1,shots:5,hits:3,
  headHits:1,damageDealt:60,damageTaken:20,distance:30,score:100,errors:0,
  explorationProfiler:{calls:120,totalMs:variant==='15'?12:8}},
 observation:{metadata:{seed,mode:'tdm',map:'arena',loadout:'mp5sd',assignment:{arm,
  design:forced?'forced-arm-diagnostic':'randomized-match',randomized:!forced},
  explorationAlgorithm:variant==='16'?'c16-lazy-geometry-c15-scheduler':'c15-rapid-rejection-retry'},
  diagnostics:{recordedOffers:1,eligibleOffers:1,interventionTicks:arm==='control'?0:5,interruptions:0,
   probeAttempts:7,eligibleProbes:1,rejectedProbes:6,
   lazyGeometry:{earlyRejectedEvaluations:6,geometryEvaluations:1}},
  offers:[{seed,mode:'tdm',map:'arena',arm,selectedAction:arm==='control'?'baseline':'micro-left',
   time:1,clearance:{left:true,right:true},candidateSet:['baseline','micro-left','micro-right'],
   validity:{serverOnlyFeaturesUsed:false,counterfactualOutcomeObserved:false}}]}});
test('C16 replay audit refuses missing variant and duplicate match',()=>{
 const a=makeRow('15','control');
 assert.throws(()=>compareC16Replay([a]),/missing replay/);
 assert.throws(()=>compareC16Replay([a,a]),/duplicate/);
});
test('C16 replay audit catches gameplay and intervention mismatches',()=>{
 const a=makeRow('15','control'),b=makeRow('16','control');
 assert.equal(compareC16Replay([a,b]).gameplayAndOffersIdentical,true);
 b.result.kills++;const bad=compareC16Replay([a,b]);
 assert.equal(bad.gameplayAndOffersIdentical,false);
 assert.deepEqual(bad.rows[0].mismatch,['kills']);
});
test('C16 audit excludes forced arms from random policy evidence',()=>{
 const a=makeRow('16','control',true);
 a.cohort='randomized';a.arm='randomized';
 assert.throws(()=>reviewRandomizedC16([a]),/invalid C16 random provenance|invalid C14 provenance|source mismatch/);
});
test('C16 randomized review blocks unsupported action-value training',()=>{
 const a=makeRow('16','control',false,160020),b=makeRow('16','treatment',false,160021);
 const report=reviewRandomizedC16([a,b]);
 assert.equal(report.policyTrainingAllowed,false);
 assert.equal(report.promotionEligible,false);
 assert.ok(report.reasonCodes.includes('too-few-independent-match-units'));
 assert.equal(report.randomizedDesign,true);
});
