import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAPS} from '../lab/arena/source-main/maps/index.js';
import {sampleScenarioC33,encounterC33,trialC33,validateScenarioC33,publicFeaturesC33,FEATURE_NAMES_C33,MAPS_C33} from '../lab/arena/map-encounter-c33.mjs';
import {sampleRefinedC33,refinedEncounterC33,FEATURES_C33_B} from '../lab/arena/map-encounter-refined-c33.mjs';
const scenario=()=>sampleScenarioC33(331000017,'arena','mp5sd');
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
test('C33 uses exactly canonical map AABB arrays',()=>{
 for(const m of MAPS_C33)assert.ok(MAPS[m].boxes.length>20);
 assert.ok(MAPS.arena.boxes.some(b=>b.x1-b.x0>.5));
});
test('C33 action names and full server counterfactual triplets',()=>{
 const record=encounterC33(scenario());
 assert.deepEqual(record.arms.map(a=>a.action),['baseline','micro-left','micro-right']);
 assert.ok(record.arms.every(a=>Number.isFinite(a.cappedLoss)&&a.cappedLoss>=0));
});
test('C33 hidden aim nuisance does not enter features',()=>{
 const s=scenario(),f=publicFeaturesC33(s);
 const other={...s,aimError:.18,tracking:'lead',aim:!s.aim};
 assert.deepEqual(publicFeaturesC33(other),f);
});
test('C33 features never include outcome or opponent secret target aim',()=>{
 assert.equal(FEATURE_NAMES_C33.length,16);
 assert.equal(FEATURES_C33_B.length,19);
 for(const n of FEATURES_C33_B)assert.doesNotMatch(n,/aimError|hidden|damage|futureShot/i);
});
test('C33 sampler is seeded and deterministic',()=>{
 assert.deepEqual(scenario(),scenario());
 assert.notDeepEqual(scenario(),sampleScenarioC33(331000018,'arena','mp5sd'));
});
test('C33 ordered action trials do not change physics outcomes',()=>{
 const s=scenario();const a=trialC33(s,'micro-right');
 const b=trialC33(s,'baseline');
 const c=trialC33(s,'micro-left');
 assert.deepEqual(encounterC33(s).arms,[b,c,a]);
});
test('C33 rejects invalid map and secret out-of-range aim',()=>{
 assert.throws(()=>validateScenarioC33({...scenario(),map:'madeup'}));
 assert.throws(()=>validateScenarioC33({...scenario(),aimError:1.1}));
});
test('C33 collision sampling visits genuine blocked lateral movement',()=>{
 const r=encounterC33(sampleScenarioC33(3300100,'arena','mp5sd'));
 assert.ok(r.arms.some(a=>a.blockedTicks>0),'actual stepMove produced blocked ticks');
});
test('C33-B features are current public geometry, not future damage',()=>{
 const s=sampleRefinedC33(337000019,'foundry','aa12'),a=refinedEncounterC33(s);
 assert.equal(a.publicFeatures.length,19);
 assert.ok(a.publicFeatures.every(Number.isFinite));
 const hidden={...s,aimError:-.17,tracking:'lock',aim:!s.aim};
 assert.deepEqual(refinedEncounterC33(hidden).publicFeatures,a.publicFeatures);
});
test('C33-B body yaw aligns with observable geometric bearing',()=>{
 const s=sampleRefinedC33(337000020,'foundry','aa12');
 const bearing=-Math.atan2(s.tx-s.sx,s.sz-s.tz);
 assert.ok(Math.abs(s.bodyYaw-bearing)<=.251);
});
test('C33 policy-selection gates refuse both frozen neural checkpoints',()=>{
 for(const group of ['map-cohort','refined-cohort']){
  const model=read(`../reports/c33/${group}/FROZEN-MODEL.json`);
  assert.equal(model.neuralEligibleForFullMatch,false);
  assert.equal(model.productionAuthorized,false);
  assert.equal(model.selected,'cover-and-clearance');
  assert.ok(model.neuralGainOverBestSimpleVal<0);
 }
});
test('C33 independent seed registration and replay integrity',()=>{
 const v=read('../reports/c33/INDEPENDENT-REPLAY.json');
 assert.equal(v.totalScenarios,6480);assert.equal(v.totalArms,19440);
 assert.equal(v.crossCohortSeedOverlap,0);assert.equal(v.zeroReplayDisagreements,true);
});
test('C33 frozen policy selection follows validation, not sealed holdout',()=>{
 for(const group of ['map-cohort','refined-cohort']){
  const m=read(`../reports/c33/${group}/FROZEN-MODEL.json`),e=read(`../reports/c33/${group}/SEALED-EVALUATION.json`);
  assert.equal(m.testViewedBeforeFreeze,false);
  assert.equal(e.holdoutWasNeverUsedForSelection,true);
  assert.equal(e.selectionLockedBeforeTest,m.selected);
 }
});
