import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicTemporalFeatures,validateC26Holdout,evaluateC26,C26_LAGS} from '../lab/arena/evaluate-temporal-threat-c26.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const development=read('../reports/c25/study24/COMBINED-DATASET.json');
const devPlan=read('../reports/c25/study24/PRE-REGISTERED-PLAN.json');
const hold=read('../reports/c26/study18/COMBINED-DATASET.json');
const plan=read('../reports/c26/study18/PRE-REGISTERED-PLAN.json');
const clone=x=>structuredClone(x);
test('C26 registration proves 18 whole-match new-seed/latency strata and C25 development fingerprint',()=>{
 const a=validateC26Holdout(hold,plan,development,devPlan);
 assert.equal(a.matches,18);assert.equal(a.complete,458);assert.equal(a.positive,36);assert.deepEqual(a.lags,C26_LAGS);
 assert.equal(new Set(hold.matches.map(m=>m.metadata.seed)).size,18);
});
test('C26 public temporal features cannot read future labels at any sampled window',()=>{
 const m=hold.matches[0],i=m.windows.findIndex((w,i)=>i>2&&w.complete);
 assert.ok(i>2);const first=publicTemporalFeatures(m,i);assert.equal(first.length,24);
 const b=clone(m);for(let k=0;k<=i;k++){b.windows[k].label.hostileWeaponHitEvents=1000+k;b.windows[k].label.hostileWeaponDamage=30000;}
 assert.deepEqual(publicTemporalFeatures(b,i),first);
});
test('C26 public histories require consecutive complete windows, no server-censored cross-gap',()=>{
 const m=clone(hold.matches[0]),i=m.windows.findIndex((w,i)=>i>2&&w.complete);
 assert.equal(publicTemporalFeatures(m,i)[15],1);
 m.windows[i-1].complete=false;const x=publicTemporalFeatures(m,i);
 assert.equal(x[15],0);assert.equal(x[16],0);assert.deepEqual(x.slice(5,15),Array(10).fill(0));
});
test('C26 fails closed on future server label embedded in the cue',()=>{
 const d=clone(hold);d.matches[0].windows[0].publicCueBeforeWindow.futureServerHit=1;
 assert.throws(()=>validateC26Holdout(d,plan,development,devPlan),/leakage firewall/);
});
test('C26 detects tampered registration, reused seed and changed development source',()=>{
 const p=clone(plan);p.jobs[0].seed=p.jobs[1].seed;
 assert.throws(()=>validateC26Holdout(hold,p,development,devPlan),/registration hash tampered/);
 const d=clone(development);d.matches[0].windows[0].publicStatus.healthFraction=.25;
 assert.throws(()=>validateC26Holdout(hold,plan,d,devPlan),/development artifacts changed/);
});
test('C26 rejects mismatched snapshot lag and changed fixed-grid time',()=>{
 const d=clone(hold);d.matches[0].metadata.snapshotLagMs=999;
 assert.throws(()=>validateC26Holdout(d,plan,development,devPlan),/provenance incorrect/);
 const f=clone(hold);f.matches[0].windows[1].start+=.5;
 assert.throws(()=>validateC26Holdout(f,plan,development,devPlan),/window overlap\/schedule/);
});
test('C26 evaluation selected model is bitwise deterministic from frozen files',()=>{
 const e=evaluateC26(development,devPlan,hold,plan),g=evaluateC26(development,devPlan,hold,plan);
 assert.deepEqual(e,g);assert.equal(e.selected.kind,'logistic');assert.equal(e.selected.temporal,true);
 assert.equal(e.newSeedHoldout.selected.windows,458);
});
test('C26 fresh-test label modifications cannot retroactively select a different model',()=>{
 const a=evaluateC26(development,devPlan,hold,plan),b=clone(hold);
 for(const w of b.matches[0].windows){w.label.hostileWeaponHitEvents=0;w.label.hostileWeaponDamage=0;}
 const e=evaluateC26(development,devPlan,b,plan);
 assert.deepEqual(e.selected,a.selected);assert.deepEqual(e.validationRanking,a.validationRanking);
 assert.deepEqual(e.modelArtifacts.selected,a.modelArtifacts.selected);
});
test('C26 learned MLP is real nonlinear network and heldout comparison remains offline',()=>{
 const e=evaluateC26(development,devPlan,hold,plan);
 assert.equal(e.validationRanking.some(c=>c.kind==='mlp'),true);
 assert.ok(Number.isFinite(e.newSeedHoldout.temporalNeural.brier));
 assert.ok(e.production.startsWith('UNMODIFIED'));
 assert.ok(e.newSeedHoldout.matchBootstrap.baselineMinusSelectedBrier[0]<0);
});
