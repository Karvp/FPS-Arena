import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {manageResources} from '../combat-core.mjs';

const opts={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,
  autoArmor:false,reloadQuietSeconds:3.5,weaponTactics:true};
const quiet={lastDanger:0,lastDamage:0,lastFire:0,risk:{hot:false,nearest:Infinity}};
const danger={lastDanger:100,lastDamage:100,lastFire:100,risk:{hot:true,nearest:12}};
const helpers={rayWorld:(_a,_b,_boxes,d)=>d,eyeHeightOf:()=>1.6};
function fixture(primary='m4a1',secondary='g17',finite=true){
 const ws=makeGunsState([{id:primary,mag:WEAPONS[primary].magSize,reserve:90},
   {id:secondary,mag:0,reserve:51}],finite);
 const local={alive:true,down:false,frozen:false,hp:100,armor:50,maxArmor:50,plates:0,
   mv:{x:0,y:0,z:0},ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {running:true,phase:'match',local,modeState:{type:'br'},pos:{x:0,y:0,z:0},
   map:{bound:80,boxes:[]},you:{ringRate:0},input:{locked:true,enabled:true,fireHeld:false,aimHeld:false}};
}
function step(game,now,state={},memory=quiet,options=opts,suspendMaintenance=false){
 const input=manageResources(game,{slot:-1,fire:false,aim:false,reload:false,plate:false},
  options,null,helpers,{now,memory,resourceState:state,catalog:WEAPONS,suspendMaintenance});
 const actual=stepWeapons(game.local.ws,input,1/60,
  {alive:true,frozen:false,maxArmor:50,armor:50,plates:0});
 return {input,actual};
}
test('loaded primary -> depleted secondary -> reload -> restore primary (real 60Hz gun state)',()=>{
 const g=fixture(),state={};let switchedToSidearm=0,started=0,done=0,restored=0;
 for(let i=0;i<450;i++){
  const {input,actual}=step(g,100+i/60,state,quiet,{...opts,proactiveSecondaryReload:true});
  if(actual.switched && g.local.ws.slot===1)switchedToSidearm++;
  if(actual.switched && g.local.ws.slot===0)restored++;
  if(actual.reloadStarted)started++;
  if(actual.reloadDone)done++;
  if(i===0)assert.equal(input.slot,1);
 }
 assert.equal(switchedToSidearm,1);
 assert.equal(started,1);
 assert.equal(done,1);
 assert.equal(restored,1);
 assert.equal(g.local.ws.slot,0);
 assert.equal(g.local.ws.guns[0].mag,WEAPONS.m4a1.magSize);
 assert.equal(g.local.ws.guns[1].mag,WEAPONS.g17.magSize);
 assert.equal(g.local.ws.guns[1].reserve,51-WEAPONS.g17.magSize);
 assert.equal(state.secondaryPending,false);
});
test('never switch to empty backup for proactive reload under combat threat',()=>{
 const g=fixture(),state={};
 const {input}=step(g,100,state,danger);
 assert.equal(input.slot,-1);
 assert.notEqual(input.reload,true);
 assert.equal(state.secondaryPending,undefined);
});
test('enemy arrives during sidearm maintenance: interrupt and return to loaded primary',()=>{
 const g=fixture(),state={};
 step(g,100,state,quiet,{...opts,proactiveSecondaryReload:true});
 assert.equal(g.local.ws.slot,1);
 for(let i=0;i<25;i++)step(g,100.1+i/60,state,quiet,{...opts,proactiveSecondaryReload:true});
 assert.equal(g.local.ws.guns[1].mag,0);
 // While busy switching weaponstate does not accept a second switch instantly;
 // once the 0.4s cooldown ends, the emergency return must occur.
 for(let i=0;i<50;i++)step(g,101+i/60,state,danger);
 assert.equal(g.local.ws.slot,0);
 assert.equal(state.secondaryPending,false);
 assert.equal(g.local.ws.guns[1].mag,0);
});
test('finite reserve exhausted: backup cannot be reloaded or selected for maintenance',()=>{
 const g=fixture(),state={};g.local.ws.guns[1].reserve=0;
 for(let i=0;i<10;i++){
  const {input}=step(g,100+i/60,state);
  assert.equal(input.slot,-1);
  assert.notEqual(input.reload,true);
 }
 assert.equal(g.local.ws.slot,0);
});
test('active secondary yields to loaded primary even while quiet',()=>{
 const g=fixture(),state={};g.local.ws.slot=1;
 const {input,actual}=step(g,100,state);
 assert.equal(input.slot,0);
 assert.equal(actual.switched,true);
 assert.equal(actual.reloadStarted,false);
});
test('active secondary still reloads if primary is out of bullets and reserve',()=>{
 const g=fixture(),state={};g.local.ws.slot=1;
 g.local.ws.guns[0].mag=0;g.local.ws.guns[0].reserve=0;
 const {input,actual}=step(g,100,state);
 assert.equal(input.reload,true);
 assert.equal(actual.reloadStarted,true);
});
test('loot and urgent navigation suspend proactive maintenance until complete',()=>{
 const g=fixture(),state={};
 const {input}=step(g,100,state,quiet,opts,true);
 assert.equal(input.slot,-1);
 assert.equal(g.local.ws.slot,0);
});
test('assist mode must not switch to sidearm for background reload',()=>{
 const g=fixture(),state={};
 const {input}=step(g,100,state,quiet,{...opts,mode:'assist'});
 assert.equal(input.slot,-1);
});
test('backup equipped when primary is empty prioritizes recovering primary in quiet',()=>{
 const g=fixture(),state={};
 g.local.ws.guns[0].mag=0;g.local.ws.slot=1;
 const {input,actual}=step(g,100,state);
 assert.equal(input.slot,0);
 assert.equal(actual.switched,true);
});

test('Classic: depleted PRIMARY in combat -> sidearm -> retreat -> reload PRIMARY -> restore and shoot',()=>{
 const g=fixture('m4a1','g17',false),state={};
 g.modeState.type='tdm';g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=12;
 let switches=[],started=0,done=0,wasSidearm=false,wasPrimaryReload=false;
 for(let i=0;i<570;i++){
  // Danger until second 2.5, then full quiet window (3.5s).
  const t=i/60,risk=t<2.5?{hot:true,nearest:10}:{hot:false,nearest:Infinity};
  const mem=t<2.5?{...danger,lastDanger:t,lastDamage:t,lastFire:t,risk}:
    {...quiet,lastDanger:2.5,lastDamage:2.5,lastFire:2.5,risk};
  const {input,actual}=step(g,t,state,mem);
  if(actual.switched)switches.push(g.local.ws.slot);
  if(g.local.ws.slot===1)wasSidearm=true;
  if(actual.reloadStarted){started++;wasPrimaryReload=g.local.ws.slot===0;}
  if(actual.reloadDone)done++;
  if(t<2.5)assert.equal(input.reload,false,'must not reload in live firefight');
 }
 assert.ok(wasSidearm,'sidearm was used');
 assert.deepEqual(switches,[1,0], 'no endless gun swapping');
 assert.equal(started,1);assert.equal(done,1);
 assert.equal(wasPrimaryReload,true);
 assert.equal(g.local.ws.guns[0].mag,WEAPONS.m4a1.magSize);
 assert.equal(g.local.ws.slot,0);
 assert.equal(state.primaryPending,false);
 const fired=stepWeapons(g.local.ws,{slot:-1,fire:true,reload:false},1/60,{alive:true,frozen:false,armor:50,plates:0,maxArmor:50});
 assert.equal(fired.fired,true,'restored primary can fire again');
});

test('Classic: interruption of primary reload returns to live sidearm, then resumes primary recovery',()=>{
 const g=fixture('m4a1','g17',false),state={};g.modeState.type='tdm';
 g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=8;g.local.ws.slot=1;
 let began=0,aborted=false,done=0;
 for(let i=0;i<690;i++){
   const t=i/60;
   // Start safe; ambush during reload; only settle after time 3.4.
   const hot=t>=.72 && t<3.4;
   const mem={risk:{hot,nearest:hot?8:Infinity},lastDanger:hot?t:hot===false&&t>=3.4?3.4:-10,
    lastDamage:hot?t:hot===false&&t>=3.4?3.4:-10,lastFire:hot?t:hot===false&&t>=3.4?3.4:-10};
   const {input,actual}=step(g,t,state,mem);
   if(actual.reloadStarted){assert.equal(g.local.ws.slot,0);began++;}
   if(actual.reloadDone)done++;
   if(hot && g.local.ws.slot===1 && state.primaryPending)aborted=true;
   if(hot)assert.notEqual(input.reload,true);
 }
 assert.ok(aborted,'ambush recovers the sidearm');
 assert.ok(began>=2,'retries reload after an interruption');
 assert.equal(done,1);assert.equal(g.local.ws.slot,0);
 assert.equal(g.local.ws.guns[0].mag,WEAPONS.m4a1.magSize);
});

test('Classic empty primary with no need for backup swaps reloads directly in quiet',()=>{
 const g=fixture('m4a1','g17',false),state={};g.modeState.type='tdm';g.local.ws.guns[0].mag=0;
 const {input,actual}=step(g,20,state,quiet);
 assert.equal(input.slot,-1);assert.equal(input.reload,true);
 assert.equal(actual.reloadStarted,true);
});

test('Finite ammo with zero primary reserve does not start an impossible endless recovery',()=>{
 const g=fixture('m4a1','g17',true),state={};g.local.ws.guns[0].mag=0;g.local.ws.guns[0].reserve=0;g.local.ws.guns[1].mag=WEAPONS.g17.magSize;g.local.ws.slot=1;
 for(let i=0;i<20;i++){
  const {input}=step(g,20+i/60,state,quiet);
  assert.notEqual(input.slot,0);assert.notEqual(input.reload,true);
 }
 assert.notEqual(state.primaryPending,true);
});
