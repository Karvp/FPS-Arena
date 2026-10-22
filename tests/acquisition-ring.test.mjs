import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {gridRoute} from '../navigation-core.mjs';
import {weaponLootState,searchForWeapon,lootSafe,lootCandidates,planLoot,ringSafetyPlan,battleRoyaleRingEscape} from '../loot-core.mjs';
const h={rayWorld:(p,v,boxes,dist)=>dist,eyeHeightOf:()=>1.6};
const opt={autoLoot:false,lootRange:100,zombieSpacing:22};
function game(mode='br'){
  const ws={slot:0,guns:[{id:'fists',mag:0,reserve:0},{id:'fists',mag:0,reserve:0}],finite:true};
  return {running:true,modeState:{type:mode,ring:{cx:0,cz:0,r:60,phase:'wait',next:50,nxt:null}},
    you:{tm:0,ringRate:0},local:{alive:true,mv:{x:0,y:0,z:0},ws,hp:100,plates:0,weapon:WEAPONS.fists},
    map:{bound:80,boxes:[]},loot:{data:{crates:[],items:[]}},zremotes:{list:[]},remotes:{list:[]},bremotes:{list:[]}};
}
test('fists are genuinely unarmed even though the weapon has infinite ammo',()=>{
 const g=game();assert.equal(WEAPONS.fists.infinite,true);
 assert.equal(weaponLootState(g,WEAPONS).needsWeapon,true);
 assert.equal(weaponLootState(g,WEAPONS).activeArmed,false);
});
test('active fists switches to a firearm on the other slot without searching',()=>{
 const g=game();g.local.ws.guns[1]={id:'m4a1',mag:30,reserve:0};
 assert.deepEqual(weaponLootState(g,WEAPONS),{needsWeapon:false,needsAmmo:false,activeArmed:false,switchSlot:1});
});
test('melee-only bot searches for ranged weapon instead of pretending to shoot',()=>{
 const g=game();g.local.ws.guns[0].id='knife';g.local.ws.guns[1].id='fists';
 assert.equal(weaponLootState(g,WEAPONS).needsWeapon,true);
});
test('weaponless looting ignores distant enemy pressure and autoLoot opt-out',()=>{
 const g=game();g.loot.data.items=[{id:'rifle',kind:0,wid:'m4a1',rar:2,x:8,y:0,z:0}];
 const threat={hot:true,nearest:24};
 assert.equal(lootSafe(g,threat,opt,WEAPONS),true);
 const plan=planLoot(g,threat,opt,h,WEAPONS,()=>null,{},2);
 assert.equal(plan?.targetId,'item:rifle');assert.equal(plan?.reason,'loot-travel');
});
test('weaponless bot never chases a plate/ammo pickup instead of a gun',()=>{
 const g=game();g.loot.data.items=[{id:'plate',kind:2,x:1,y:0,z:0},
  {id:'ammo',kind:1,wid:'rifle',x:0,y:0,z:2},{id:'gun',kind:0,wid:'g17',x:15,y:0,z:0}];
 const list=lootCandidates(g,opt,WEAPONS,()=>null);
 assert.deepEqual(list.map(x=>x.id),['item:gun']);
});
test('no gun or crate in sight searches deterministic sector instead of strafing',()=>{
 const g=game('zm');let p=searchForWeapon(g,h,{},12);
 assert.equal(p.direction.reason,'weapon-search');
 assert.ok(Math.hypot(p.direction.x,p.direction.z)>1);
 const repeat=searchForWeapon(g,h,{searchSector:p.searchSector,searchUpdated:p.searchUpdated},12.5);
 assert.equal(repeat.searchSector,p.searchSector);
});
test('BR outside current ring immediately prioritises escape, including when unarmed',()=>{
 const g=game();g.local.mv.x=71;
 const p=ringSafetyPlan(g);assert.equal(p.reason,'br-ring-escape');assert.equal(p.urgent,true);
 const dir=battleRoyaleRingEscape(g,h);assert.ok(dir.x<0);
});
test('BR pre-rotates toward announced next circle before it starts shrinking',()=>{
 const g=game();g.local.mv.x=20;
 g.modeState.ring={cx:0,cz:0,r:60,phase:'wait',next:2,nxt:{cx:-12,cz:0,r:14}};
 const p=ringSafetyPlan(g);
 assert.equal(p.reason,'br-next-ring');assert.ok(p.goal.x<0);
});
test('BR stays available for safe loot if current and upcoming circles are safe',()=>{
 const g=game();g.modeState.ring.nxt={cx:0,cz:0,r:25};g.modeState.ring.next=9;
 assert.equal(ringSafetyPlan(g),null);
});
test('BR crossing current boundary suppresses loot, even when gun is right there',()=>{
 const g=game();g.local.mv.x=72;
 g.loot.data.items=[{id:'gun',kind:0,wid:'m4a1',x:73,y:0,z:0}];
 assert.equal(lootSafe(g,{hot:false,nearest:Infinity},opt,WEAPONS),false);
 assert.equal(planLoot(g,{},opt,h,WEAPONS,()=>null),null);
});
test('BR shrinking with center shift advances toward final circle',()=>{
 const g=game();g.local.mv.x=20;
 g.modeState.ring={cx:0,cz:0,r:40,phase:'shrinking',next:13,nxt:{cx:-15,cz:3,r:10}};
 const p=ringSafetyPlan(g);assert.equal(p.reason,'br-next-ring');assert.equal(p.urgent,true);
 assert.ok(Math.hypot(p.goal.x+15,p.goal.z-3)<10);
});
test('BR obstructed direct ingress can use A* around a wall',()=>{
 const boxes=[{x0:-1,x1:1,z0:-9,z1:9,y0:-2,y1:3}];
 const route=gridRoute({bound:26,boxes},{x:12,y:0,z:0},{x:-12,y:0,z:0});
 assert.ok(route && route.length>5);
 assert.ok(route.some(p=>Math.abs(p.z)>9),'route skirts wall');
});
test('BR final shrinking ring moves toward its center, not outside it',()=>{
 const g=game();g.local.mv.x=10;
 g.modeState.ring={cx:0,cz:0,r:12,phase:'closing',next:0,nxt:null};
 const p=ringSafetyPlan(g);assert.ok(p.goal.x<10);
});
