import test from 'node:test';
import assert from 'node:assert/strict';
import {valueFeaturesC20,fitDiagnosticC20,predictDiagnosticC20,evaluateDiagnosticC20} from '../lab/arena/stratum-value-diagnostic-c20.mjs';
const pairs=[{pairId:'a0',stratum:'tdm|arena|mp5sd',delta:1},{pairId:'a1',stratum:'tdm|arena|mp5sd',delta:-1},
 {pairId:'b0',stratum:'tdm|foundry|aa12',delta:0},{pairId:'b1',stratum:'tdm|foundry|aa12',delta:3},
 {pairId:'c0',stratum:'tdm|neon|m4a1',delta:2},{pairId:'c1',stratum:'tdm|neon|m4a1',delta:-2}];
test('C20 diagnostic uses seven pre-treatment categorical features, never a seed/outcome',()=>{
 assert.deepEqual(valueFeaturesC20('tdm|arena|mp5sd'),[1,0,0,1,0,0,0]);
 assert.throws(()=>valueFeaturesC20('tdm|arena|invalid'));
});
test('C20 neural diagnostic weights are deterministic and trained without held-out stratum',()=>{
 const a=fitDiagnosticC20(pairs),b=fitDiagnosticC20([...pairs].reverse());assert.deepEqual(a,b);
 assert.ok(Number.isFinite(predictDiagnosticC20(a,'tdm|neon|m4a1')));
});
test('C20 leave-one-stratum-out does not reuse paired seed within training and heldout',()=>{
 const e=evaluateDiagnosticC20({pairOutcomes:pairs});assert.equal(e.pairs,6);assert.equal(e.strata,3);
 assert.equal(e.actionValueModelEligible,false);assert.equal(e.productionPromotionAllowed,false);
 assert.deepEqual(new Set(e.heldout.map(x=>x.pairId)),new Set(pairs.map(x=>x.pairId)));
 assert.ok(e.models.zero.rmse>=0&&Number.isFinite(e.models.neural.rmse));
});
test('C20 evaluation invariant to result ordering and refuses duplicate match pairs',()=>{
 const a=evaluateDiagnosticC20({pairOutcomes:pairs}),b=evaluateDiagnosticC20({pairOutcomes:[...pairs].reverse()});
 assert.deepEqual(a.heldout,b.heldout);
 assert.throws(()=>evaluateDiagnosticC20({pairOutcomes:[...pairs.slice(1),pairs[1]]}));
});
