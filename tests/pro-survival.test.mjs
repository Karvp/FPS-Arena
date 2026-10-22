import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {normaliseOptions} from '../aim-core.mjs';
import {assessThreats,updateCombatMemory,armorDecision,manageResources,planProMovement,applyProStance,movementFromWorld,autoFireInput} from '../combat-core.mjs';
const h={player:{headY:1.62},eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_o,_d,_bs,dist)=>dist};
const blocked={...h,rayWorld:(origin,_dir,_bs,dist)=>origin[1]>=1.35?Math.min(1,dist):dist};
const base={enabled:true,mode:'autopilot',autoArmor:true,autoReload:true,autoSwitch:true,autoPeek:true,proMovement:true,armorQuietSeconds:5,weaponTactics:true};
function g(weapon='m4a1') {
 const ws=makeGunsState([{id:weapon,mag:WEAPONS[weapon].magSize,reserve:100},{id:'g17',mag:17,reserve:68}],true);
 const local={alive:true,hp:100,armor:10,maxArmor:50,plates:3,frozen:false,down:false,mv:{x:0,y:0,z:0,vx:0,vz:0,onGround:true,slideCd:0,slidePrev:false,slideT:0,stance:0,lean:0},ws,team:'red'};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {local,running:true,phase:'match',input:{enabled:true,locked:true,aimHeld:false,fireHeld:false},you:{tm:0},net:{id:'you'},rig:{yaw:0,pitch:0},map:{boxes:[],bound:80},pos:{x:0,y:0,z:0},modeState:{type:'tdm'},remotes:{list:[]},bremotes:{list:[]}};
}
const enemy=(d,aim=false)=>({id:'op',alive:true,pos:{x:0,y:0,z:-d},team:1,data:{aim:aim?1:0,pitch:0},yaw:0});
const t=d=>({id:'p:op',point:{x:0,y:1.6,z:-d},yaw:0,pitch:0});
function sec(gm,now,cmd={},target=null,helper=h,prev={}){
 const mem=updateCombatMemory(gm,cmd,now,helper,target,prev);
 const out=manageResources(gm,{slot:-1,fire:false,aim:false,...cmd},base,target,helper,{now,memory:mem});
 return {mem,out};
}
test('armor is NEVER started during active firing, ADS, reloading or recent fire',()=>{
 const game=g();
 let k=sec(game,0,{fire:true});
 assert.notEqual(k.out.plate,true);
 k=sec(game,1,{aim:true},null,h,k.mem);assert.notEqual(k.out.plate,true);
 k=sec(game,6,{fire:true},null,h,k.mem);assert.notEqual(k.out.plate,true);
 k=sec(game,8,{},null,h,k.mem);assert.notEqual(k.out.plate,true);
 game.local.ws.reloading=true;
 k=sec(game,15,{},null,h,k.mem);assert.notEqual(k.out.plate,true);
});
test('visible 90m hitscan foe blocks plating even though beyond weapon exposed range',()=>{
 const game=g();game.remotes.list=[enemy(90)];
 let r=sec(game,30,{},null,h,{});
 assert.equal(r.mem.risk.visible,1);assert.equal(r.out.plate,undefined);
 assert.equal(r.mem.risk.hot,true);
});
test('side enemy blocks plating while selected foe is obstructed',()=>{
 const game=g();game.remotes.list=[enemy(18)];
 const r=sec(game,30,{},t(90),h,{});
 assert.ok(r.mem.risk.hot);assert.equal(r.out.plate,undefined);
});
test('hidden close foe blocks plating even if no clear line of sight',()=>{
 const game=g();game.remotes.list=[enemy(15)];
 const r=sec(game,30,{},t(15),blocked,{});
 assert.equal(r.mem.risk.close,1);assert.equal(r.mem.risk.visible,0);assert.equal(r.out.plate,undefined);
});
test('plating requires five FULL quiet seconds after damage or visible enemy',()=>{
 const game=g();game.remotes.list=[enemy(60)];
 let r=sec(game,0,{},null,h,{});
 game.remotes.list=[];
 r=sec(game,4.9,{},null,h,r.mem);assert.notEqual(r.out.plate,true);
 r=sec(game,5.1,{},null,h,r.mem);assert.equal(r.out.plate,true);
 game.local.armor=5;
 r=sec(game,5.2,{},null,h,r.mem);assert.notEqual(r.out.plate,true); // Damage resets quiet window.
 r=sec(game,11,{},null,h,r.mem);assert.equal(r.out.plate,true);
});
test('shot fired / damage mid-quiet resets safety and does not trigger 3-second lockout',()=>{
 const game=g();let m=updateCombatMemory(game,{},0,h,null,{});
 m=updateCombatMemory(game,{fire:true},4,h,null,m);
 let q=sec(game,7,{},null,h,m);assert.notEqual(q.out.plate,true);
 q=sec(game,9.1,{},null,h,q.mem);assert.equal(q.out.plate,true);
 assert.equal(stepWeapons(game.local.ws,{...q.out,slot:-1},1/60,{alive:true,frozen:false,armor:10,plates:3,maxArmor:50}).plateStarted,true);
});
test('manual armor request remains user controlled, but autopilot never starts it implicitly',()=>{
 const game=g();game.remotes.list=[enemy(5)];
 const r=sec(game,0,{plate:true});assert.equal(r.out.plate,true);
 const manual=stepWeapons(game.local.ws,{...r.out,slot:-1},1/60,{alive:true,frozen:false,armor:10,plates:3,maxArmor:50});
 assert.equal(manual.plateStarted,true);
});
test('pro movement: sniper holds lane and never suppresses valid fire to brake',()=>{
 const game=g('l115a3');game.local.armor=40;
 let p=planProMovement(game,t(45),h,base,1,{});
 assert.equal(p.reason,'pro-hold-sightline');
 game.local.mv.vx=5;
 p=planProMovement(game,t(45),h,base,1,{});
 assert.equal(p.reason,'pro-brake');assert.notEqual(p.suppressFire,true);
 const i=applyProStance(game,{fire:true,slot:-1},p,1,{});
 assert.equal(i.fire,true);
});
test('pro movement: shotgun closes gap only safely; reload retreats and avoids exposed cover',()=>{
 const game=g('benelli_m4');game.local.armor=40;
 const advance=planProMovement(game,t(25),h,base,2);
 assert.equal(advance.reason,'pro-rotate');
 game.local.ws.reloading=true;
 const recovery=planProMovement(game,t(9),h,base,2);
 assert.match(recovery.reason,/pro-break-contact|pro-disengage/);
});
test('pro movement: same direction inside a window, next window is aperiodic',()=>{
 const game=g('mp5sd');game.local.armor=40;
 const state={};
 const first=planProMovement(game,t(12),h,base,10,state);
 const second=planProMovement(game,t(12),h,base,10+1/60,state);
 assert.equal(first.reason,'pro-combat-strafe');
 assert.equal(first.x,second.x);
 const expiry=state.changeAt;
 const third=planProMovement(game,t(12),h,base,expiry+.01,state);
 assert.ok(state.changeAt>expiry,'a fresh phase is scheduled');
 assert.ok(Number.isFinite(third.x),'direction remains defined regardless of side choice');
});
test('slide attempt only while already sprinting and not firing/aiming; no unsafe random jumps',()=>{
 const game=g('mp5sd');game.local.armor=40;
 const proposal=planProMovement(game,t(50),blocked,base,3);
 assert.equal(proposal.reason,'pro-rotate');assert.equal(proposal.slide,false);
 game.local.mv.sprint=true;
 const next=planProMovement(game,t(50),blocked,base,3);
 assert.equal(next.slide,true);
 assert.equal(applyProStance(game,{fire:false,aim:false,jump:false,crouch:false},next,3,{},base,blocked).crouch,true);
 assert.equal(applyProStance(game,{fire:true,aim:false,crouch:false},next,3,{},base,blocked).crouch,false);
});
test('autopilot does not ADS into obscuring walls, maintaining sprint mobility',()=>{
 const game=g();game.local.armor=50;
 const a=autoFireInput(game,{slot:-1,fire:false,aim:false},t(15),blocked,base);
 assert.equal(a.aim,false);assert.equal(a.fire,false);
});
test('armorQuietSeconds setting is validated and preserved by options normalizer',()=>{
 assert.equal(normaliseOptions({armorQuietSeconds:3}).armorQuietSeconds,4);
 assert.equal(normaliseOptions({armorQuietSeconds:80}).armorQuietSeconds,15);
 assert.equal(normaliseOptions({proMovement:false}).proMovement,false);
});

test('forced autopilot ADS flag does not permanently disable safe plating',()=>{
 const game=g();game.input.aimHeld=true;
 const context={now:20,memory:{lastDanger:0,lastDamage:0,lastFire:0,risk:{hot:false,nearest:Infinity}}};
 assert.equal(armorDecision(game,{fire:false,aim:false,slot:-1},base,null,h,context).allowed,true);
 assert.equal(armorDecision(game,{fire:false,aim:true,slot:-1},base,null,h,context).allowed,false);
});
