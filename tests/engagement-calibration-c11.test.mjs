import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEAPONS} from '../lab/arena/source-main/shared/weapons.js';
import {authoritativeShotTrial} from '../lab/arena/server-shot-harness-c11.mjs';
import {fitDamageCalibration,calibratedDamage,evaluateDamageCalibration} from '../engagement-calibration.mjs';
import {estimateEngagementBallistics} from '../engagement-ballistics.mjs';

test('C11 server harness executes authentic shot and hit events; shot counts are not pellets',()=>{
 const {result,events}=authoritativeShotTrial({weaponId:'aa12',distance:8,shotCount:40,shotSeed:101});
 assert.equal(result.shotEvents,40);
 assert.equal(events.filter(x=>x.type==='shot').length,40);
 assert.equal(result.hitEvents,events.filter(x=>x.type==='hit').length);
 assert.ok(result.hitEvents<=40,'server aggregates all pellet damage per target');
 assert.ok(result.observedDamage>=0);
 assert.equal(result.source,'main-server/fireWeapon');
});
test('C11 moving target without server rewind differs from compensated observation',()=>{
 const opts={weaponId:'mp5sd',distance:95,aim:true,speed:8,lag:.16,shotCount:512,shotSeed:102};
 const moving=authoritativeShotTrial({...opts,motion:'constant',rewind:false}).result;
 const compensated=authoritativeShotTrial({...opts,motion:'constant',rewind:true}).result;
 assert.equal(moving.shotEvents,512);
 assert.equal(compensated.shotEvents,512);
 assert.ok(compensated.observedDamage>moving.observedDamage,'server history must affect true hit geometry');
 assert.equal(compensated.actualDisplacement,0);
 assert.ok(moving.actualDisplacement>1);
});
test('C11 stationary server outcome is deterministic across identical seeds',()=>{
 const opts={weaponId:'m4a1',distance:45,shotCount:200,shotSeed:103,aim:true};
 const x=authoritativeShotTrial(opts).result, y=authoritativeShotTrial(opts).result;
 assert.deepEqual(x,y);
 const m=estimateEngagementBallistics(WEAPONS.m4a1,45,{samples:96,aim:true});
 assert.ok(Math.abs(x.observedDamage-m.expectedDamagePerTrigger)<8);
});
test('C11 leakage guard collapses duplicated scenes even when scenarioIds differ',()=>{
 const data=[
  {scenarioId:'A',contextId:'same',family:'f',shots:100,predictedDamage:10,observedDamage:20},
  {scenarioId:'A-copy',contextId:'same',family:'f',shots:100,predictedDamage:10,observedDamage:20},
  {scenarioId:'B',contextId:'new',family:'f',shots:100,predictedDamage:10,observedDamage:20}
 ];
 const model=fitDamageCalibration(data,{minContexts:3,minShots:100});
 assert.equal(model.groups.f.contexts,2);
 assert.equal(model.groups.f.available,false);
 assert.equal(calibratedDamage(model,'f',15).damage,15);
 assert.equal(evaluateDamageCalibration(data,model).raw.contexts,2);
});
test('C11 calibration has cold-start, invalid and unfamiliar-family fallbacks',()=>{
 const m=fitDamageCalibration([{scenarioId:'X',family:'m4',shots:100,predictedDamage:8,observedDamage:16}]);
 assert.equal(calibratedDamage(m,'m4',8).usedCalibration,false);
 assert.equal(calibratedDamage(m,'unseen',8).damage,8);
 assert.equal(calibratedDamage(m,'m4',Infinity),null);
 assert.equal(calibratedDamage(m,'m4',-1),null);
});
test('C11 no calibration artifacts are imported into shipped page-agent',()=>{
 const src=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/engagement-calibration\.mjs/);
 const director=readFileSync(new URL('../tactical-director.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(director,/fitDamageCalibration|calibratedDamage/);
});

test('C11 per-trigger variance includes misses and does not double-count pellets',()=>{
 const {result,events}=authoritativeShotTrial({weaponId:'aa12',distance:16,shotCount:128,shotSeed:42013,aim:false});
 assert.equal(result.shotEvents,128);
 assert.ok(Number.isFinite(result.observedDamageStdError)&&result.observedDamageStdError>=0);
 assert.ok(result.observedDamageCI95[0]<=result.observedDamage);
 assert.ok(result.observedDamageCI95[1]>=result.observedDamage);
 assert.equal(result.nonzeroTriggerCount,new Set(events.filter(e=>e.type==='hit').map(e=>e.seq)).size);
 assert.ok(result.maxDamagePerTrigger>=0);
 assert.ok(result.nonzeroTriggerCount<=128);
});

test('C11 calibration abstains on insufficient rare high-impact headshot samples, weapon-agnostically',()=>{
 const rows=Array.from({length:5},(_,i)=>({scenarioId:`s${i}`,contextId:`x${i}`,
  family:'high-tail',shots:512,predictedDamage:35,observedDamage:100,
  headMultiplier:100,headEvents:2}));
 const unsafe=fitDamageCalibration(rows);
 assert.equal(unsafe.groups['high-tail'].available,false);
 assert.equal(unsafe.groups['high-tail'].calibrationAbstainReason,'rare-high-impact-headshots');
 assert.equal(calibratedDamage(unsafe,'high-tail',20).damage,20);
 const moreHeadEvidence=fitDamageCalibration(rows.map(r=>({...r,headEvents:20})));
 assert.equal(moreHeadEvidence.groups['high-tail'].available,true);
});

test('C11 cross-seed gate rejects any replication with worse RMSE and repeated shot seed',async()=>{
 const {assessCalibrationReplicates}=await import('../engagement-calibration.mjs');
 const run=(seed,mae,rmse)=>({config:{seed},evaluation:{holdout:{
  raw:{contexts:16,mae:10,rmse:12},calibrated:{contexts:16,mae,rmse}}}});
 const good=assessCalibrationReplicates([run(42,9.5,12),run(43,9.6,12.05)]);
 assert.equal(good.pass,true);
 assert.equal(assessCalibrationReplicates([run(42,9.5,12),run(43,9.7,13)]).pass,false);
 assert.ok(assessCalibrationReplicates([run(42,9.5,12),run(42,9.6,12)]).reasons.includes('duplicate-shot-seeds'));
 assert.equal(assessCalibrationReplicates([run(42,9.5,12)]).pass,false);
});

test('C11 conservative tail screening preserves stable torso-only high-multiplier contexts',()=>{
 const rows=Array.from({length:8},(_,i)=>({scenarioId:`steady${i}`,contextId:`steady:${i}`,
  family:'stable-torso',shots:512,predictedDamage:80,observedDamage:80,
  headMultiplier:100,headEvents:0,predictedHeadFraction:0,observedDamageStdError:0}));
 const model=fitDamageCalibration(rows);
 assert.equal(model.groups['stable-torso'].uncertainTailContexts,0);
 assert.equal(model.groups['stable-torso'].available,true);
});
