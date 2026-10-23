import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {predictV62Shadow,publicVectorV62,V62_ARMS} from '../lab/arena/tdm-shadow-critic-v62.mjs';
const modelBytes=readFileSync(new URL('../research/tdm-v62-shadow-neural-critic.json',import.meta.url));
const model=JSON.parse(modelBytes);
const fixtures=JSON.parse(readFileSync(new URL('../research/tdm-v62-shadow-parity-fixtures.json',import.meta.url),'utf8'));
test('frozen shadow weights and independent reference SHA match',()=>{
 assert.equal(createHash('sha256').update(modelBytes).digest('hex'),fixtures.modelSha256);
 assert.equal(model.productionUse,false);
 assert.equal(model.policyPromotion,false);
 assert.equal(fixtures.probes.length,16);
});
test('16 PyTorch and JS predictions agree across weapons, cues, maps and arms',()=>{
 for(const row of fixtures.probes){
  const x=publicVectorV62({publicState:row.publicState,map:row.map,weapon:row.weapon,arm:row.arm});
  assert.equal(x.length,22);
  const got=predictV62Shadow(model,{publicState:row.publicState,map:row.map,weapon:row.weapon,arm:row.arm});
  assert.ok(Math.abs(got.utility-row.expectedUtility)<=0.00002,
   `${row.group}/${row.arm}: utility ${got.utility} != ${row.expectedUtility}`);
  assert.ok(Math.abs(got.hazardProbability-row.expectedRisk)<=0.00002,
   `${row.group}/${row.arm}: hazard ${got.hazardProbability} != ${row.expectedRisk}`);
 }
});
test('reject nonpublic or unrecognized model inputs',()=>{
 const {publicState,map,weapon}=fixtures.probes[0];
 assert.throws(()=>publicVectorV62({publicState:{...publicState,valid:false},map,weapon,arm:'keep'}),/V62_INVALID_PUBLIC_INPUT/);
 assert.throws(()=>publicVectorV62({publicState,map,weapon,arm:'impossible'}),/V62_INVALID_PUBLIC_INPUT/);
 assert.throws(()=>predictV62Shadow({...model,productionUse:true},{publicState,map,weapon,arm:'keep'}),/V62_SHADOW_ONLY/);
});
test('arm encodings are exclusive and model is never an action actuator',()=>{
 const {publicState,map,weapon}=fixtures.probes[0];
 assert.deepEqual(V62_ARMS,['keep','close','strafe','withdraw']);
 for(const arm of V62_ARMS){
  const x=publicVectorV62({publicState,map,weapon,arm});
  assert.equal(x.slice(-4).reduce((a,b)=>a+b,0),1);
 }
 assert.equal(typeof model.modelFit.weights['shared.0.weight'][0][0],'number');
});
