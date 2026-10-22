import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMotionReplay} from '../tools/analyze-motion-replay.mjs';
test('replay tool detects world-space returning motions and attributes active planner',()=>{
 const record={meta:{map:'neon',seed:42},samples:[
  {t:0,p:[0,0,0]},{t:.5,p:[1,0,0]},
  {t:1,p:[.1,0,0],decision:{reason:'peek-reposition-cover'}},
  {t:1.5,p:[.8,0,0],decision:{reason:'pathfinding'}}]};
 const out=analyzeMotionReplay({records:[record]});
 assert.equal(out.total.worldReversalsSampled,2);
 assert.equal(out.total.returnNearPreviousPosition,2);
 assert.equal(out.episodes[0].reasons['peek-reposition-cover'],1);
});
test('replay tool ignores near-zero displacement and accepts missing data',()=>{
 const a=analyzeMotionReplay({records:[{samples:[{p:[0,0,0]},{p:[0,0,0]},{p:[0,0,0]}]},{samples:[]}]});
 assert.equal(a.total.worldReversalsSampled,0);
 assert.equal(analyzeMotionReplay(null).episodes.length,0);
});
