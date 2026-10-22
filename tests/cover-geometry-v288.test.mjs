import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeCoverGeometry} from '../tools/analyze-cover-geometry.mjs';
const samples=[
 {t:0,p:[44,0,35],decision:{reason:'pro-rotate'}},
 {t:.5,p:[47,0,35],decision:{reason:'pro-rotate'}},
 {t:1,p:[44,0,35],decision:{reason:'peek-reposition-cover'}}
];
test('diagnostics count turnbacks without claiming tactical failure',()=>{
 const out=analyzeCoverGeometry({records:[{meta:{map:'foundry',seed:5},samples}]});
 assert.equal(out.total.reversals,1);
 assert.equal(out.total.nearbyReturnLoops,1);
 assert.equal(out.episodes[0].byReason['peek-reposition-cover'],1);
 assert.deepEqual(out.episodes[0].topTransitions[0],['pro-rotate -> peek-reposition-cover',1]);
 assert.match(out.definition,/Not a bullet-LOS/);
});
test('unknown map cannot invent open-ground distance',()=>{
 const out=analyzeCoverGeometry({records:[{meta:{map:'unmapped'},samples}]});
 assert.equal(out.total.openGroundReversals,0);
 assert.equal(out.episodes[0].examples[0].nearestObstacleMeters,null);
});
