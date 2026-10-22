import test from 'node:test';
import assert from 'node:assert/strict';
import {findZombieEscapeRoute,planZombieEscape} from '../zombie-nav.mjs';
import {movementFromWorld,safeDirection} from '../combat-core.mjs';
import {newMoveState,stepMove} from './fixtures/game-shared/movement.js';
import {rayWorld} from './fixtures/game-shared/geometry.js';
import {DT} from './fixtures/game-shared/constants.js';
const helpers={rayWorld,eyeHeightOf:()=>1.6};
const opt={zombieSpacing:22,pathfinding:false}; // Zombie escape must work even if optional combat pathfinding is off.
const zombie=(x,z,id=1)=>({id,alive:true,pos:{x,y:0,z}});
const wall=(x0,x1,z0,z1)=>({x0,x1,z0,z1,y0:0,y1:2.8});
function g(start,boxes=[],bound=26,zombies=[zombie(7,7)]){
 const mv=newMoveState();mv.x=start.x;mv.z=start.z;
 return {modeState:{type:'zm'},local:{alive:true,ws:{reloading:false},mv},
  map:{bound,boxes},zremotes:{list:zombies}};
}
const sample={slot:-1,forward:false,backward:false,left:false,right:false,jump:false,
 crouch:false,slide:false,prone:false,lean:0,fire:false,aim:false,reload:false,plate:false,use:false};
function run(gm,sec=3.5,memory={}){
 let initial={...gm.local.mv}, moves=0,blocked=0,last=null;
 for(let i=0;i<sec/DT;i++){
  const cmd=planZombieEscape(gm,helpers,opt,i*DT,memory);
  if(cmd && Math.hypot(cmd.x,cmd.z)>.01){
    const can=safeDirection(gm,cmd.x,cmd.z,helpers,Math.min(.9,Math.hypot(cmd.x,cmd.z)));
    if(!can)blocked++;
    last=cmd;
    const inp=movementFromWorld(cmd,0,{...sample});
    stepMove(gm.local.mv,{...inp,yaw:0,pitch:0},DT,1,gm.map);
    moves++;
  }
 }
 return {initial,moves,blocked,last,pos:gm.local.mv,mem:memory};
}
test('a physical wall corner cannot deadlock zombie escape; stepMove moves around the corner',()=>{
 const walls=[wall(-2,-1.2,-12,9),wall(-12,9,-2,-1.2)];
 const gm=g({x:0,z:0},walls,26,[zombie(8,8)]);
 const naiveAway={x:-8,z:-8};assert.equal(safeDirection(gm,naiveAway.x,naiveAway.z,helpers,1.8),false);
 const first=planZombieEscape(gm,helpers,opt,0,{});
 assert.equal(first.reason,'zombie-kite');assert.ok(Math.hypot(first.x,first.z)>.1);
 assert.equal(safeDirection(gm,first.x,first.z,helpers,.95),true);
 const result=run(gm,5);
 assert.ok(result.moves>100);
 assert.ok(Math.hypot(result.pos.x,result.pos.z)>8,`escaped actual position ${result.pos.x},${result.pos.z}`);
 assert.ok(Math.hypot(result.pos.x-8,result.pos.z-8)>Math.hypot(8,8)-1);
 assert.ok(result.blocked<3,'should not continuously order movement through a wall');
});
test('boundary corner: never push outward across map bounds when zombies approach diagonally',()=>{
 const gm=g({x:24,z:24},[],26,[zombie(19,19)]),memo={};
 const first=planZombieEscape(gm,helpers,opt,0,memo);
 assert.ok(first);assert.equal(first.reason,'zombie-kite');
 assert.equal(safeDirection(gm,first.x,first.z,helpers,.9),true);
 const result=run(gm,4.6,memo);
 assert.ok(result.moves>80);
 assert.ok(Math.abs(result.pos.x)<=25.6 && Math.abs(result.pos.z)<=25.6);
 assert.ok(Math.hypot(result.pos.x-19,result.pos.z-19)>6.5,
  `needs actual separation, got ${JSON.stringify({x:result.pos.x,z:result.pos.z})}`);
});
test('dynamic wave: 65 zombies produce a finite, bounded route with no random thrashing',()=>{
 const zs=Array.from({length:65},(_,i)=>zombie(Math.cos(i*.45)*(.5+i%5)+9,Math.sin(i*.4)*(.5+i%9)+7,i));
 const gm=g({x:0,z:0},[wall(-6,-4,-8,8),wall(4,6,-8,8)],38,zs);
 const route=findZombieEscapeRoute(gm.map,gm.local.mv,zs.map(z=>z.pos));
 assert.ok(route?.path?.length>1);assert.ok(route.expanded<=2600);
 const state={};const a=planZombieEscape(gm,helpers,opt,2,state);
 const b=planZombieEscape(gm,helpers,opt,2+DT,state);
 assert.ok(a&&b);assert.equal(state.time,2,'keep existing route for small tick delta');
});
test('fully sealed room makes the planner fail safely without NaN or indefinite path cache',()=>{
 const walls=[wall(-4,-3,-5,5),wall(3,4,-5,5),wall(-5,5,-4,-3),wall(-5,5,3,4)];
 const gm=g({x:0,z:0},walls,20,[zombie(1,1)]);
 const state={};const a=planZombieEscape(gm,helpers,opt,0,state);
 assert.ok(a===null||Number.isFinite(a.x)&&Number.isFinite(a.z));
 const b=planZombieEscape(gm,helpers,opt,.3,state);
 assert.ok(b===null||Number.isFinite(b.x)&&Number.isFinite(b.z));
});

test('no-route search results are throttled instead of searching every input tick',()=>{
 const walls=[wall(-4,-3,-5,5),wall(3,4,-5,5),wall(-5,5,-4,-3),wall(-5,5,3,4)];
 const gm=g({x:0,z:0},walls,20,[zombie(1,1)]),state={};
 planZombieEscape(gm,helpers,opt,5,state);
 const firstTime=state.time;
 for(let n=1;n<=16;n++)planZombieEscape(gm,helpers,opt,5+n/60,state);
 assert.equal(state.time,firstTime,'no repeated 60Hz route solve for a truly sealed arena');
});

test('moving enemy wave invalidates a safe cached route when threat distance changes significantly',()=>{
 const gm=g({x:0,z:0},[],40,[zombie(0,-8)]),state={};
 planZombieEscape(gm,helpers,opt,1,state);
 assert.equal(state.time,1);
 gm.zremotes.list=[zombie(0,-2)];
 planZombieEscape(gm,helpers,opt,1.1,state);
 assert.equal(state.time,1.1);
});
