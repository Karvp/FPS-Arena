import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseOptions,acquireCombatTarget} from '../aim-core.mjs';
import {applyProStance,autoFireInput} from '../combat-core.mjs';
import {newMoveState,stepMove} from './fixtures/game-shared/movement.js';
import {DT,MOVE} from './fixtures/game-shared/constants.js';
import {rayWorld} from './fixtures/game-shared/geometry.js';

const cfg=normaliseOptions({enabled:true,mode:'autopilot',proMovement:true,autoSlide:true,autoCrouch:true,evasiveCrouch:true,fastAim:true});
const h={rayWorld,eyeHeightOf:()=>1.6,leanOffset:.35,player:{headYs:[1.62,1.15,.55],bodyH:[1.4,.95,.5],slideHeadY:1.02,slideBodyHeight:.9}};
function game(){return {running:true,phase:'match',net:{id:'me'},you:{tm:0},
  pos:{x:0,y:0,z:0},map:{boxes:[],bound:68},modeState:{type:'tdm'},
  input:{locked:true,enabled:true},rig:{yaw:0,pitch:0},remotes:{list:[]},bremotes:{list:[]},zremotes:{list:[]},
  local:{alive:true,hp:100,mv:newMoveState(),weapon:{id:'rifle',auto:true,magSize:30,cat:'Assault Rifle',range:[25,80],maxRange:200,spreadHip:2,spreadAds:.2,adsMove:.7},
    ws:{slot:0,guns:[{id:'rifle',mag:20,reserve:80},{id:'pistol',mag:8,reserve:30}],cd:0,reloading:false,wind:0,plateT:0,switchT:0}}};}
const sample={forward:true,backward:false,left:false,right:false,aim:false,fire:false,prone:false,jump:false,reload:false,plate:false,use:false,interact:false,crouch:false,slide:false,lean:0,slot:-1};
const enemy=(id,x,z)=>({id,alive:true,team:1,pos:{x,y:0,z},stance:0,sliding:false,data:{hp:100,pitch:0,aim:1}});
test('fast acquisition prioritizes visible opponent over closer occluded opponent',()=>{
 const g=game();g.remotes.list=[enemy('behind',0,-8),enemy('open',7,-14)];
 const wall={x0:-1,x1:1,y0:0,y1:3,z0:-6,z1:-3};g.map.boxes=[wall];
 const target=acquireCombatTarget(g,cfg,h,'p:behind');
 assert.equal(target.id,'p:open');assert.equal(target.visible,true);
 g.remotes.list=[enemy('behind',0,-8)];
 const fallback=acquireCombatTarget(g,cfg,h);assert.equal(fallback.visible,false);
});
test('fast acquisition yields shot in same tick once rig yaw and pitch match target',()=>{
 const g=game();g.remotes.list=[enemy('right',10,-12)];
 const t=acquireCombatTarget(g,cfg,h);assert.ok(t.visible);
 g.rig.yaw=t.yaw;g.rig.pitch=t.pitch;
 const out=autoFireInput(g,sample,t,h,cfg);
 assert.equal(out.fire,true);assert.equal(out.aim,true);
});
test('evasive crouch is brief and can remain firing+ADS; does not hold slow stance forever',()=>{
 const g=game(),st={};const threat={x:1,z:0,reason:'dodge-threat',emergency:true,sprint:false};
 let out=applyProStance(g,{...sample,fire:true,aim:true},threat,10,st,cfg,h,{autonomous:true});
 assert.equal(out.crouch,true);assert.equal(out.fire,true);assert.equal(out.aim,true);
 stepMove(g.local.mv,{...out,yaw:0,pitch:0},DT,1,g.map);assert.equal(g.local.mv.stance,1);
 out=applyProStance(g,{...sample,fire:true,aim:true},threat,10.2,st,cfg,h,{autonomous:true});assert.equal(out.crouch,true);
 out=applyProStance(g,{...sample,fire:true,aim:true},threat,10.4,st,cfg,h,{autonomous:true});assert.equal(out.crouch,false);
});
test('critical dodge sacrifices one firing tick for safe slide and resumes firing in slide state',()=>{
 const g=game(),st={},threat={x:0,z:-1,reason:'dodge-threat',emergency:true,sprint:true};
 const init=applyProStance(g,{...sample,fire:true,aim:true},threat,5,st,cfg,h,{autonomous:true,critical:true});
 assert.equal(init.fire,false);assert.equal(init.aim,false);assert.equal(init.crouch,true);assert.equal(init.slide,true);
 stepMove(g.local.mv,{...init,yaw:0,pitch:0},DT,1,g.map);
 assert.ok(g.local.mv.slideT>0);
 const next=applyProStance(g,{...sample,fire:true,aim:true},threat,5+DT,st,cfg,h,{autonomous:true,critical:true});
 assert.equal(next.fire,true);assert.equal(next.crouch,false);
});
test('critical slide is blocked while plating, crouching, near collision and at map boundary',()=>{
 const threat={x:0,z:-1,reason:'dodge-threat',emergency:true,sprint:true};
 for(const kind of ['plate','cover','crouch','boundary']){
  const g=game();if(kind==='plate')g.local.ws.plateT=2;
  if(kind==='cover')g.map.boxes=[{x0:-1,x1:1,y0:0,y1:3,z0:-4,z1:-3}];
  if(kind==='crouch')g.local.mv.stance=1;
  if(kind==='boundary')g.map.bound=4.5;
  const out=applyProStance(g,{...sample,fire:true,aim:true},threat,5,{},cfg,h,{autonomous:true,critical:true});
  assert.equal(out.slide,false,kind);assert.equal(out.fire,true,kind);
 }
});
test('assisted/manual mode leaves user inputs unaltered',()=>{
 const g=game();const raw={...sample,crouch:true,fire:true};
 const out=applyProStance(g,raw,{x:1,z:0,emergency:true},1,{},cfg,h,{autonomous:false});
 assert.deepEqual(out,raw);
});
test('zombie kiting slide only if exit increases distance from EVERY close zombie',()=>{
  const g=game();g.modeState.type='zm';g.zremotes.list=[enemy('chaser',0,5)];
  let p={x:0,z:-1,reason:'zombie-kite',sprint:true};
  const o=applyProStance(g,{...sample,fire:true,aim:true},p,10,{},cfg,h,{autonomous:true});
  assert.equal(o.slide,true);assert.equal(o.fire,false);
  g.zremotes.list.push(enemy('in-path',0,-5));
  const n=applyProStance(g,{...sample,fire:true,aim:true},p,10,{},cfg,h,{autonomous:true});
  assert.equal(n.slide,false);assert.equal(n.fire,true);
});
