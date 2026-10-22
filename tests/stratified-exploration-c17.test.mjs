import test from 'node:test';
import assert from 'node:assert/strict';
import {stratifiedAssignmentC17,analyzeStratifiedC17} from '../lab/arena/stratified-exploration-c17.mjs';

const make=(replicate,seed=171001,map='arena',weapon='mp5sd')=>{
 const assignment=stratifiedAssignmentC17({mode:'tdm',map,loadout:weapon,seed,replicate,experimentSeed:170017});
 return {cohort:'stratified',variant:'17',arm:assignment.arm,
  result:{mode:'tdm',map,primaryLoadout:weapon,seed,kills:replicate%3,deaths:1,shots:10,errors:0,damageDealt:100,damageTaken:40},
  observation:{metadata:{mode:'tdm',map,loadout:weapon,seed,assignment,productionActuation:false,explorationAlgorithm:'c16-lazy-geometry-c15-scheduler',productionActuation:false},
   diagnostics:{interventionTicks:assignment.arm==='treatment'?2:0},offers:[{arm:assignment.arm,seed,validity:{serverOnlyFeaturesUsed:false,counterfactualOutcomeObserved:false}}]}};
};
test('one treatment and one control within each pre-treatment block; deterministic and order-independent',()=>{
 for(let i=0;i<64;i+=2){
  const a=stratifiedAssignmentC17({map:'neon',loadout:'m4a1',seed:170001+i,replicate:i});
  const b=stratifiedAssignmentC17({map:'neon',loadout:'m4a1',seed:170002+i,replicate:i+1});
  assert.notEqual(a.arm,b.arm);assert.equal(a.block,b.block);
  assert.deepEqual(stratifiedAssignmentC17({map:'neon',loadout:'m4a1',seed:170001+i,replicate:i}),a);
  assert.equal(a.assignmentProbability,.5);
 }
});
test('assignment does not use or mutate Math.random state',()=>{
 const old=Math.random;Math.random=()=>{throw Error('game RNG used');};
 try{stratifiedAssignmentC17({map:'arena',loadout:'mp5sd',seed:171001,replicate:1});}finally{Math.random=old;}
});
test('intent-to-treat strata review works without conditioning on offers',()=>{
 const rows=[make(0,171001),make(1,171002),make(0,171003,'foundry'),make(1,171004,'foundry')];
 // One control exposure is zero; still preserve it in the ITT estimate.
 const r=rows.find(x=>x.arm==='control');r.observation.offers=[];
 const summary=analyzeStratifiedC17(rows,{minimumBlocks:2,minimumExposedPerArm:0,bootstrapReplicates:200});
 assert.equal(summary.completeBlocks,2);assert.equal(summary.studiedMatches,4);
 assert.equal(summary.blockResults.length,2);assert.equal(summary.policyTrainingAllowed,false);
 assert.equal(summary.incompleteBlocks.length,0);
 assert.equal(summary.status,'eligible-for-further-statistical-review');
 assert.ok(Number.isFinite(summary.observedKillDifferentialPerMatch));
});
test('incomplete blocks do not masquerade as complete randomization',()=>{
 const result=analyzeStratifiedC17([make(0)],{minimumBlocks:1,minimumExposedPerArm:0,bootstrapReplicates:100});
 assert.equal(result.completeBlocks,0);assert.ok(result.reasonCodes.includes('incomplete-stratified-blocks'));
});
test('same-seed, duplicate, forced, and tampered assignments are rejected',()=>{
 const rows=[make(0,171001),make(1,171002)];
 for(const bad of [
   [rows[0],rows[0]],
   [rows[0],{...rows[1],result:{...rows[1].result,seed:171001}}],
   [rows[0],{...rows[1],observation:{...rows[1].observation,metadata:{...rows[1].observation.metadata,assignment:{...rows[1].observation.metadata.assignment,design:'forced-arm-diagnostic'}}}}]
 ])assert.throws(()=>analyzeStratifiedC17(bad,{minimumBlocks:1,minimumExposedPerArm:0,bootstrapReplicates:100}));
});
test('control never actuates, output never asserts causal rewards for offers',()=>{
 const rows=[make(0,171001),make(1,171002)];
 const report=analyzeStratifiedC17(rows,{minimumBlocks:1,minimumExposedPerArm:0,bootstrapReplicates:100});
 assert.equal(report.perOfferCausalRewardAvailable,false);
 const control=rows.find(x=>x.arm==='control');control.observation.diagnostics.interventionTicks=1;
 assert.throws(()=>analyzeStratifiedC17(rows,{minimumBlocks:1,minimumExposedPerArm:0,bootstrapReplicates:100}));
});
test('rejects tampered draw and production actuation provenance',()=>{
 const original=[make(0,171001),make(1,171002)];
 const changedDraw=structuredClone(original);changedDraw[0].observation.metadata.assignment.draw+=.1;
 assert.throws(()=>analyzeStratifiedC17(changedDraw,{minimumBlocks:1,minimumExposedPerArm:0,bootstrapReplicates:100}));
 const shipped=structuredClone(original);shipped[1].observation.metadata.productionActuation=true;
 assert.throws(()=>analyzeStratifiedC17(shipped,{minimumBlocks:1,minimumExposedPerArm:0,bootstrapReplicates:100}));
});
test('rejects reuse of game seed across independent randomized blocks',()=>{
 const rows=[make(0,171001),make(1,171002),make(2,171001),make(3,171004)];
 assert.throws(()=>analyzeStratifiedC17(rows,{minimumBlocks:2,minimumExposedPerArm:0,bootstrapReplicates:100}),/game seed reused/);
});
