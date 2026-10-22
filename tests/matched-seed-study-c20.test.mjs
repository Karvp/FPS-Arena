import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchedSeedPlanC20,analyzeMatchedSeedC20} from '../lab/arena/matched-seed-study-c20.mjs';
import {stratifiedAssignmentC17} from '../lab/arena/stratified-exploration-c17.mjs';
function fixture(pairsPerStratum=2){
 const plan=createMatchedSeedPlanC20({pairsPerStratum,sourceFingerprint:'fixture-source'});
 const rows=plan.jobs.map(j=>{
  const a=stratifiedAssignmentC17({map:j.map,loadout:j.weapon,seed:j.seed,replicate:j.replicate,experimentSeed:j.experimentSeed});
  a.independence='controlled paired simulator forks: SAME game seed across two independently executed arms; pair is the statistical unit';
  return {jobId:j.id,arm:j.arm,fullMatch:true,capSeconds:600,
   result:{mode:'tdm',seed:j.seed,map:j.map,primaryLoadout:j.weapon,kills:j.arm==='treatment'?5:4,deaths:2,
    shots:15,errors:0,damageDealt:100,damageTaken:25,duration:290,finishedNaturally:true,termination:'results',
    modeState:{scores:{red:50,blue:48}},c19NaturalTrial:{requested:true,capSeconds:600,serverTerminal:true,rightCensored:false},
    c20MatchedSeedTrial:{requested:true,design:'controlled-paired-simulator-forks',pairSeed:j.seed,arm:j.arm,replicate:j.replicate}},
   observation:{metadata:{seed:j.seed,mode:'tdm',map:j.map,loadout:j.weapon,assignment:a,productionActuation:false,
    explorationAlgorithm:'c16-lazy-geometry-c15-scheduler'},diagnostics:{interventionTicks:j.arm==='treatment'?4:0},
    offers:[{seed:j.seed,arm:j.arm,validity:{serverOnlyFeaturesUsed:false}}]}};
 });return {plan,rows};
}
test('C20 preregistration produces two opposite arms on exactly the same game seed in every pair',()=>{
 const p=createMatchedSeedPlanC20({sourceFingerprint:'x',pairsPerStratum:2}),q=createMatchedSeedPlanC20({sourceFingerprint:'x',pairsPerStratum:2});
 assert.deepEqual(p,q);assert.equal(p.jobs.length,24);
 for(let i=0;i<p.jobs.length;i+=2){const a=p.jobs[i],b=p.jobs[i+1];assert.equal(a.seed,b.seed);assert.equal(a.pairId,b.pairId);
  assert.deepEqual(new Set([a.arm,b.arm]),new Set(['control','treatment']));}
 assert.equal(new Set(p.jobs.map(x=>x.seed)).size,12);
});
test('C20 match-level analysis computes paired delta and descriptive stratum bootstrap',()=>{
 const {plan,rows}=fixture(),a=analyzeMatchedSeedC20(plan,rows,{bootstrapReplicates:200});
 assert.equal(a.matches,24);assert.equal(a.pairs,12);assert.equal(a.naturalEnded,24);
 assert.equal(a.meanPairedKillDifferential,1);assert.deepEqual(a.stratifiedBootstrapCI95,[1,1]);
 assert.equal(a.approval.neuralActionValueTrainingAllowed,false);
});
test('C20 is invariant to arbitrary row order',()=>{
 const {plan,rows}=fixture();const a=analyzeMatchedSeedC20(plan,rows,{bootstrapReplicates:200});
 const b=analyzeMatchedSeedC20(plan,[...rows].reverse(),{bootstrapReplicates:200});
 assert.equal(a.meanPairedKillDifferential,b.meanPairedKillDifferential);assert.deepEqual(a.stratifiedBootstrapCI95,b.stratifiedBootstrapCI95);
});
test('C20 rejects reused seed across independent pairs, duplicate arms and missing results',()=>{
 const {plan,rows}=fixture();
 assert.throws(()=>analyzeMatchedSeedC20(plan,rows.slice(1),{bootstrapReplicates:200}));
 assert.throws(()=>analyzeMatchedSeedC20(plan,[...rows.slice(1),rows[1]],{bootstrapReplicates:200}));
 const bad=structuredClone(rows);bad[2].result.seed=rows[0].result.seed;
 assert.throws(()=>analyzeMatchedSeedC20(plan,bad,{bootstrapReplicates:200}));
});
test('C20 rejects tampered preregistration and counterfeit arm assignment',()=>{
 const {plan,rows}=fixture();const r=structuredClone(rows);r[1].observation.metadata.assignment.arm=r[1].arm==='control'?'treatment':'control';
 assert.throws(()=>analyzeMatchedSeedC20(plan,r,{bootstrapReplicates:200}));
 assert.throws(()=>analyzeMatchedSeedC20({...plan,baseSeed:41},rows,{bootstrapReplicates:200}));
});
test('C20 rejects mislabeled right censoring and counterfeit natural ending',()=>{
 const {plan,rows}=fixture();for(const change of [r=>r[0].result.c19NaturalTrial.rightCensored=true,
 r=>r[0].result.modeState.scores.red=49,r=>r[0].result.duration=650]){
  const copy=structuredClone(rows);change(copy);assert.throws(()=>analyzeMatchedSeedC20(plan,copy,{bootstrapReplicates:200}));
 }
});
test('C20 requires baseline identity when treatment took no action',()=>{
 const {plan,rows}=fixture();const t=rows.find(x=>x.arm==='treatment');t.observation.diagnostics.interventionTicks=0;
 assert.throws(()=>analyzeMatchedSeedC20(plan,rows,{bootstrapReplicates:200}));
 t.result.kills=4;const a=analyzeMatchedSeedC20(plan,rows,{bootstrapReplicates:200});assert.equal(a.baselineIdentity.noActuationPairs,1);
});
test('C20 refuses confident bootstrap interval for one pair per stratum',()=>{
 const {plan,rows}=fixture(1);const a=analyzeMatchedSeedC20(plan,rows,{bootstrapReplicates:200});
 assert.equal(a.stratifiedBootstrapCI95,null);assert.equal(a.pairs,6);
});
test('C20 rejects leaking server features and production action',()=>{
 const {plan,rows}=fixture();const data=structuredClone(rows);
 data[0].observation.offers[0].validity.serverOnlyFeaturesUsed=true;
 assert.throws(()=>analyzeMatchedSeedC20(plan,data,{bootstrapReplicates:200}));
 const data2=structuredClone(rows);data2[0].observation.metadata.productionActuation=true;
 assert.throws(()=>analyzeMatchedSeedC20(plan,data2,{bootstrapReplicates:200}));
});
