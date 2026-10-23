import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {v64ShadowScore,v64FeatureVector} from '../lab/arena/tdm-v64-context-shadow.mjs';
const bytes=readFileSync(new URL('../research/tdm-v64-public-context-shadow-model.json',import.meta.url));
const model=JSON.parse(bytes);
const refs=JSON.parse(readFileSync(new URL('../research/tdm-v64-js-python-parity-fixtures.json',import.meta.url),'utf8'));
test('frozen model cannot control game, matches parity reference SHA',()=>{
 assert.equal(model.productionUse,false);
 assert.equal(model.noPromotion,true);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),refs.modelSha256);
 assert.ok(refs.probes.length>=4);
});
test('fixed numpy coefficients match JS shadow inference for every arm',()=>{
 for(const c of refs.probes){
  const o=v64ShadowScore(model,{publicState:c.publicState,context:c.context,
    map:c.map,weapon:c.weapon,variant:c.variant});
  assert.equal(o.mayApplyToGame,false);
  for(let i=0;i<4;i++){
   assert.ok(Math.abs(o.utility[i]-c.utility[i])<1e-8,
    c.group+' '+c.variant+' arm'+i+' utility '+o.utility[i]+' vs '+c.utility[i]);
   assert.ok(Math.abs(o.hazard[i]-c.hazard[i])<1e-8,
    c.group+' '+c.variant+' arm'+i+' hazard '+o.hazard[i]+' vs '+c.hazard[i]);
  }
 }
});
test('feature dimensions and public-only input boundary',()=>{
 const f=refs.probes[0];
 const x=v64FeatureVector({publicState:f.publicState,context:f.context,
  map:f.map,weapon:f.weapon,arm:'keep'});
 assert.equal(x.length,50);
 assert.ok(x.every(Number.isFinite));
 assert.throws(()=>v64FeatureVector({publicState:f.publicState,context:{...f.context,noPrivateServerInput:false},
  map:f.map,weapon:f.weapon,arm:'keep'}),/V64_PUBLIC_CONTEXT_REQUIRED/);
 assert.throws(()=>v64ShadowScore({...model,productionUse:true},{publicState:f.publicState,context:f.context,
  map:f.map,weapon:f.weapon}),/V64_SHADOW_ONLY/);
});
