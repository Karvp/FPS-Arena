import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {manageResources} from '../combat-core.mjs';
import {gridRoute,zombieMotionContacts,zombieInterceptRisk} from '../navigation-core.mjs';
import {rankZombieLoot,planLoot} from '../loot-core.mjs';
import {ammoClassOf} from './fixtures/game-shared/rarity.js';
const opts={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,autoArmor:false,autoLoot:true,lootRange:65,sidearmEmergencyRange:10};
const helpers={rayWorld:(_o,_d,_b,l)=>l,eyeHeightOf:()=>1.6,leanOffset:.35};
const emptyInput={slot:-1,fire:true,aim:true,reload:false,plate:false};
const near=(d,now)=>({risk:{hot:true,nearest:d,visible:1,close:d<42,aiming:1},lastDamage:now,lastFire:now,lastDanger:now});
function game(mode='tdm',primary='l115a3',secondary='g17',finite=false){
 const ws=makeGunsState([{id:primary,mag:0,reserve:100},{id:secondary,mag:WEAPONS[secondary].magSize,reserve:70}],finite);
 const local={alive:true,hp:100,armor:50,plates:0,maxArmor:50,frozen:false,mv:{x:0,y:0,z:0,vx:0,vz:0,onGround:true},ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {running:true,phase:'match',modeState:{type:mode},local,map:{bound:42,boxes:[]},you:{tm:0},pos:{x:0,y:0,z:0},
  input:{locked:true,enabled:true},zremotes:{list:[]},remotes:{list:[]},bremotes:{list:[]},loot:{data:{crates:[],items:[]}}};
}
function tick(g,d,now,state={}){
 const target=Number.isFinite(d)?{id:'enemy',point:{x:0,y:1.6,z:-d},visible:true}:null;
 const cmd=manageResources(g,emptyInput,opts,target,helpers,{now,memory:near(d,now),resourceState:state,catalog:WEAPONS});
 const step=stepWeapons(g.local.ws,cmd,1/60,{alive:true,armor:50,maxArmor:50,plates:0});
 return {cmd,step};
}
test('sniper reloads primary within first tick against distant firing opponent',()=>{
 const g=game(), result=tick(g,85,1,{});
 assert.equal(result.cmd.slot,-1);assert.equal(result.cmd.reload,true);
 assert.equal(result.cmd.fire,false);assert.equal(result.step.reloadStarted,true);
});
test('close enemy permits sidearm emergency; recovery begins immediately when danger retreats',()=>{
 const g=game(),state={};
 const first=tick(g,5,1,state);
 assert.equal(first.cmd.slot,1);assert.equal(first.step.switched,true);
 let gotPrimary=false,started=false,done=false;
 for(let n=0;n<360;n++){
  const r=tick(g,60,1+(n+1)/60,state);
  gotPrimary||=r.step.switched&&g.local.ws.slot===0;
  started||=r.step.reloadStarted;done||=r.step.reloadDone;
 }
 assert.equal(gotPrimary,true);assert.equal(started,true);assert.equal(done,true);
 assert.equal(g.local.ws.slot,0);assert.ok(g.local.ws.guns[0].mag>=1,'primary reloaded and continued firing');
});
test('no reserve means reload cannot start in finite-ammo Zombies',()=>{
 const g=game('zm','m4a1','g17',true);g.local.ws.guns[0].reserve=0;
 const r=tick(g,35,1,{});assert.equal(r.cmd.reload,false);assert.equal(r.step.reloadStarted,false);
});
test('filled rifle never switches to sidearm for maintenance',()=>{
 const g=game('tdm','m4a1');g.local.ws.guns[0].mag=WEAPONS.m4a1.magSize;
 g.local.ws.guns[1].mag=0;
 for(let i=0;i<240;i++){const r=tick(g,Infinity,10+i/60,{});assert.equal(r.step.switched,false);}
 assert.equal(g.local.ws.slot,0);
});
test('moving pincer zombies cause risk-weighted A* to avoid imminent crossing',()=>{
 const map={bound:42,boxes:[]},start={x:0,y:0,z:0},goal={x:0,y:0,z:-27};
 const zombies=[{x:-5,z:-9,vx:4,vz:0},{x:5,z:-9,vx:-4,vz:0}];
 const fast=gridRoute(map,start,goal,{maxExpanded:4600});
 const safe=gridRoute(map,start,goal,{maxExpanded:4600,zombieContacts:zombies,zombieRiskWeight:.20,speed:6.3});
 assert.ok(fast?.length && safe?.length);
 function stats(path){let meters=0,prev=start,peak=0;for(const p of path){meters+=Math.hypot(p.x-prev.x,p.z-prev.z);peak=Math.max(peak,zombieInterceptRisk(p,zombies,meters/6.3));prev=p;}return {meters,peak};}
 assert.ok(stats(safe).peak < stats(fast).peak*.35,JSON.stringify({safe:stats(safe),fast:stats(fast)}));
 assert.ok(stats(safe).meters<65,'must still reach crate without an excessively long loop');
});
test('zombie velocity is reconstructed from buffered snapshots and capped at game speed',()=>{
 const out=zombieMotionContacts([{alive:true,pos:{x:4,z:5},buf:[{t:1,x:0,z:5},{t:2,x:5,z:5}]}]);
 assert.equal(out.length,1);assert.ok(out[0].vx>4.9&&out[0].vx<5.1);
 const clipped=zombieMotionContacts([{alive:true,pos:{x:0,z:0},vx:100,vz:100}]);
 assert.ok(Math.hypot(clipped[0].vx,clipped[0].vz)<=7.251);
});
test('pincer route to crate remains available and prioritizes reachable supply',()=>{
 const g=game('zm','m4a1','g17',true);g.local.ws.guns[0].mag=5;
 g.zremotes.list=[
  {alive:true,pos:{x:-5,y:0,z:-9},vx:4,vz:0},
  {alive:true,pos:{x:5,y:0,z:-9},vx:-4,vz:0}
 ];
 g.loot.data.crates=[{id:'pincer',x:0,y:0,z:-27,rar:4,open:false}];
 const prev={};const planned=planLoot(g,{hot:true,nearest:8},opts,helpers,WEAPONS,ammoClassOf,prev,10);
 assert.ok(planned?.route?.length,JSON.stringify(planned));
 assert.equal(planned.targetId,'crate:pincer');
 assert.ok(planned.route[0].x!==1 || planned.route[0].z!==-1,'first waypoint must deviate from naïve danger corridor');
});
test('stale cached loot route is invalidated once a pincer cuts across its next steps',()=>{
 const g=game('zm','m4a1','g17',true);g.local.ws.guns[0].mag=20;
 const choices=[{id:'crate:p',point:{x:0,y:0,z:-27},score:120,distance:27}];
 const first=rankZombieLoot(g,choices,{},2);
 assert.ok(first?.route?.length);
 const memo={routeCache:{id:'crate:p',path:first.route,time:2,cost:first.routeCost}};
 g.zremotes.list=[{alive:true,pos:{x:0,y:0,z:-4},vx:0,vz:0}];
 const second=rankZombieLoot(g,choices,memo,2.15);
 assert.ok(second?.route?.length);
 assert.notDeepEqual(second.route,first.route,'do not blindly follow corridor after fast pincer');
});
test('loot route cache expires instead of recycling an old origin forever',()=>{
 const g=game('zm','m4a1','g17',true);g.local.ws.guns[0].mag=20;
 g.loot.data.crates=[{id:12,x:0,y:0,z:-20,rar:2,open:false}];
 const history={};
 const first=planLoot(g,{hot:false,nearest:Infinity},opts,helpers,WEAPONS,ammoClassOf,history,10);
 assert.ok(first?.route?.length);assert.equal(history.routeCache.time,10);
 const shortly=planLoot(g,{hot:false,nearest:Infinity},opts,helpers,WEAPONS,ammoClassOf,history,10.3);
 assert.ok(shortly?.route?.length);assert.equal(history.routeCache.time,10);
 const refreshed=planLoot(g,{hot:false,nearest:Infinity},opts,helpers,WEAPONS,ammoClassOf,history,10.9);
 assert.ok(refreshed?.route?.length);assert.equal(history.routeCache.time,10.9);
});
test('goal-biased zombie breakout preserves emergency escape while approaching crate flank',async()=>{
 const {findZombieEscapeRoute}=await import('../zombie-nav.mjs');
 const start={x:0,y:0,z:0},map={bound:35,boxes:[]},contacts=[{x:-3,z:-9},{x:3,z:-9}];
 const loot={x:20,z:2};
 const baseline=findZombieEscapeRoute(map,start,contacts),guided=findZombieEscapeRoute(map,start,contacts,{goal:loot});
 assert.ok(baseline?.goal && guided?.goal);
 assert.ok(Math.hypot(guided.goal.x-loot.x,guided.goal.z-loot.z) <
   Math.hypot(baseline.goal.x-loot.x,baseline.goal.z-loot.z));
 assert.ok(guided.path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});
