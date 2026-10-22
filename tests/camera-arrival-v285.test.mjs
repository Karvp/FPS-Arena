import test from 'node:test';
import assert from 'node:assert/strict';
import {planCameraMovement,cameraOccluded} from '../camera-tactics.mjs';
const map={boxes:[{x0:-.8,x1:.8,y0:0,y1:4,z0:6,z1:8}],bound:55};
const enemy={id:'enemy',x:0,y:0,z:14,yaw:0,pitch:0,aim:true};
const target={id:'enemy',point:{x:0,y:1.3,z:14}};
function scenario(){return {game:{local:{mv:{x:3,y:0,z:0}},map}, memory:{}};}
test('approach/cover hysteresis suppresses a boundary flip only behind actual 3D cover',()=>{
 const {game,memory}=scenario();
 let p=planCameraMovement(game,[enemy],target,1,memory,{peek:true});
 assert.equal(p?.phase,'approach');
 const anchor=memory.cover.point;
 Object.assign(game.local.mv,anchor);
 p=planCameraMovement(game,[enemy],target,1.1,memory,{peek:true});
 assert.notEqual(p.phase,'approach');
 assert.equal(memory.coverReadyAt,1.1);
 Object.assign(game.local.mv,{x:anchor.x,z:anchor.z-1.5});
 assert.ok(cameraOccluded(map,{x:0,y:1.5,z:14},{x:game.local.mv.x,y:1.3,z:game.local.mv.z}));
 p=planCameraMovement(game,[enemy],target,1.2,memory,{peek:true});
 assert.notEqual(p.phase,'approach','covered drift does not cause a new approach oscillation');
 Object.assign(game.local.mv,{x:anchor.x+1.65,z:anchor.z});
 assert.equal(cameraOccluded(map,{x:0,y:1.5,z:14},{x:game.local.mv.x,y:1.3,z:game.local.mv.z}),false);
 p=planCameraMovement(game,[enemy],target,1.3,memory,{peek:true});
 assert.equal(p.phase,'approach','exposed position never inherits the covered arrival state');
});
test('cover arrival memory is invalidated on a target/reload transition',()=>{
 const {game,memory}=scenario();
 planCameraMovement(game,[enemy],target,1,memory,{peek:true});
 const anchor=memory.cover.point;
 Object.assign(game.local.mv,anchor);
 planCameraMovement(game,[enemy],target,1.1,memory,{peek:true});
 assert.equal(memory.coverReadyAt,1.1);
 const oldSeed=memory.cycleState.seed;
 const other={...target,id:'new-target'};
 planCameraMovement(game,[enemy],other,1.2,memory,{peek:true});
 assert.notEqual(memory.coverReadyAt,1.1,'new target must not inherit the previous timer');
 assert.notEqual(memory.cycleState.seed,oldSeed,'new target starts a new peek cycle');
 planCameraMovement(game,[enemy],other,1.3,memory,{peek:false,reloading:true});
 assert.equal(memory.reloadCover,true);
});
test('open map cannot manufacture a hard cover arrival',()=>{
 const {game,memory}=scenario(); game.map={boxes:[],bound:55};
 assert.equal(planCameraMovement(game,[enemy],target,1,memory,{peek:true}),null);
 assert.equal(memory.coverReadyAt,null);
});
