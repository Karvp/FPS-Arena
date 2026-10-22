import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateSequencePrefixC35AG} from '../lab/arena/sequence-prefix-inference-c35ag.mjs';
const model=JSON.parse(readFileSync(new URL('../reports/c35ag/frozen-72/FROZEN-SEQUENCE-PREFIX-NEURAL.json',import.meta.url),'utf8'));
const samples=JSON.parse(readFileSync(new URL('../reports/c35ag/frozen-72/HOLDOUT-PREDICTIONS.json',import.meta.url),'utf8'));
test('C35AG frozen network is offline descriptive and not a controller',()=>{assert.equal(model.status,'OFFLINE_DESCRIPTIVE_NOT_DEPLOYABLE');assert.match(model.nonCausalWarning,/POST-TREATMENT/);assert.equal(samples.length,60);});
test('C35AG exported MLP replays 60 independent holdout forecasts with small numeric error',()=>{for(const s of samples)assert.ok(Math.abs(evaluateSequencePrefixC35AG(model,s.featureValues)-s.neural)<1e-7);});
test('C35AG reject wrong feature count, NaN and bad schema',()=>{assert.throws(()=>evaluateSequencePrefixC35AG(model,[0]),/schema|shape/);assert.throws(()=>evaluateSequencePrefixC35AG(model,[...samples[0].featureValues.slice(1),NaN]),/invalid feature/);assert.throws(()=>evaluateSequencePrefixC35AG({...model,status:'ACTIVE_POLICY'},samples[0].featureValues),/schema/);});
