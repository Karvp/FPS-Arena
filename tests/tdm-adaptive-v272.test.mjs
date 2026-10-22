import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldUseCombatPeek} from '../camera-tactics.mjs';
import {stabilizeMovement} from '../motion-stabilizer.mjs';
const contacts=[{x:3,z:10,yaw:0,pitch:0,aim:true}];
const target={id:'p:foe',visible:true,point:{x:3,y:1.6,z:10}};
function g(hp=100,mag=30,armor=30){return {local:{hp,armor,mv:{x:0,y:0,z:0},ws:{slot:0,reloading:false,switchT:0,guns:[{mag}]}}};}
const fresh={risk:{visible:1,aiming:0},lastDamage:-10};
test('visible loaded target: healthy fighter takes valid shot rather than entering long peek cycle',()=>{
 assert.equal(shouldUseCombatPeek(g(),target,fresh,contacts,10,{adaptivePeek:true}),false);
});
test('defensive cover persists under wounded or multi-angle fire',()=>{
 assert.equal(shouldUseCombatPeek(g(42),target,fresh,contacts,10,{adaptivePeek:true}),true);
 assert.equal(shouldUseCombatPeek(g(80),target,{risk:{visible:2,aiming:1},lastDamage:9},contacts,10,{adaptivePeek:true}),true);
 assert.equal(shouldUseCombatPeek(g(73,30,0),target,fresh,contacts,10,{adaptivePeek:true}),true);
});
test('occluded target, reload and empty magazine keep cover/peek behaviour',()=>{
 assert.equal(shouldUseCombatPeek(g(),{...target,visible:false},fresh,contacts,10,{adaptivePeek:true}),true);
 assert.equal(shouldUseCombatPeek(g(100,0),target,fresh,contacts,10,{adaptivePeek:true}),true);
 const x=g();x.local.ws.reloading=true;
 assert.equal(shouldUseCombatPeek(x,target,fresh,contacts,10,{adaptivePeek:true}),true);
});
test('explicit legacy option preserves previously scheduled peeks',()=>{
 assert.equal(shouldUseCombatPeek(g(),target,fresh,contacts,10,{adaptivePeek:false}),true);
});
test('a neutral navigation tick does not erase heading and cause immediate reverse',()=>{
 const m={},zero={forward:false,backward:false,left:false,right:false};
 let a=stabilizeMovement(zero,{x:0,z:-1,reason:'pro-rotate'},0,1,m);
 assert.equal(a.forward,true);
 a=stabilizeMovement(zero,null,0,1.08,m);assert.equal(a.forward,false);
 a=stabilizeMovement(zero,{x:0,z:1,reason:'pro-rotate'},0,1.12,m,{safePrevious:()=>true});
 assert.equal(a.forward,true);
 a=stabilizeMovement(zero,{x:0,z:1,reason:'pro-rotate'},0,1.45,m,{safePrevious:()=>true});
 assert.equal(a.backward,true);
});
test('emergency and blocked movement bypass heading hysteresis after neutral frame',()=>{
 const m={},zero={forward:false,backward:false,left:false,right:false};
 stabilizeMovement(zero,{x:0,z:-1,reason:'pro-rotate'},0,1,m);
 stabilizeMovement(zero,null,0,1.08,m);
 const e=stabilizeMovement(zero,{x:0,z:1,reason:'br-ring-escape',emergency:true},0,1.10,m);
 assert.equal(e.backward,true);
 const w={};stabilizeMovement(zero,{x:0,z:-1,reason:'pro-rotate'},0,1,w);
 const blocked=stabilizeMovement(zero,{x:0,z:1,reason:'pro-rotate'},0,1.05,w,{safePrevious:()=>false});
 assert.equal(blocked.backward,true);
});
