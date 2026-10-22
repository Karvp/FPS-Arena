import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {counterfactualC32,trialC32,featuresC32,checkC32,ACTIONS_C32,FEATURE_NAMES_C32} from '../lab/arena/counterfactual-fire-c32.mjs';
const base={seed:32015398,weaponId:'mp5sd',distance:24.115,offset:21.46235,baseVelocity:-8.06225,
 lagSeconds:.125,bodyYawRelative:.906302,aimError:.016253,coverShift:.505579,
 cover:'thin-right',tracking:'partial',aim:true};
test('C32 only canonical three actions',()=>assert.deepEqual(ACTIONS_C32,['baseline','micro-left','micro-right']));
test('C32 public features have 14 finite entries, correct one-hot',()=>{
 const f=featuresC32(base);assert.equal(f.length,14);assert.deepEqual(FEATURE_NAMES_C32.slice(8),['weapon=mp5sd','weapon=m4a1','weapon=aa12','weapon=hk_sl8','weapon=uzi','weapon=l115a3']);assert.deepEqual(f.slice(8),[1,0,0,0,0,0]);assert.ok(f.every(Number.isFinite));});
test('C32 rejects invalid weapon, lag, nonfinite and invented nuisances',()=>{
 for(const change of [{weaponId:'minigun'},{lagSeconds:.31},{offset:100},{distance:0},{aimError:1},{bodyYawRelative:Infinity}])
 assert.throws(()=>checkC32({...base,...change}));});
test('C32 hidden tracking, aimError and ADS cannot leak into public vector',()=>{
 const f=featuresC32(base);for(const change of [{tracking:'lock'},{aimError:-.1},{aim:false}])
 assert.deepEqual(featuresC32({...base,...change}),f);
});
test('C32 cover layout is public but does not reveal the hidden hit label',()=>{
 const a=counterfactualC32(base);const b=counterfactualC32({...base,cover:'none'});
 assert.ok(a.worldBoxes.length>0);assert.equal(b.worldBoxes.length,0);
 assert.equal(a.arms.length,3);assert.ok(a.arms.every(x=>x.shots>0));
 assert.notDeepEqual(a.publicFeatures,b.publicFeatures);
});
test('C32 server movement collision can prevent lateral step',()=>{
 const trials=counterfactualC32(base);assert.ok(trials.arms.some(a=>a.blockedTicks>0));
 assert.equal(trials.arms[1].blockedTicks,9);
});
test('C32 trial reproducible for fixed seed',()=>{
 assert.deepEqual(counterfactualC32(base),counterfactualC32(base));
});
test('C32 all three counterfactual branches independent of evaluation order',()=>{
 const r=counterfactualC32(base);for(let k=2;k>=0;k--)assert.deepEqual(trialC32(base,ACTIONS_C32[k]),r.arms[k]);
});
test('C32 server weapon cadence respects slower sniper fire interval',()=>{
 const c=counterfactualC32({...base,weaponId:'l115a3',cover:'none'});
 assert.ok(c.arms[0].shots>0&&c.arms[0].shots<counterfactualC32({...base,cover:'none'}).arms[0].shots);
});
test('C32 full source labels include map wall and common-shot provenance',()=>{
 const q=counterfactualC32(base);assert.equal(q.source,'server fireWeapon and shared stepMove; controlled 1v1');
 assert.equal(q.commonRandomNumbers,true);assert.equal(q.schema,'fpsarena-c32-server-cover-movement-counterfactual-v1');
});
test('C32 pre-registration has independent seed splits, cover diversity',()=>{
 for(const name of ['encounters','balanced']){
  const p=JSON.parse(readFileSync(new URL(`../reports/c32/${name}/PRE-REGISTERED-PLAN.json`,import.meta.url)));
  const all=p.scenarios,unique=new Set(all.map(x=>x.scenario.seed));assert.equal(all.length,unique.size);
  for(const v of ['train','validation','test'])assert.ok(all.some(x=>x.split===v));
  assert.ok(new Set(all.map(x=>x.scenario.cover)).size>=7);
 }
});
test('C32 frozen winner determined by validation, not test outcomes',()=>{
 for(const name of ['encounters','balanced']){
  const f=JSON.parse(readFileSync(new URL(`../reports/c32/${name}/FROZEN-MODEL.json`,import.meta.url)));
  const choices=Object.entries(f.candidates).sort((a,b)=>a[1].damage-b[1].damage);
  assert.equal(f.selection,choices[0][0]);assert.equal(f.neuralChosen,false);assert.equal(f.modelWeights,null);
 }
});
