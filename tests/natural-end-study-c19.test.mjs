import test from 'node:test';
import assert from 'node:assert/strict';
import {createNaturalEndPlanC19,analyzeNaturalEndC19,C19_STRATA} from '../lab/arena/natural-end-study-c19.mjs';
import {stratifiedAssignmentC17} from '../lab/arena/stratified-exploration-c17.mjs';
function fixture(){
 const plan=createNaturalEndPlanC19({sourceFingerprint:'fixture-sha',blocksPerStratum:1});
 const rows=plan.jobs.map(j=>{
  const a=stratifiedAssignmentC17({map:j.map,loadout:j.weapon,seed:j.seed,replicate:j.replicate,experimentSeed:j.experimentSeed});
  const natural=j.replicate===0;
  return {jobId:j.id,cohort:'stratified',variant:'17',arm:j.arm,fullMatch:true,capSeconds:600,
   result:{seed:j.seed,map:j.map,mode:j.mode,primaryLoadout:j.weapon,duration:natural?300:600,
    finishedNaturally:natural,termination:natural?'results':'match',c19NaturalTrial:{requested:true,capSeconds:600,serverTerminal:natural,rightCensored:!natural},
    modeState:{scores:natural?{red:50,blue:40}:{red:37,blue:39}},kills:j.arm==='treatment'?3:2,deaths:1,
    shots:10,errors:0,damageDealt:100,damageTaken:20,c14:{assignment:a},explorationProfiler:{instrumented:true,totalMs:3}},
   observation:{metadata:{seed:j.seed,mode:'tdm',map:j.map,loadout:j.weapon,assignment:a,productionActuation:false,
    explorationAlgorithm:'c16-lazy-geometry-c15-scheduler'},diagnostics:{interventionTicks:j.arm==='treatment'?4:0},offers:[]}};
 });return {plan,rows};
}
test('C19 preregistration is deterministic and matches six balanced strata',()=>{
 const p=createNaturalEndPlanC19({sourceFingerprint:'foo',blocksPerStratum:1}),q=createNaturalEndPlanC19({sourceFingerprint:'foo',blocksPerStratum:1});
 assert.deepEqual(p,q);assert.equal(p.jobs.length,12);assert.equal(C19_STRATA.length,6);
 assert.equal(new Set(p.jobs.map(j=>j.seed)).size,12);
 for(const [map,weapon] of C19_STRATA)assert.deepEqual(new Set(p.jobs.filter(j=>j.map===map&&j.weapon===weapon).map(j=>j.arm)),new Set(['control','treatment']));
});
test('C19 reports valid natural ends and administrative censoring without removing assigned matches',()=>{
 const {plan,rows}=fixture(),a=analyzeNaturalEndC19(plan,rows,{replicates:250});
 assert.equal(a.assignedMatches,12);assert.equal(a.completeBlocks,6);assert.equal(a.naturalEnded,6);assert.equal(a.administrativelyCensored,6);
 assert.equal(a.observedITT,1);assert.equal(a.stratifiedBootstrapCI95,null);assert.ok(a.inferenceWarnings.length);assert.equal(a.productionPromotionAllowed,false);assert.equal(a.neuralValueTrainingAllowed,false);
});
test('C19 inference is invariant to row order',()=>{
 const {plan,rows}=fixture(),args={replicates:250};
 const a=analyzeNaturalEndC19(plan,rows,args),b=analyzeNaturalEndC19(plan,[...rows].reverse(),args);
 assert.deepEqual([a.observedITT,a.stratifiedBootstrapCI95,a.pairedSignFlipP],[b.observedITT,b.stratifiedBootstrapCI95,b.pairedSignFlipP]);
});
test('C19 rejects fake terminal state and truncated match mislabeled natural',()=>{
 const {plan,rows}=fixture();
 for(const change of [r=>r[0].result.finishedNaturally=false,r=>r[0].result.modeState.scores.red=49,
  r=>{r[1].result.duration=500;},r=>{r[1].result.c19NaturalTrial.rightCensored=false;},
  r=>{r[0].result.termination='match';}]){
  const copy=structuredClone(rows);change(copy);assert.throws(()=>analyzeNaturalEndC19(plan,copy,{replicates:150}));
 }
});
test('C19 rejects mismatched registration, duplicate and missing jobs',()=>{
 const {plan,rows}=fixture();assert.throws(()=>createNaturalEndPlanC19({capSeconds:300}));
 assert.throws(()=>analyzeNaturalEndC19({...plan,baseSeed:1},rows,{replicates:150}));
 assert.throws(()=>analyzeNaturalEndC19(plan,rows.slice(1),{replicates:150}));
 assert.throws(()=>analyzeNaturalEndC19(plan,[rows[0],...rows.slice(0,-1)],{replicates:150}));
});
test('C19 enforces randomized provenance, control no-op, complete paired blocks',()=>{
 const {plan,rows}=fixture();for(const change of [r=>r[0].observation.metadata.assignment.arm='control',
  r=>r[0].observation.metadata.productionActuation=true,
  r=>{const c=r.find(x=>x.arm==='control');c.observation.diagnostics.interventionTicks=3;},
  r=>r[0].arm='bogus',r=>r[0].result.errors=1]){
  const copy=structuredClone(rows);change(copy);assert.throws(()=>analyzeNaturalEndC19(plan,copy,{replicates:150}));
 }
});
test('C19 rejects non-full-match and unsafe sub-600 horizon',()=>{
 const {plan,rows}=fixture();rows[0].fullMatch=false;
 assert.throws(()=>analyzeNaturalEndC19(plan,rows,{replicates:150}));
});

test('C19 refuses degenerate per-stratum bootstrap when only one block is available',()=>{
 const {plan,rows}=fixture();const result=analyzeNaturalEndC19(plan,rows,{replicates:250});
 assert.equal(result.stratifiedBootstrapCI95,null);assert.match(result.inferenceWarnings.join(),/unidentifiable/);
});
