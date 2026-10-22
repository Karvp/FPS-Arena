import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {assessThreats,updateCombatMemory,manageResources,planProMovement} from '../combat-core.mjs';
import {nearestZombie,zombieKite,battleRoyaleRingEscape,lootSafe,lootCandidates,planLoot} from '../loot-core.mjs';
import {findUseTarget} from './fixtures/game-shared/loot.js';
import {ammoClassOf,rarityOf} from './fixtures/game-shared/rarity.js';
const h={eyeHeightOf:()=>1.6,rayWorld:(o,d,b,dist)=>dist,leanOffset:.35};
const opt={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,autoArmor:true,autoLoot:true,lootRange:60,zombieSpacing:22,reloadQuietSeconds:3.5,weaponTactics:true};
function make(mode='br'){
 const ws=makeGunsState([{id:'m4a1',mag:32,reserve:20},{id:'g17',mag:17,reserve:0}],true);
 const local={alive:true,hp:100,armor:20,maxArmor:50,plates:1,energy:5,thr:{n:0},mv:{x:0,y:0,z:0,onGround:true,stance:0},ws};
 Object.defineProperty(local,'weapon',{get:()=>WEAPONS[ws.guns[ws.slot].id]});
 return {running:true,phase:'match',local,modeState:{type:mode,ring:{cx:0,cz:0,r:90}},loot:{data:{crates:[],items:[]}},you:{tm:0,kits:0,ringRate:0},net:{id:'me'},pos:{x:0,y:0,z:0},input:{locked:true,enabled:true},rig:{yaw:0,pitch:0},map:{bound:90,boxes:[]},zremotes:{list:[]},remotes:{list:[]},bremotes:{list:[]}};
}
const z=(id,x,z)=>({id,alive:true,pos:{x,y:0,z},data:{hp:80}});
const hostile=(z)=>({id:'enemy',alive:true,pos:{x:0,y:0,z},team:1,data:{aim:1}});
const makeCtx=(now=30,risk={hot:false,nearest:Infinity})=>({now,memory:{lastDanger:0,lastDamage:0,lastFire:0,risk}});
const aim=(distance)=>({id:'p:enemy',point:{x:0,y:1.6,z:-distance},yaw:0,pitch:0});
test('Combat with an EMPTY magazine uses explicit reload, never accidental dry-fire edge',()=>{
 const g=make();g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=0;
 g.remotes.list=[hostile(-16)];
 const m=updateCombatMemory(g,{fire:true},3,h,aim(16),{});
 const cmd=manageResources(g,{fire:true,reload:false,slot:-1},opt,aim(16),h,{now:3,memory:m});
 assert.equal(cmd.fire,false);assert.equal(cmd.reload,true);
 const r=stepWeapons(g.local.ws,cmd,1/60,{alive:true,armor:20,plates:1,maxArmor:50});
 assert.equal(r.reloadStarted,true);assert.equal(r.dryFire,false);
});
test('Distant combat immediately reloads primary without requiring a quiet window',()=>{
 const g=make(),target=aim(55);g.local.ws.guns[0].mag=0;
 g.remotes.list=[hostile(-55)];
 let m=updateCombatMemory(g,{},2,h,target,{});
 let cmd=manageResources(g,{fire:false,reload:false,slot:-1},opt,target,h,{now:2,memory:m});
 assert.equal(cmd.slot,-1);assert.equal(cmd.reload,true);
 g.local.ws.guns[1].mag=0;g.remotes.list=[];
 m=updateCombatMemory(g,{},4,h,null,m);
 cmd=manageResources(g,{fire:false,reload:false,slot:-1},opt,null,h,{now:4,memory:m});
 assert.equal(cmd.reload,true);
 m=updateCombatMemory(g,{},6.2,h,null,m);
 cmd=manageResources(g,{fire:false,reload:false,slot:-1},opt,null,h,{now:6.2,memory:m});
 assert.equal(cmd.reload,true);
});
test('Recent fire and damage each restart quiet timer',()=>{
 const g=make();g.local.ws.guns[0].mag=3;
 let m=updateCombatMemory(g,{fire:true},5,h,null,{});
 let cmd=manageResources(g,{fire:false,slot:-1},opt,null,h,{now:7,memory:m});
 assert.notEqual(cmd.reload,true);
 g.local.hp=80;m=updateCombatMemory(g,{},9,h,null,m);
 cmd=manageResources(g,{fire:false,slot:-1},opt,null,h,{now:11,memory:m});
 assert.notEqual(cmd.reload,true);
 m=updateCombatMemory(g,{},13.2,h,null,m);
 cmd=manageResources(g,{fire:false,slot:-1},opt,null,h,{now:13.2,memory:m});
 assert.equal(cmd.reload,true);
});
test('A reload already underway can be cancelled with loaded sidearm when ambushed',()=>{
 const g=make();g.local.ws.reloading=true;g.local.ws.reloadT=2;
 g.remotes.list=[hostile(-10)];
 const cmd=manageResources(g,{fire:false,reload:false,slot:-1},opt,aim(10),h,makeCtx(7,{hot:true,nearest:10}));
 assert.equal(cmd.slot,1);
 const r=stepWeapons(g.local.ws,cmd,1/60,{alive:true,armor:20,plates:1,maxArmor:50});
 assert.equal(r.switched,true);assert.equal(g.local.ws.reloading,false);
});
test('Zombie kiting works toward empty space and dominates weapon profile',()=>{
 const g=make('zm');g.zremotes.list=[z('a',0,-8)];
 let proposal=zombieKite(g,h,opt,1);
 assert.equal(proposal.reason,'zombie-kite');assert.ok(proposal.z>0);
 const planned=planProMovement(g,{id:'z:a',point:{x:0,y:1.5,z:-8}},h,opt,1);
 assert.equal(planned.reason,'zombie-kite');assert.ok(planned.z>0);
 g.zremotes.list=[z('a',0,-50)];assert.equal(zombieKite(g,h,opt,1),null);
});
test('Zombie escape avoids backing into second zombie',()=>{
 const g=make('zm');g.zremotes.list=[z('a',0,-8),z('b',0,3)];
 const result=zombieKite(g,h,opt,1);
 assert.equal(result.reason,'zombie-kite');assert.ok(Number.isFinite(result.x));
});
test('Loot is suppressed by near zombies, visible BR opponents and BR gas',()=>{
 const g=make('zm');g.loot.data.items=[{id:1,kind:2,x:0,y:0,z:8,rar:0}];
 assert.equal(lootSafe(g,{hot:false,nearest:Infinity},opt),true);
 g.zremotes.list=[z('a',0,-6)];assert.equal(lootSafe(g,{hot:false,nearest:Infinity},opt),false);
 g.zremotes.list=[z('a',0,-18)];assert.equal(lootSafe(g,{hot:false,nearest:Infinity},opt),true);
 g.modeState.type='br';g.zremotes.list=[];
 assert.equal(lootSafe(g,{hot:true,nearest:75},opt),true,'distant threats do not forbid all BR loot');
 assert.equal(lootSafe(g,{hot:true,nearest:15,visible:1,aiming:1},opt),false);
 g.you.ringRate=5;assert.equal(lootSafe(g,{hot:false,nearest:Infinity},opt),false);
});
test('BR zone filtering, item type priority, and distance bounds',()=>{
 const g=make('br');g.modeState.ring={cx:0,cz:0,r:25};
 g.local.plates=0;
 g.loot.data.items=[{id:1,kind:2,x:0,y:0,z:5},{id:2,kind:2,x:0,y:0,z:40},
  {id:3,kind:1,wid:'light',x:1,y:0,z:7,amt:20}];
 const items=lootCandidates(g,opt,WEAPONS,ammoClassOf);
 assert.equal(items.some(x=>x.entity.id===2),false);
 assert.ok(items.some(x=>x.entity.id===3));
 assert.equal(items[0].entity.id,3,'needed ammo scores ahead of plate with the current pool');
});
test('Loot crate opens with server-compatible yaw/pitch and pulsed F use',()=>{
 const g=make('br');g.loot.data.crates=[{id:11,x:1,y:0,z:-1.7,rar:3,open:false}];
 const goal=planLoot(g,{hot:false,nearest:Infinity},opt,h,WEAPONS,ammoClassOf,{},10);
 assert.equal(goal.reason,'loot-interact');assert.equal(goal.use,true);
 const official=findUseTarget(g.loot.data.crates,[],0,1.6,0,goal.yaw,goal.pitch);
 assert.deepEqual({type:official?.type,id:official?.id},{type:'crate',id:11});
 const noRepeat=planLoot(g,{hot:false,nearest:Infinity},opt,h,WEAPONS,ammoClassOf,{targetId:goal.targetId,lastUse:10},10.1);
 assert.equal(noRepeat.use,false);
 const next=planLoot(g,{hot:false,nearest:Infinity},opt,h,WEAPONS,ammoClassOf,{targetId:goal.targetId,lastUse:10},10.7);
 assert.equal(next.use,true);
});
test('Walk-over ammo/armor pickups never press F, gun pickups must use F',()=>{
 const g=make();g.local.plates=0;
 g.loot.data.items=[{id:3,kind:2,x:0,y:0,z:-1.1,rar:0}];
 const plate=planLoot(g,{hot:false,nearest:Infinity},opt,h,WEAPONS,ammoClassOf,{},2);
 assert.equal(plate.interact,false);assert.equal(plate.direction,null);
 g.local.ws.slot=1; // server replaces the EQUIPPED gun: preserve slot-0 rifle
 g.loot.data.items=[{id:4,kind:0,wid:'fn_scar',x:0,y:0,z:-1.3,rar:4}];
 const gun=planLoot(g,{hot:false,nearest:Infinity},opt,h,WEAPONS,ammoClassOf,{},2);
 assert.equal(gun.interact,true);assert.equal(gun.use,true);
});
test('BR controller moves inward before looting if ring is closing around player',()=>{
 const g=make('br');g.modeState.ring={cx:0,cz:0,r:28};g.local.mv.x=24;
 const proposal=battleRoyaleRingEscape(g,h);
 assert.equal(proposal.reason,'br-ring-escape');assert.ok(proposal.x<0);
 g.local.mv.x=4;assert.equal(battleRoyaleRingEscape(g,h),null);
});
test('Zombie-contested loot is rejected instead of approaching a crate guarded by the horde',()=>{
 const g=make('zm');g.loot.data.crates=[{id:8,x:0,y:0,z:-25,rar:4,open:false}];
 g.zremotes.list=[z('danger',0,-24)];
 assert.equal(lootCandidates(g,opt,WEAPONS,ammoClassOf).length,0);
});
test('Current weapon rarity prevents needless replacement by inferior ground gun',()=>{
 const g=make('zm');g.local.ws.guns[0].id='l115a3';g.local.ws.guns[1].id='m4a1';
 const catalog=Object.fromEntries(Object.entries(WEAPONS).map(([id,w])=>[id,{...w,rarity:rarityOf(id)}]));
 g.loot.data.items=[{id:9,kind:0,wid:'g17',x:0,y:0,z:-2,rar:0}];
 assert.equal(lootCandidates(g,opt,catalog,ammoClassOf).length,0);
});
test('Looting is off in non-loot modes and opt-out respected',()=>{
 const g=make('tdm');g.loot.data.crates=[{id:1,x:0,y:0,z:-2,rar:3}];
 assert.equal(planLoot(g,{hot:false,nearest:Infinity},opt,h,WEAPONS,ammoClassOf),null);
 g.modeState.type='zm';assert.equal(planLoot(g,{hot:false,nearest:Infinity},{...opt,autoLoot:false},h,WEAPONS,ammoClassOf),null);
});
