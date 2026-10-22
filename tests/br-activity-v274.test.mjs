import test from 'node:test';
import assert from 'node:assert/strict';
import {brLootTimeBudget,lootSafe,ringSafetyPlan,searchForWeapon} from '../loot-core.mjs';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
const options={autoLoot:true,lootRange:70,brLeadSeconds:24};
function scene(next=30){const mv={x:5,y:0,z:0};return {
 modeState:{type:'br',ring:{cx:0,cz:0,r:100,phase:'wait',next,nxt:{cx:-20,cz:0,r:20}}},
 local:{alive:true,mv,ws:{slot:0,guns:[{id:'m4a1',mag:25,reserve:80},{id:'makarov',mag:8,reserve:24}],switchT:0},plates:0,hp:100},
 pos:{...mv},you:{tm:'red',ringRate:0},map:{bound:120,boxes:[]},remotes:{list:[]},bremotes:{list:[]},
 loot:{data:{crates:[],items:[{id:'near',kind:0,wid:'ak47',rar:4,x:-1,y:0,z:0}]}}};}
test('BR permits near-corridor loot on safe early rotation',()=>{
 const g=scene();assert.equal(ringSafetyPlan(g,options)?.reason,'br-next-ring');
 assert.equal(brLootTimeBudget(g,options,{x:-1,z:0}).allowed,true);
 assert.equal(lootSafe(g,{nearest:Infinity},options,WEAPONS),true);
});
test('BR declines wrong-way detours and urgent rotation',()=>{
 const g=scene();assert.equal(brLootTimeBudget(g,options,{x:18,z:0}).allowed,false);
 g.modeState.ring.next=7;assert.equal(brLootTimeBudget(g,options,{x:-1,z:0}).allowed,false);
 g.modeState.ring.next=30;g.modeState.ring.phase='shrinking';
 assert.equal(brLootTimeBudget(g,options,{x:-1,z:0}).allowed,false);
 g.modeState.ring.phase='wait';g.local.mv.x=102;
 assert.equal(brLootTimeBudget(g,options,{x:-1,z:0}).allowed,false);
});
test('BR weapon search holds position late game instead of escaping safe circle',()=>{
 const g=scene();g.local.mv.x=-20;g.modeState.ring={cx:-20,cz:0,r:6.5,phase:'wait',next:25,nxt:null};
 const d=searchForWeapon(g,{rayWorld:()=>0},{},100);
 assert.equal(d.direction.reason,'br-endgame-hold');assert.equal(Math.hypot(d.direction.x,d.direction.z),0);
});
test('generated agent actually calls new ring/loot arbitration',async()=>{
 const {readFileSync}=await import('node:fs');const s=readFileSync(new URL('../page-agent.js',import.meta.url),'utf8');
 assert.ok(s.includes('function brLootTimeBudget('));
 assert.ok(s.includes('brLootTimeBudget(game,options,lootPlan.goal'));
 assert.ok(s.includes('if(rotatingRing)lootPlan=null'));
});
