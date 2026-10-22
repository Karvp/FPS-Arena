import test from 'node:test';
import assert from 'node:assert/strict';
import {planCameraMovement} from '../camera-tactics.mjs';
const wall={x0:-.8,x1:.8,y0:0,y1:4,z0:6,z1:8};
const enemy={id:'enemy',x:0,y:0,z:14,yaw:0,pitch:0,aim:true};
const selected={id:'enemy',point:{x:0,y:1.3,z:14}};
function setup(){const game={local:{mv:{x:3,y:0,z:0}},map:{boxes:[wall],bound:55}};
 const memory={};planCameraMovement(game,[enemy],selected,1,memory,{peek:true,peekCacheLab:true});
 Object.assign(game.local.mv,memory.cover.point);return {game,memory};}
test('static peek lanes reuse recent geometry but expire within 120ms',()=>{
 const {game,memory}=setup();
 planCameraMovement(game,[enemy],selected,1.1,memory,{peek:true,peekCacheLab:true});
 const first=memory.peekCache;assert.ok(first?.points?.length);
 planCameraMovement(game,[enemy],selected,1.15,memory,{peek:true,peekCacheLab:true});
 assert.equal(memory.peekCache,first);
 planCameraMovement(game,[enemy],selected,1.25,memory,{peek:true,peekCacheLab:true});
 assert.notEqual(memory.peekCache,first);
});
test('moving targets, contact changes or a new geometry map invalidate cached peek lanes',()=>{
 const {game,memory}=setup();
 planCameraMovement(game,[enemy],selected,1.1,memory,{peek:true,peekCacheLab:true});
 let first=memory.peekCache;
 planCameraMovement(game,[enemy],{...selected,point:{x:1.2,y:1.3,z:14}},1.12,memory,{peek:true,peekCacheLab:true});
 assert.notEqual(memory.peekCache,first);
 first=memory.peekCache;
 planCameraMovement(game,[enemy,{...enemy,id:'flank',x:4}],selected,1.14,memory,{peek:true,peekCacheLab:true});
 assert.notEqual(memory.peekCache,first);
 first=memory.peekCache;
 game.map={...game.map};
 planCameraMovement(game,[enemy,{...enemy,id:'flank',x:4}],selected,1.16,memory,{peek:true,peekCacheLab:true});
 assert.notEqual(memory.peekCache,first);
});
test('stale cover anchors never keep an old exposure cycle merely due to proximity',()=>{
 const {game,memory}=setup();
 planCameraMovement(game,[enemy],selected,1.1,memory,{peek:true,peekCacheLab:true});
 memory.cycleState={phase:'hidden',until:9,cycle:3,seed:9};
 const old=memory.cover.point;
 game.map={boxes:[{...wall,x0:old.x-.3,x1:old.x+.3,z0:old.z-.3,z1:old.z+.3}],bound:55};
 // The old anchor is now blocked. Replan must not inherit the old peek cycle.
 planCameraMovement(game,[enemy],selected,2.4,memory,{peek:true,peekCacheLab:true});
 assert.notEqual(memory.cycleState?.seed,9);
});

test('default policy does not enable experimental peek caching',()=>{
 const {game,memory}=setup();
 planCameraMovement(game,[enemy],selected,1.1,memory,{peek:true});
 assert.equal(memory.peekCache,undefined);
});
