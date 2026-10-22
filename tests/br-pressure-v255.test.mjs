import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {normaliseOptions} from '../aim-core.mjs';
import {planBattleRoyalePush,brRingDestinationAllowed,autoFireInput} from '../combat-core.mjs';
import {ringSafetyPlan,battleRoyaleRingEscape,lootSafe} from '../loot-core.mjs';
const helpers={eyeHeightOf:()=>1.6,rayWorld:(_o,_v,_b,d)=>d,player:{headYs:[1.5,1.15,.35]},leanOffset:.35};
const settings={...normaliseOptions({enabled:true,mode:'autopilot',brAggression:80,brLeadSeconds:24})};
function scene(weapon='m4a1'){
 const ws={slot:0,guns:[{id:weapon,mag:30,reserve:90},{id:'g17',mag:17,reserve:40}],switchT:0,plateT:0,wind:0,cd:0,reloading:false};
 const local={alive:true,mv:{x:0,y:0,z:0,onGround:true,vx:0,vz:0,stance:0,lean:0},hp:100,armor:50,ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {running:true,phase:'match',modeState:{type:'br',ring:{cx:0,cz:0,r:100,phase:'wait',next:60,nxt:{cx:0,cz:0,r:65}}},
 local,rig:{yaw:0,pitch:0},pos:{x:0,y:0,z:0},input:{locked:true,enabled:true},map:{bound:120,boxes:[]},remotes:{list:[]},bremotes:{list:[]},you:{tm:0,ringRate:0},net:{id:'me'}};
}
function target(x,z){let d=Math.hypot(x,z);return {id:'p:foe',point:{x,y:1.6,z},visible:true,yaw:Math.atan2(-x,-z),pitch:0,distance:d};}
test('BR push closes down rifle gap rather than circling indefinitely',()=>{
 const g=scene('m4a1'),t=target(0,-48),p=planBattleRoyalePush(g,t,helpers,settings,1);
 assert.equal(p?.reason,'br-pressure-advance');assert.ok(p.z<0,JSON.stringify(p));
});
test('BR shotgun pushes closer while sniper within intended range does not rush',()=>{
 const a=scene('benelli_m4');a.local.ws.guns[0].mag=7;
 const p=planBattleRoyalePush(a,target(0,-18),helpers,settings,0);
 assert.ok(p?.z<0,JSON.stringify(p));
 const s=scene('l115a3');s.local.ws.guns[0].mag=5;
 assert.equal(planBattleRoyalePush(s,target(0,-48),helpers,settings,0),null);
});
test('BR refuses commit with low HP, reloading, or insufficient ammunition',()=>{
 const g=scene();g.local.hp=32;
 assert.equal(planBattleRoyalePush(g,target(0,-48),helpers,settings,0),null);
 g.local.hp=100;g.local.ws.reloading=true;
 assert.equal(planBattleRoyalePush(g,target(0,-48),helpers,settings,0),null);
 g.local.ws.reloading=false;g.local.ws.guns[0].mag=0;
 assert.equal(planBattleRoyalePush(g,target(0,-48),helpers,settings,0),null);
});
test('BR current boundary forbids aggressive chase outside active circle',()=>{
 const g=scene();g.modeState.ring.r=50;g.local.mv.z=-44;
 assert.equal(planBattleRoyalePush(g,target(0,-65),helpers,settings,1),null);
 assert.equal(brRingDestinationAllowed(g,{x:0,z:-51},settings),false);
});
test('BR imminent next circle prevents pursuit back toward unsafe ground',()=>{
 const g=scene();g.modeState.ring.nxt={cx:-26,cz:0,r:18};g.modeState.ring.next=17;
 const t=target(43,0);
 assert.equal(planBattleRoyalePush(g,t,helpers,settings,1),null);
 assert.equal(brRingDestinationAllowed(g,t.point,settings),false);
});
test('BR long countdown permits normal pressure, pre-rotation starts before damage',()=>{
 const g=scene();g.modeState.ring.next=40;g.modeState.ring.nxt={cx:-26,cz:0,r:18};
 assert.equal(ringSafetyPlan(g,settings),null);
 assert.equal(planBattleRoyalePush(g,target(0,-49),helpers,settings,1)?.reason,'br-pressure-advance');
 g.modeState.ring.next=16;
 const p=ringSafetyPlan(g,settings);
 assert.ok(p);assert.equal(p.urgent,false);assert.equal(p.reason,'br-next-ring');
 assert.ok(p.goal.x<0);
});
test('BR true ring emergency suppresses combat eligibility and prioritizes escape',()=>{
 const g=scene();g.modeState.ring.r=34;g.local.mv.x=38;g.pos.x=38;
 const p=ringSafetyPlan(g,settings);assert.equal(p.urgent,true);
 const d=battleRoyaleRingEscape(g,helpers,settings);assert.ok(d.x<0);
});
test('BR safe early rotation remains combat-capable when aligned on exposed enemy',()=>{
 const g=scene();g.modeState.ring.next=16;g.modeState.ring.nxt={cx:-26,cz:0,r:18};
 const plan=ringSafetyPlan(g,settings);assert.equal(plan.urgent,false);
 const fired=autoFireInput(g,{slot:-1,fire:false,aim:false},target(0,-19),helpers,settings);
 assert.equal(fired.fire,true,'soft ring rotation should allow valid self-defense shot');
});
test('BR does not loot in either soft rotation or hard escape',()=>{
 const g=scene();g.loot={data:{items:[],crates:[]}};
 g.modeState.ring.next=16;g.modeState.ring.nxt={cx:-26,cz:0,r:18};
 assert.equal(lootSafe(g,{hot:false,nearest:Infinity},{autoLoot:true},WEAPONS),false);
 g.local.mv.x=102;assert.equal(lootSafe(g,{hot:false,nearest:Infinity},{autoLoot:true},WEAPONS),false);
});
test('BR confidence and lead time are clamped independently of other modes',()=>{
 const a=normaliseOptions({brAggression:1000,brLeadSeconds:-1});assert.equal(a.brAggression,100);assert.equal(a.brLeadSeconds,10);
 const b=normaliseOptions({brAggression:0,brLeadSeconds:24});assert.equal(b.brAggression,0);
 const g=scene();assert.equal(planBattleRoyalePush(g,target(0,-48),helpers,b,0),null);
});

test('BR final closing barrier prioritizes moving to circle center over chasing',()=>{
 const g=scene();g.modeState.ring={cx:0,cz:0,r:14,phase:'closing',next:0,nxt:null};g.local.mv.x=6;
 const p=ringSafetyPlan(g,settings);assert.equal(p.urgent,true);assert.equal(p.goal.x,0);
});
