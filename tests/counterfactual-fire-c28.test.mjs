import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {counterfactualC28,scenarioC28,trialC28,C28_ACTIONS} from '../lab/arena/counterfactual-fire-c28.mjs';
import {WEAPONS} from '../lab/arena/source-main/shared/weapons.js';
const typical={seed:28001001,weaponId:'mp5sd',distance:25,lagSeconds:.125,
 tracking:'track',baseVelocity:0,offset:0,aim:true};
test('C28 three researched actions, no other choices',()=>assert.deepEqual(C28_ACTIONS,['baseline','micro-left','micro-right']));
test('C28 action determinism under same server spread seed',()=>{
 const a=counterfactualC28(typical),b=counterfactualC28(typical);assert.deepEqual(a,b);
 assert.equal(a.source,'uploaded main server/fireWeapon');assert.equal(a.isFullGame,false);
});
test('C28 common shot counts and sequence across all three actions',()=>{
 const trials=counterfactualC28(typical).arms;
 assert.equal(new Set(trials.map(x=>x.shots)).size,1);assert.ok(trials[0].shots>=2);
});
test('C28 obeys bolt-action fire interval and magazine limit',()=>{
 const row=counterfactualC28({...typical,weaponId:'l115a3'});
 assert.ok(WEAPONS.l115a3.interval>1.25);assert.deepEqual(row.arms.map(x=>x.shots),[1,1,1]);
});
test('C28 authoritative range zero damage beyond shotgun maximum range',()=>{
 const row=counterfactualC28({...typical,weaponId:'aa12',distance:80});
 assert.ok(row.arms.every(x=>x.cappedLoss===0 && x.uncappedDamage===0));
});
test('C28 incoming damage labels are nonnegative, bounded utility and preserve uncapped truth',()=>{
 const data=counterfactualC28({...typical,weaponId:'aa12',distance:10});
 assert.ok(data.arms.every(a=>a.cappedLoss>=0&&a.cappedLoss<=150&&a.uncappedDamage>=a.cappedLoss));
});
test('C28 never exposes hidden tracking script, labels or alternatives as model features',()=>{
 const row=counterfactualC28(typical);const p=row.observedBeforeChoice;
 assert.deepEqual(Object.keys(p).sort(),['baseVelocity','distance','lagSeconds','offset','weaponId'].sort());
 assert.equal(p.tracking,undefined);assert.equal(p.uncappedDamage,undefined);
});
test('C28 invalid seeds, unknown weapons, unsafe actions are refused',()=>{
 assert.throws(()=>scenarioC28({...typical,seed:-1}));
 assert.throws(()=>scenarioC28({...typical,weaponId:'unreal-gun'}));
 assert.throws(()=>trialC28(typical,'teleport'));
 assert.throws(()=>trialC28(typical,'baseline',{shotsLimit:0}));
});
test('C28 action alternatives can alter true server hit outcomes',()=>{
 const outcomes=counterfactualC28(typical).arms;
 assert.ok(new Set(outcomes.map(x=>x.uncappedDamage)).size>1);
});
test('C28 research harness is never imported by production entry',()=>{
 const source=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8')+readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/counterfactual-fire-c28|train-encounter-value-c28|FROZEN-POLICY/);
});
