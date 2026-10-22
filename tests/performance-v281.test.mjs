import test from 'node:test';
import assert from 'node:assert/strict';
import oilrig from '../lab/arena/source/maps/oilrig.js';
import {gridRoute,gridRouteCooperative} from '../navigation-core.mjs';
import {multiLevelRoute,multiLevelRouteProgressive} from '../multi-level-nav.mjs';
import {planRespawnAdvantage} from '../defensive-core.mjs';

test('multi-floor A* is resumable across simulated frames without changing route',()=>{
 const start={x:0,y:8,z:-20},goal={x:0,y:16,z:0};
 const reference=multiLevelRoute(oilrig,start,goal,{maxExpanded:14000});
 assert.ok(reference?.length>30);
 const memory={};
 let result=multiLevelRouteProgressive(oilrig,start,goal,memory,{maxExpanded:14000});
 assert.equal(result.status,'pending','expensive vertical search should yield promptly');
 let slices=1;
 while(result.status==='pending' && slices++<600)
   result=multiLevelRouteProgressive(oilrig,start,goal,memory,{maxExpanded:14000});
 assert.equal(result.status,'ready');
 assert.deepEqual(result.path,reference,'slicing must preserve geometry, scoring and stair steps');
 assert.ok(slices>1 && slices<600);
});

test('cooperative navigation invalidates stale goal without mixing routes',()=>{
 const start={x:0,y:8,z:-20};
 const goalA={x:0,y:16,z:0},goalB={x:-18,y:8,z:-26};
 const state={};
 let a=gridRouteCooperative(oilrig,start,goalA,state,{maxExpanded:14000});
 for(let n=0;a.status==='pending'&&n<600;n++)a=gridRouteCooperative(oilrig,start,goalA,state,{maxExpanded:14000});
 assert.equal(a.status,'ready');
 let b=gridRouteCooperative(oilrig,start,goalB,state,{maxExpanded:14000});
 for(let n=0;b.status==='pending'&&n<600;n++)b=gridRouteCooperative(oilrig,start,goalB,state,{maxExpanded:14000});
 assert.equal(b.status,'ready');
 assert.notDeepEqual(b.path.at(-1),a.path.at(-1));
 assert.deepEqual(b.path,gridRoute(oilrig,start,goalB,{maxExpanded:14000}));
});

test('unreachable respawn staging is negatively cached rather than retried every 60Hz frame',()=>{
 const map={bound:30,boxes:[],spawns:{blue:[{x:10,y:0,z:10}]}};
 const game={map,local:{mv:{x:0,y:0,z:0}},you:{tm:0},net:{id:'trainee'},modeState:{type:'tdm'},
   remotes:{list:[{id:'bot',team:1,alive:false,pos:{x:10,y:0,z:10}}]}};
 const memory={};
 assert.equal(planRespawnAdvantage(game,1,memory,[]),null);
 assert.equal(memory.planAt,1);
 assert.equal(planRespawnAdvantage(game,1+1/60,memory,[]),null);
 assert.equal(memory.planAt,1,'a failed search must not repeat on the next frame');
 planRespawnAdvantage(game,2.5,memory,[]);
 assert.equal(memory.planAt,2.5,'failed-search cache must eventually expire');
});
