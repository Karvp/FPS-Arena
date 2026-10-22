import test from 'node:test';
import assert from 'node:assert/strict';
import {createLongHorizonPlanC18,analyzeLongHorizonC18,C18_STRATA} from '../lab/arena/long-horizon-study-c18.mjs';
import {stratifiedAssignmentC17} from '../lab/arena/stratified-exploration-c17.mjs';
const createFixture=()=>{
 const plan=createLongHorizonPlanC18({blocksPerStratum:1,seconds:60});
 const rows=plan.jobs.map(job=>{
  const assignment=stratifiedAssignmentC17({mode:'tdm',map:job.map,loadout:job.weapon,seed:job.seed,
   replicate:job.replicate,experimentSeed:job.experimentSeed});
  return {jobId:job.id,cohort:'stratified',variant:'17',arm:job.arm,
   result:{mode:'tdm',map:job.map,primaryLoadout:job.weapon,seed:job.seed,duration:job.seconds,
    kills:job.arm==='treatment'?3:2,deaths:1,shots:12,errors:0,damageDealt:120,damageTaken:40,
    c14:{assignment},explorationProfiler:{instrumented:true,totalMs:11}},
   observation:{metadata:{seed:job.seed,mode:'tdm',map:job.map,loadout:job.weapon,
     assignment,productionActuation:false,explorationAlgorithm:'c16-lazy-geometry-c15-scheduler'},
    diagnostics:{interventionTicks:job.arm==='treatment'?4:0},offers:[]}};
 });
 return {plan,rows};
};
test('pre-registration is deterministic, balanced within strata, and includes independent seeds',()=>{
 const p=createLongHorizonPlanC18({blocksPerStratum:3,seconds:90}),q=createLongHorizonPlanC18({blocksPerStratum:3,seconds:90});
 assert.deepEqual(p,q);assert.equal(p.jobs.length,C18_STRATA.length*6);
 const seeds=new Set();for(const j of p.jobs){assert.ok(!seeds.has(j.seed));seeds.add(j.seed);}
 for(const [map,weapon] of C18_STRATA){const jobs=p.jobs.filter(j=>j.map===map&&j.weapon===weapon);
  for(let k=0;k<3;k++)assert.deepEqual(new Set(jobs.filter(j=>j.block===k).map(j=>j.arm)),new Set(['treatment','control']));}
});
test('analysis retains zero-opportunity matches, reports match-level ITT and forbids promotion',()=>{
 const {plan,rows}=createFixture();
 const r=analyzeLongHorizonC18(plan,rows,{bootstrapReplicates:300});
 assert.equal(r.studyMatches,12);assert.equal(r.completeBlocks,6);assert.equal(r.observedITT,1);
 assert.equal(r.arms.control.offers,0);assert.equal(r.arms.treatment.interventionTicks,24);
 assert.equal(r.arms.control.explorationCpuMs,66);assert.equal(r.arms.treatment.explorationCpuMs,66);
 assert.equal(r.canTrainNeuralValuePolicy,false);assert.equal(r.productionPromotionAllowed,false);
 assert.equal(r.perOfferCounterfactualRewards,false);
 assert.equal(r.strata.length,6);assert.equal(r.leaveOneStratumOut.length,6);
});
test('analysis is deterministic and independent of row order',()=>{
 const {plan,rows}=createFixture();
 const a=analyzeLongHorizonC18(plan,rows,{bootstrapReplicates:300});
 const b=analyzeLongHorizonC18(plan,rows.toReversed(),{bootstrapReplicates:300});
 assert.equal(a.observedITT,b.observedITT);
 assert.deepEqual(a.stratifiedBootstrapCI95,b.stratifiedBootstrapCI95);
 assert.equal(a.signFlipMonteCarloP,b.signFlipMonteCarloP);
});
test('rejects unregistered job, missing matches, repeated match and tampered registration',()=>{
 const {plan,rows}=createFixture();
 assert.throws(()=>analyzeLongHorizonC18(plan,rows.slice(1),{bootstrapReplicates:100}));
 assert.throws(()=>analyzeLongHorizonC18(plan,[rows[0],...rows.slice(0,-1)],{bootstrapReplicates:100}));
 assert.throws(()=>analyzeLongHorizonC18({...plan,seconds:180},rows,{bootstrapReplicates:100}),/hash/);
 const modified=structuredClone(rows);modified[0].jobId='unplanned';
 assert.throws(()=>analyzeLongHorizonC18(plan,modified,{bootstrapReplicates:100}));
});
test('rejects altered duration, experiment assignment, map, seed and missing instrumentation',()=>{
 const {plan,rows}=createFixture();
 const changes=[r=>{r[0].result.duration=30;},r=>{r[0].arm='treatment';},
  r=>{r[0].result.map='neon';},r=>{r[0].result.seed+=1;},
  r=>{r[0].result.explorationProfiler.instrumented=false;},
  r=>{r[0].result.explorationProfiler.totalMs=-1;},
  r=>{r[0].observation.metadata.assignment.draw=.1;}];
 for(const change of changes){const testRows=structuredClone(rows);change(testRows);
  assert.throws(()=>analyzeLongHorizonC18(plan,testRows,{bootstrapReplicates:100}));}
});
test('C18 registration forbids short tests being misreported as long horizon',()=>{
 assert.throws(()=>createLongHorizonPlanC18({seconds:32}));
 assert.throws(()=>createLongHorizonPlanC18({blocksPerStratum:0}));
 assert.throws(()=>createLongHorizonPlanC18({seconds:301}));
});
test('same randomized engine-control provenance as C17 is enforced',()=>{
 const {plan,rows}=createFixture();
 const invalid=structuredClone(rows);const control=invalid.find(r=>r.arm==='control');
 control.observation.diagnostics.interventionTicks=1;
 assert.throws(()=>analyzeLongHorizonC18(plan,invalid,{bootstrapReplicates:100}));
 const prod=structuredClone(rows);prod[0].observation.metadata.productionActuation=true;
 assert.throws(()=>analyzeLongHorizonC18(plan,prod,{bootstrapReplicates:100}));
});
