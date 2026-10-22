import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from '../lab/arena/source/shared/weapons.js';
import {adsConeCoverage,decideAutopilotAds} from '../ads-tactics.mjs';
import {autoFireInput} from '../combat-core.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const t=(dist)=>({id:'enemy',visible:true,hitboxVisible:true,point:{x:0,y:1.6,z:-dist},yaw:0,pitch:0});
const g=(w)=>({running:true,phase:'match',pos:{x:0,y:0,z:0},input:{locked:true,enabled:true},rig:{yaw:0,pitch:0},map:{bound:100,boxes:[]},local:{alive:true,mv:{x:0,y:0,z:0,onGround:true},weapon:w,ws:{slot:0,guns:[{id:w.id,mag:8}],reloading:false,prevFire:false,wind:0,switchT:0,plateT:0,cd:0}}});
const helpers={eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_o,_d,_b,max)=>max};
const input={forward:true,fire:false,aim:false,slot:-1};
test('all 75 catalogued weapons have finite ADS/hip coverage in expected order',()=>{
 let count=0;
 for(const w of Object.values(WEAPONS)){
  if(w.unarmed||w.skillWeapon||w.noLoot)continue;
  const hip=adsConeCoverage(w,15),ads=adsConeCoverage(w,15,true);
  assert.ok(hip>=0&&hip<=1&&ads>=0&&ads<=1,`invalid ${w.id}`);
  assert.ok(ads>=hip-1e-9,`unexpected spread relation ${w.id}`);
  count++;
 }
 assert.ok(count>=70);
});
test('M4A1 keeps mobility in near combat but scopes in for distant precision',()=>{
 const w=WEAPONS.m4a1;
 assert.equal(decideAutopilotAds(w,7,input,t(7)).aim,false);
 assert.equal(decideAutopilotAds(w,35,input,t(35)).aim,true);
 assert.equal(autoFireInput(g(w),input,t(7),helpers,{}).fire,true);
 assert.equal(autoFireInput(g(w),input,t(7),helpers,{}).aim,false);
});
test('shotgun hip-fires near; switches to ADS for outer reach',()=>{
 const w=WEAPONS.benelli_m4;
 assert.equal(decideAutopilotAds(w,9,input,t(9)).aim,false);
 assert.equal(decideAutopilotAds(w,19,input,t(19)).aim,true);
});
test('sniper and DMR scope in when needed; true point blank can hip-fire',()=>{
 assert.equal(decideAutopilotAds(WEAPONS.l115a3,80,input,t(80)).aim,true);
 assert.equal(decideAutopilotAds(WEAPONS.svt40,55,input,t(55)).aim,true);
 assert.equal(decideAutopilotAds(WEAPONS.l115a3,2,input,t(2)).aim,false);
});
test('equal hip/ADS spread weapon never slows movement for useless scope',()=>{
 const w=WEAPONS.m134;
 assert.equal(decideAutopilotAds(w,55,input,t(55)).aim,false);
});
test('emergency slide and grenade always interrupt ADS, but do not forcibly prohibit hip-fire',()=>{
 const w=WEAPONS.m4a1;
 const d=decideAutopilotAds(w,48,{...input,slide:true},t(48));
 assert.equal(d.aim,false);
 assert.equal(decideAutopilotAds(w,48,{...input,throw:true},t(48)).aim,false);
 assert.equal(autoFireInput(g(w),{...input,slide:true},t(7),helpers,{}).fire,true);
});
test('ADS hysteresis resists 60Hz stance flicker while permitting distance-based precision',()=>{
 const w=WEAPONS.m4a1, mem={};
 assert.equal(decideAutopilotAds(w,7,input,t(7),{},mem,1).aim,false);
 assert.equal(decideAutopilotAds(w,22,input,t(7),{},mem,1.02).aim,true);
 assert.equal(decideAutopilotAds(w,7,input,t(7),{},mem,1.03).aim,true);
 assert.equal(decideAutopilotAds(w,7,input,t(7),{},mem,1.30).aim,false);
});
test('legacy ADS mode reproduces old fixed thresholds; options normalise consistently',()=>{
 const options=normaliseOptions({adaptiveADS:false});
 assert.equal(options.adaptiveADS,false);
 assert.equal(normaliseOptions({}).adaptiveADS,true);
 assert.equal(decideAutopilotAds(WEAPONS.m4a1,12,input,t(12),options).aim,true);
 assert.equal(decideAutopilotAds(WEAPONS.m4a1,12,input,t(12),{adaptiveADS:true}).aim,false);
});
test('no ADS or fire through solid occlusion or while gun is reloading',()=>{
 const w=WEAPONS.m4a1,game=g(w);
 assert.equal(autoFireInput(game,input,{...t(35),hitboxVisible:false},{...helpers,rayWorld:()=>1},{adaptiveADS:true}).fire,false);
 game.local.ws.reloading=true;
 const sampled=autoFireInput(game,input,t(35),helpers,{adaptiveADS:true});
 assert.equal(sampled.fire,false);assert.equal(sampled.aim,false);
});
