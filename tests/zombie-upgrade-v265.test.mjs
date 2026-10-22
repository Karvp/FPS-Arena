import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {zombieWeaponScore,preferredZombieSlot,zombiePickupDecision} from '../zombie-weapon-choice.mjs';
import {lootCandidates,planLoot} from '../loot-core.mjs';
import {liveWeaponPolicy} from '../weapon-policy.mjs';
import {manageResources} from '../combat-core.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {ammoClassOf} from './fixtures/game-shared/rarity.js';
const gun=id=>({id,mag:WEAPONS[id].magSize??0,reserve:(WEAPONS[id].magSize??0)*2});
function fixture(primary='p08',secondary='m4a1',slot=0){
 const ws={slot,guns:[gun(primary),gun(secondary)],finite:true,plateT:0,switchT:0,wind:0,cd:0,reloading:false};
 const local={alive:true,ws,hp:100,mv:{x:0,y:0,z:0,vx:0,vz:0}};
 Object.defineProperty(local,'weapon',{get:()=>WEAPONS[ws.guns[ws.slot].id]});
 return {local,modeState:{type:'zm'},pos:{x:0,y:0,z:0},map:{boxes:[],bound:70},
   loot:{data:{items:[],crates:[]}},zremotes:{list:[]},remotes:{list:[]},you:{tm:0},rig:{yaw:0,pitch:0},running:true,phase:'match'};
}
const opts={enabled:true,mode:'autopilot',weaponTactics:true,autoLoot:true,autoReload:true,autoSwitch:true,sidearmEmergencyRange:10,lootRange:55};
const helpers={eyeHeightOf:()=>1.6,rayWorld:(_a,_b,_c,length)=>length,leanOffset:.35};
const input={slot:-1,fire:false,aim:false,reload:false,plate:false};
const ctxt=()=>({now:50,catalog:WEAPONS,resourceState:{},memory:{lastDanger:0,lastFire:0,lastDamage:0,risk:{nearest:Infinity,hot:false,visible:0,aiming:0,close:0}}});
test('Zombies: a weak primary pistol yields to stronger looted rifle in slot 1',()=>{
 const g=fixture();assert.ok(zombieWeaponScore(WEAPONS.m4a1)>zombieWeaponScore(WEAPONS.p08));
 assert.equal(preferredZombieSlot(g.local.ws,WEAPONS),1);
 const cmd=manageResources(g,input,opts,null,helpers,ctxt());assert.equal(cmd.slot,1);
 g.local.ws.slot=1;const after=manageResources(g,input,opts,null,helpers,ctxt());
 assert.notEqual(after.slot,0,'cannot force pistol primary once strong rifle is equipped');
 assert.equal(liveWeaponPolicy(g,null,{},WEAPONS,opts)?.weaponId,'m4a1');
});
test('Zombies: use ammo and weapon quality, not the inventory slot index',()=>{
 const g=fixture('p08','m4a1',1);g.local.ws.guns[1].mag=0;
 const cmd=manageResources(g,input,opts,null,helpers,ctxt());
 assert.equal(cmd.reload,true,'reload stronger rifle rather than swap to weaker pistol');
 assert.notEqual(cmd.slot,0);
});
test('Zombies: do not sacrifice rifle for a low-quality pistol',()=>{
 const g=fixture('l115a3','m4a1',0);
 assert.equal(zombiePickupDecision(g,WEAPONS.g17,WEAPONS),null);
});
test('Zombies: choose the weaker occupied slot for a substantial ground upgrade',()=>{
 const g=fixture('p08','mp5sd',1);
 const decision=zombiePickupDecision(g,WEAPONS.m4a1,WEAPONS);
 assert.ok(decision);assert.equal(decision.slot,0);
 g.loot.data.items=[{id:9,kind:0,wid:'m4a1',x:0,y:0,z:-1.3,rar:3}];
 const choices=lootCandidates(g,opts,WEAPONS,ammoClassOf);
 assert.equal(choices[0].swapSlot,0);
 const p=planLoot(g,{},opts,helpers,WEAPONS,ammoClassOf,{},50);
 assert.equal(p.prepareSlot,0);
});
test('Non-zombie modes preserve established primary-first semantics',()=>{
 const g=fixture();g.modeState.type='br';
 const cmd=manageResources(g,input,opts,null,helpers,ctxt());
 assert.notEqual(cmd.slot,1);
});
test('Recorder option is opt-in and independent from Autopilot enablement',()=>{
 assert.equal(normaliseOptions({}).recordMatches,false);
 assert.equal(normaliseOptions({enabled:false,recordMatches:true}).recordMatches,true);
});
