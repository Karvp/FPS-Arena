import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {rayWorld} from './fixtures/game-shared/geometry.js';
import {ammoClassOf} from './fixtures/game-shared/rarity.js';
import {zombieReloadOpportunity,manageResources,arbitrateLootCombat,autoFireInput} from '../combat-core.mjs';
import {rankZombieLoot,planLoot} from '../loot-core.mjs';
import {predictDodge} from '../aim-core.mjs';

const opts={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,autoArmor:false,autoLoot:true,
  weaponTactics:true,reloadQuietSeconds:3.5,lootRange:70,zombieSpacing:22,dodgeRange:60};
const helpers={rayWorld,eyeHeightOf:()=>1.6,leanOffset:.35,player:{headY:1.6}};
const sample={slot:-1,fire:false,aim:false,reload:false,plate:false,use:false};
function zombie(x,z,id=1){return {id,alive:true,pos:{x,y:0,z},data:{hp:100}};}
function game(mode='zm'){
 const ws=makeGunsState([{id:'m4a1',mag:0,reserve:75},{id:'g17',mag:0,reserve:30}],true);
 const local={alive:true,hp:85,armor:0,maxArmor:50,plates:0,mv:{x:0,y:0,z:0,vx:0,vz:0},ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {running:true,phase:'match',net:{id:'self'},local,
  modeState:{type:mode},you:{tm:0},map:{boxes:[],bound:65},pos:{x:0,y:0,z:0},
  rig:{yaw:0,pitch:0},input:{locked:true,enabled:true},zremotes:{list:[]},remotes:{list:[]},
  bremotes:{list:[]},loot:{data:{crates:[],items:[]}}};
}
function ctx(now=50){return {now,catalog:WEAPONS,resourceState:{},memory:{
  risk:{hot:true,nearest:26,visible:1},lastDanger:now,lastDamage:now,lastFire:now}};}
test('zombie waves: empty main magazine can reload despite long continuous visibility/previous shots',()=>{
 const g=game();g.zremotes.list=[zombie(0,-35)];
 const state={};let started=0,done=0;
 for(let tick=0;tick<200;tick++){
  const now=50+tick/60,context=ctx(now);context.resourceState=state;
  const cmd=manageResources(g,sample,opts,null,helpers,context);
  const step=stepWeapons(g.local.ws,cmd,1/60,{alive:true,armor:0,plates:0,maxArmor:50});
  if(step.reloadStarted)started++;if(step.reloadDone)done++;
 }
 assert.equal(started,1);assert.equal(done,1);
 assert.equal(g.local.ws.guns[0].mag,WEAPONS.m4a1.magSize);
});
test('zombie contact inside melee danger: do not reload or start a hopeless primary recovery',()=>{
 const g=game();g.zremotes.list=[zombie(0,-7)];g.local.ws.guns[1].mag=15;
 assert.equal(zombieReloadOpportunity(g,WEAPONS.m4a1,{empty:true}).safe,false);
 let c=manageResources(g,sample,opts,null,helpers,ctx(50));
 assert.equal(c.slot,1);assert.equal(c.reload,false);
 g.local.ws.slot=1;c=manageResources(g,sample,opts,null,helpers,ctx(51));
 assert.notEqual(c.slot,0);assert.equal(c.reload,false);
});
test('zombie reload must not interrupt a live firing tick unless the gun is empty',()=>{
 const g=game();g.zremotes.list=[zombie(0,-40)];g.local.ws.guns[0].mag=5;
 const c=manageResources(g,{...sample,fire:true},opts,null,helpers,ctx(50));
 assert.notEqual(c.reload,true);assert.equal(c.fire,true);
});
test('safe loot route favors reachable nearby crate over dead end behind long wall',()=>{
 const g=game();g.local.ws.guns[0].mag=22;g.zremotes.list=[zombie(0,-37)];
 g.map.boxes=[{x0:-2,x1:2,z0:-10,z1:-1,y0:0,y1:3}];
 g.loot.data.crates=[{id:1,x:0,y:0,z:-12,rar:0,open:false},
                     {id:2,x:7,y:0,z:0,rar:0,open:false}];
 const prev={};const plan=planLoot(g,{hot:true,nearest:37},opts,helpers,WEAPONS,ammoClassOf,prev,12);
 assert.ok(plan);assert.equal(plan.targetId,'crate:2');assert.ok(plan.route?.length);
 assert.equal(prev.routeCache?.id,'crate:2');
});
test('crate route cache invalidates if zombies suddenly occupy the corridor',()=>{
 const g=game();g.local.ws.guns[0].mag=22;
 const candidates=[{id:'crate:a',score:80,distance:12,point:{x:12,y:0,z:0}},
                   {id:'crate:b',score:76,distance:13,point:{x:0,y:0,z:13}}];
 const p={};const first=rankZombieLoot(g,candidates,p,2);
 assert.equal(first.id,'crate:a');p.routeCache={id:first.id,time:2,path:first.route,cost:first.routeCost};
 g.zremotes.list=[zombie(7,0)];
 const later=rankZombieLoot(g,candidates,p,2.1);
 assert.equal(later?.id,'crate:b');
});
test('moving to a crate cannot silence visible target fire; only pressing F pauses it',()=>{
 const g=game();g.local.ws.guns[0].mag=10;g.zremotes.list=[zombie(0,-20)];
 const target={id:'z:1',point:{x:0,y:1.6,z:-20},yaw:0,pitch:0,visible:true};
 const shot=autoFireInput(g,sample,target,helpers,opts);
 assert.equal(shot.fire,true);
 const travel=arbitrateLootCombat(shot,{direction:{x:1,z:0},interact:false,reason:'loot-travel'},
  {autonomous:true,shootable:true});
 assert.equal(travel.fire,true);
 const actual=stepWeapons(g.local.ws,travel,1/60,{alive:true,armor:0,plates:0,maxArmor:50});
 assert.equal(actual.fired,true);
 const use=arbitrateLootCombat(shot,{interact:true,use:true,reason:'loot-interact'},
  {autonomous:true,shootable:true});
 assert.equal(use.fire,false);assert.equal(use.aim,false);
});
test('evade checks wall corners and chooses an alternate lateral escape',()=>{
 const g=game('tdm');g.local.ws.guns[0].mag=10;
 g.remotes.list=[{id:'attacker',alive:true,team:1,yaw:Math.PI,pos:{x:0,y:0,z:-12},
   data:{aim:1,pitch:0}}];
 g.map.boxes=[{x0:1,x1:4,z0:-5,z1:5,y0:0,y1:3}];
 const direction=predictDodge(g,[],helpers,opts,null,0);
 assert.ok(direction);assert.ok(direction.x<0,JSON.stringify(direction));
});
test('opposing aimed threats cannot cancel all dodge movement',()=>{
 const g=game('tdm');g.remotes.list=[
  {id:1,alive:true,team:1,yaw:Math.PI,pos:{x:0,y:0,z:-12},data:{aim:1,pitch:0}},
  {id:2,alive:true,team:1,yaw:0,pos:{x:0,y:0,z:12},data:{aim:1,pitch:0}}];
 const dir=predictDodge(g,[],helpers,opts,null,0);
 assert.ok(dir);assert.ok(Number.isFinite(dir.x));
});

test('zombie route to crate detours around a wall in real stepMove simulation',async()=>{
 const {newMoveState,stepMove}=await import('./fixtures/game-shared/movement.js');
 const {DT}=await import('./fixtures/game-shared/constants.js');
 const {movementFromWorld}=await import('../combat-core.mjs');
 const g=game();g.local.ws.guns[0].mag=23;
 g.local.mv=newMoveState();g.map.bound=40;
 g.map.boxes=[{x0:-1.8,x1:1.8,z0:-11,z1:-2,y0:0,y1:3}];
 g.zremotes.list=[zombie(0,-35)];
 g.loot.data.crates=[{id:25,x:0,y:0,z:-14,rar:2,open:false}];
 const prev={},target={x:0,z:-14};let waypoints=[],finalPlan=null;
 for(let i=0;i<720;i++){
  const now=i*DT;
  const plan=planLoot(g,{hot:true,nearest:35},opts,helpers,WEAPONS,ammoClassOf,prev,now);
  assert.ok(plan);
  if(!waypoints.length && plan.route?.length)waypoints=[...plan.route];
  while(waypoints.length && Math.hypot(waypoints[0].x-g.local.mv.x,waypoints[0].z-g.local.mv.z)<1.25)waypoints.shift();
  const wp=waypoints[0]||target;
  const dx=wp.x-g.local.mv.x,dz=wp.z-g.local.mv.z;
  if(Math.hypot(dx,dz)<.3){finalPlan=plan;break;}
  const inp=movementFromWorld({x:dx,z:dz},0,{forward:false,backward:false,left:false,right:false,
   slot:-1,crouch:false,aim:false,fire:false});
  stepMove(g.local.mv,{...inp,yaw:0,pitch:0},DT,1,g.map);
  if(plan.interact){finalPlan=plan;break;}
 }
 assert.ok(Math.hypot(g.local.mv.x,target.x,g.local.mv.z-target.z), 'finite position');
 assert.ok(Math.hypot(g.local.mv.x-target.x,g.local.mv.z-target.z)<2.5,
   `must navigate around wall to crate; stopped at ${g.local.mv.x}, ${g.local.mv.z}`);
 assert.equal(finalPlan?.interact,true);
});
