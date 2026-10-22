import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {predictADSValueC35AE,scoreBothADSChoicesC35AE,encodeADSValueC35AE} from '../lab/arena/ads-value-c35ae.mjs';
const D=JSON.parse(fs.readFileSync(new URL('../reports/c35ae/offline-ads-value/FROZEN-ADS-VALUE-MODELS.json',import.meta.url)));
const rows=JSON.parse(fs.readFileSync(new URL('../reports/c35ae/offline-ads-value/HOLDOUT-PREDICTIONS.json',import.meta.url)));
test('frozen inference matches independent sklearn predictions all heldout rows and candidates',()=>{
 for(const r of rows){for(const [k,v] of Object.entries(r.predictions)){
  const x=predictADSValueC35AE(D[k],r.rawState,!!r.arm);
  assert.ok(Math.abs(x-v)<1e-8,`${k} ${r.setup}:${r.index} ${x} != ${v}`);
 }}
});
test('only action models can score both arms without observing factual label',()=>{
 const q=scoreBothADSChoicesC35AE(D['action-logistic'],rows[0].rawState);
 assert.ok(q.control>=0&&q.control<=1&&q.toggle>=0&&q.toggle<=1);
 assert.throws(()=>scoreBothADSChoicesC35AE(D['state-logistic'],rows[0].rawState));
});
test('invalid pre-step features and mutated model shapes fail closed',()=>{
 assert.throws(()=>encodeADSValueC35AE([NaN],true,D['action-mlp']));
 assert.throws(()=>predictADSValueC35AE(D['action-logistic'],[Infinity]));
 const damaged=structuredClone(D['action-logistic']);damaged.layers[0].weights.pop();
 assert.throws(()=>predictADSValueC35AE(damaged,rows[0].rawState));
});
test('frozen public feature vector is never mutated',()=>{
 const x=rows[0].rawState.slice();Object.freeze(x);
 predictADSValueC35AE(D['action-mlp'],x,true);assert.deepEqual(x,rows[0].rawState);
});
