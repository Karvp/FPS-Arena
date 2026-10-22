import test from 'node:test';
import assert from 'node:assert/strict';
import {planCameraMovement,cameraOccluded} from '../camera-tactics.mjs';

const wall={x0:-.8,x1:.8,y0:0,y1:4,z0:6,z1:8};
const threat={id:'enemy',x:0,y:0,z:14,yaw:0,pitch:0,aim:true};
const selected={id:'enemy',visible:false,point:{x:0,y:1.3,z:14}};
const world=()=>({local:{mv:{x:3,y:0,z:-3}},map:{boxes:[wall],bound:55}});

test('cover goal stays fixed beyond normal replan cadence while route distance improves',()=>{
  const game=world(),mem={};
  const first=planCameraMovement(game,[threat],selected,1,mem,{peek:true,reloading:true});
  assert.equal(first.phase,'reload');
  const goal={...mem.cover.point};
  assert.equal(cameraOccluded(game.map,{x:threat.x,y:1.5,z:threat.z},{...goal,y:goal.y+1.3}),true);
  const distances=[];
  for(const [t,alpha] of [[2.25,.15],[2.55,.31],[2.85,.46],[3.15,.6]]){
    game.local.mv.x=3+(goal.x-3)*alpha;
    game.local.mv.z=-3+(goal.z+3)*alpha;
    distances.push(Math.hypot(goal.x-game.local.mv.x,goal.z-game.local.mv.z));
    const result=planCameraMovement(game,[threat],selected,t,mem,{peek:true,reloading:true});
    assert.equal(result.phase,'reload');
    assert.equal(mem.updated,1,'progress should prevent costly anchor reselection');
    assert.deepEqual(mem.cover.point,goal);
  }
  assert.ok(distances.every((d,i)=>i===0||d<distances[i-1]));
});

test('back-and-forth physical motion that never beats best remaining distance triggers replan',()=>{
  const game=world(),mem={};
  planCameraMovement(game,[threat],selected,1,mem,{peek:true,reloading:true});
  game.local.mv.z=-2;
  planCameraMovement(game,[threat],selected,2.25,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,1);
  game.local.mv.z=-3;
  planCameraMovement(game,[threat],selected,2.7,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,1);
  game.local.mv.z=-2;
  planCameraMovement(game,[threat],selected,3.65,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,3.65,'returning to a previous location is not progress');
});

test('new target and new shooter invalidate movement commitment immediately',()=>{
  const game=world(),mem={};
  planCameraMovement(game,[threat],selected,1,mem,{peek:true,reloading:true});
  game.local.mv.z=-2;
  planCameraMovement(game,[threat],selected,2.25,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,1);
  const extra={...threat,id:'flanker',x:4};
  planCameraMovement(game,[threat,extra],selected,2.3,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,2.3);
  planCameraMovement(game,[threat,extra],{...selected,id:'new-goal'},2.35,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,2.35);
});

test('cover removed from world cannot be treated as a valid old waypoint',()=>{
  const game=world(),mem={};
  planCameraMovement(game,[threat],selected,1,mem,{peek:true,reloading:true});
  game.local.mv.z=-2;
  planCameraMovement(game,[threat],selected,2.25,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,1);
  game.map={boxes:[],bound:55};
  assert.equal(planCameraMovement(game,[threat],selected,2.3,mem,{peek:true}),null);
  assert.equal(mem.updated,2.3);
});

test('cover commitment never suppresses peek when exposure already started',()=>{
  const game=world(),mem={};
  planCameraMovement(game,[threat],selected,1,mem,{peek:true,reloading:true});
  mem.cycleState={phase:'expose',until:4,seed:4,selected:{sign:1,point:{x:3,y:0,z:0}},exposureStarted:null};
  game.local.mv.z=-2;
  planCameraMovement(game,[threat],selected,2.3,mem,{peek:true,reloading:true});
  assert.equal(mem.updated,2.3,'active shooting lanes retain original replan cadence');
});

test('visible-target combat never inherits a cover-waypoint commitment',()=>{
  const game=world(),mem={};
  const visible={...selected,visible:true};
  planCameraMovement(game,[threat],visible,1,mem,{peek:true});
  game.local.mv.z=-2;
  planCameraMovement(game,[threat],visible,2.3,mem,{peek:true});
  assert.equal(mem.updated,2.3);
});

test('a safely hidden bot holds position instead of oscillating around a sub-meter waypoint',()=>{
 const game=world(), mem={};
 planCameraMovement(game,[threat],selected,1,mem,{peek:true});
 const anchor=mem.cover.point; Object.assign(game.local.mv,anchor);
 mem.cycleState={phase:'hidden',until:15,seed:17,cycle:2};
 const plan=planCameraMovement(game,[threat],selected,1.1,mem,{peek:true});
 assert.equal(plan.direction.reason,'camera-hide-hold');
 assert.equal(plan.direction.x,0);assert.equal(plan.direction.z,0);
 assert.equal(plan.holdFire,true);
});
