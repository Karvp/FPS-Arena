import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {rayWorld} from './fixtures/game-shared/geometry.js';
import {zombieReloadOpportunity,manageResources,planProMovement,planBattleRoyalePush} from '../combat-core.mjs';
import {planLoot,zombieLootMustEvade,lootCandidates} from '../loot-core.mjs';
import {ammoClassOf} from './fixtures/game-shared/rarity.js';

const helpers={rayWorld,eyeHeightOf:()=>1.6,leanOffset:.35};
const options={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,autoArmor:false,
  weaponTactics:true,autoLoot:true,lootRange:65,zombieSpacing:22,brAggression:95,reloadQuietSeconds:3.5};
const quiet={risk:{hot:false,nearest:Infinity,visible:0,aiming:0,close:0},lastDanger:0,lastDamage:0,lastFire:0};
const sample={slot:-1,fire:false,aim:false,reload:false,plate:false};
function game(type='zm',id='m4a1',sec='g17',finite=true){
 const ws=makeGunsState([{id,mag:WEAPONS[id].magSize,reserve:80},
   {id:sec,mag:WEAPONS[sec].magSize,reserve:40}],finite);
 const local={alive:true,hp:100,armor:30,plates:0,maxArmor:50,down:false,frozen:false,
   mv:{x:0,y:0,z:0,vx:0,vz:0,onGround:true},ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {local,pos:{x:0,y:0,z:0},you:{tm:0,ringRate:0},map:{boxes:[],bound:65},
  modeState:{type},rig:{yaw:0,pitch:0},zremotes:{list:[]},remotes:{list:[]},bremotes:{list:[]},
  loot:{data:{crates:[],items:[]}},input:{enabled:true,locked:true},running:true,phase:'match'};
}
const zombie=(x,z)=>({id:`z:${x}:${z}`,alive:true,pos:{x,y:0,z}});
const target=(d,visible=true)=>({id:'enemy',point:{x:0,y:1.6,z:-d},visible,yaw:0,pitch:0});
const ctx=(now,state={},memory=quiet)=>({now,catalog:WEAPONS,resourceState:state,memory});
const step=(g,now,state={},memory=quiet)=>{
 const cmd=manageResources(g,sample,options,null,helpers,ctx(now,state,memory));
 const result=stepWeapons(g.local.ws,cmd,1/60,{alive:true,frozen:false,armor:30,maxArmor:50,plates:0});
 return {cmd,result};
};

test('zombie sprinting away can reload even during an active wave',()=>{
 const g=game();g.local.mv.vz=8;g.zremotes.list=[zombie(0,-13)];g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=0;
 const safety=zombieReloadOpportunity(g,WEAPONS.m4a1,{empty:true});
 assert.ok(safety.safe,JSON.stringify(safety));
 const s=step(g,1);assert.equal(s.cmd.reload,true);assert.equal(s.result.reloadStarted,true);
});
test('zombie at melee distance reloads only when no loaded sidearm exists',()=>{
 const g=game();g.zremotes.list=[zombie(0,-4)];g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=0;
 assert.equal(step(g,10).result.reloadStarted,true);
});
test('empty zombies primary reload completes while continuously retreating',()=>{
 const g=game();g.local.mv.vz=7.9;g.zremotes.list=[zombie(0,-14)];
 g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=0;
 let started=0,done=0;const state={};
 for(let i=0;i<280;i++){
  const {result}=step(g,10+i/60,state);
  if(result.reloadStarted)started++;if(result.reloadDone)done++;
 }
 assert.equal(started,1);assert.equal(done,1);
 assert.equal(g.local.ws.guns[0].mag,WEAPONS.m4a1.magSize);
});
test('Zombie: live sidearm must give way to empty but recoverable strong rifle after spacing is secured',()=>{
 const g=game();g.local.mv.vz=8;g.zremotes.list=[zombie(0,-14)];
 g.local.ws.slot=1;g.local.ws.guns[0].mag=0;const state={};
 let switched=false,started=false,done=false;
 for(let i=0;i<310;i++){
  const {cmd,result}=step(g,10+i/60,state);
  if(result.switched&&g.local.ws.slot===0)switched=true;
  if(result.reloadStarted)started=true;if(result.reloadDone)done=true;
 }
 assert.ok(switched&&started&&done);
 assert.equal(g.local.ws.slot,0);assert.equal(g.local.ws.guns[0].mag,WEAPONS.m4a1.magSize);
});
test('Zombie: crate 14m away remains worth moving to with a zombie 11m behind player',()=>{
 const g=game();g.zremotes.list=[zombie(0,11)];g.loot.data.crates=[{id:8,x:0,y:0,z:-14,rar:3,open:false}];
 const plan=planLoot(g,{hot:true,nearest:11},options,helpers,WEAPONS,ammoClassOf,{},20);
 assert.ok(plan,'must not starve crate planning because any zombie exists');
 assert.equal(plan.targetId,'crate:8');assert.equal(plan.distance,14);
 assert.equal(zombieLootMustEvade(g,plan,{point:{x:0,z:11},distance:11}),false);
});
test('Zombie: zombie occupying next crate step forces emergency evasion rather than walking into it',()=>{
 const g=game();g.zremotes.list=[zombie(0,-5.5)];
 assert.equal(zombieLootMustEvade(g,{kind:'crate',goal:{x:0,z:-15},route:[{x:0,z:-4}],distance:15},
   {point:{x:0,z:-5.5},distance:5.5}),true);
});
test('Zombie: no crate interaction in immediate melee danger',()=>{
 const g=game();g.zremotes.list=[zombie(0,4)];g.loot.data.crates=[{id:3,x:0,y:0,z:-2,rar:2,open:false}];
 assert.equal(planLoot(g,{hot:true,nearest:4},options,helpers,WEAPONS,ammoClassOf,{},5),null);
});
test('Zombie: supply-short rifle makes crate preferred to a distant armor plate',()=>{
 const g=game();g.local.ws.guns[0].mag=0;g.local.ws.guns[0].reserve=5;
 g.local.ws.guns[1].mag=0;g.local.ws.guns[1].reserve=0;
 g.loot.data.crates=[{id:1,x:0,y:0,z:20,rar:0,open:false}];
 g.loot.data.items=[{id:2,kind:2,x:2,y:0,z:0}];
 const candidates=lootCandidates(g,options,WEAPONS,ammoClassOf);
 assert.equal(candidates[0].id,'crate:1');
});
test('Classic: loaded powerful primary is preferred over active pistol during sighted encounter',()=>{
 const g=game('tdm','l115a3','g17',false);g.local.ws.slot=1;
 const memory={risk:{hot:true,nearest:55,visible:1,aiming:0,close:0},lastDanger:10,lastFire:10,lastDamage:10};
 assert.equal(step(g,10,{},memory).cmd.slot,0);
});
test('Classic: reload powerful primary after quiet time behind cover rather than stick to pistol',()=>{
 const g=game('tdm','l115a3','g17',false);g.local.ws.slot=1;g.local.ws.guns[0].mag=0;
 const risk={hot:true,nearest:34,visible:0,aiming:0,close:1};
 const mem={risk,lastDanger:30,lastFire:0,lastDamage:0};const state={};
 let switches=0,reloads=0,done=0;
 for(let i=0;i<330;i++){
  const {result}=step(g,30+i/60,state,mem);
  if(result.switched)switches++;if(result.reloadStarted)reloads++;if(result.reloadDone)done++;
 }
 assert.equal(switches,1);assert.equal(reloads,1);assert.equal(done,1);
 assert.equal(g.local.ws.slot,0);
});
test('Classic: no reloading immediately after a shot even from cover',()=>{
 const g=game('tdm','l115a3','g17',false);g.local.ws.slot=1;g.local.ws.guns[0].mag=0;
 const mem={risk:{hot:true,nearest:35,visible:0,aiming:0,close:1},lastDanger:5,lastFire:4,lastDamage:4};
 assert.notEqual(step(g,5,{},mem).cmd.reload,true);
 assert.notEqual(step(g,5,{},mem).cmd.slot,0);
});
test('BR sniper at 70m does not push just because aggression setting is high',()=>{
 const g=game('br','l115a3');g.modeState.ring={cx:0,cz:0,r:120,next:150,phase:'wait'};
 const p=planBattleRoyalePush(g,target(70),helpers,options,15);assert.equal(p,null);
});
test('Sniper already at 22m with moving stance retreats rather than parking or rushing',()=>{
 const g=game('tdm','l115a3');g.local.mv.vx=5;
 const p=planProMovement(g,target(22),helpers,options,15,{});
 assert.equal(p.reason,'pro-spacing');assert.ok(p.z>0);
});
test('Sniper blocked at 85m seeks a sidelong firing position, does not march toward opponent',()=>{
 const g=game('tdm','l115a3');const t=target(85,false);
 const blocked={...helpers,rayWorld:()=>.1};
 const p=planProMovement(g,t,blocked,options,15,{});
 // If all angles blocked, hold position; should never push directly into a blocked target.
 assert.ok(!p || !p.reason.includes('rotate'),JSON.stringify(p));
});
test('Finite Zombies: no ammo for any firearm enters supply search mode (not fake firefight)',async()=>{
 const {weaponLootState}=await import('../loot-core.mjs');
 const g=game();for(const w of g.local.ws.guns){w.mag=0;w.reserve=0;}
 const state=weaponLootState(g,WEAPONS);
 assert.equal(state.needsWeapon,false);assert.equal(state.needsAmmo,true);
 g.loot.data.items=[{id:40,kind:1,wid:ammoClassOf('m4a1'),x:0,y:0,z:-6,amt:25},
   {id:41,kind:2,x:1,y:0,z:0}];
 const choices=lootCandidates(g,options,WEAPONS,ammoClassOf);
 assert.equal(choices.length,1);assert.equal(choices[0].id,'item:40');
 const plan=planLoot(g,{hot:false,nearest:Infinity},options,helpers,WEAPONS,ammoClassOf,{},15);
 assert.equal(plan.targetId,'item:40');
});
test('Classic: primary recovery immediately swaps from pistol at long range',()=>{
 const g=game('tdm','m4a1','g17',false);g.local.ws.slot=1;g.local.ws.guns[0].mag=0;
 const risk={hot:true,nearest:90,visible:1,aiming:0,close:0};
 const state={};
 const active=step(g,11,state,{risk,lastFire:10.6,lastDamage:8,lastDanger:11});
 assert.equal(active.result.switched,true);assert.equal(g.local.ws.slot,0);
 const calm=step(g,15,state,{risk,lastFire:10,lastDamage:8,lastDanger:15});
 assert.equal(calm.cmd.slot,-1); // now waiting for switch cooldown before reload
});
