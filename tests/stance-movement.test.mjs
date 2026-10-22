import test from 'node:test';
import assert from 'node:assert/strict';
import {applyProStance, safeDirection} from '../combat-core.mjs';
import {normaliseOptions} from '../aim-core.mjs';
import {newMoveState, stepMove} from './fixtures/game-shared/movement.js';
import {rayWorld} from './fixtures/game-shared/geometry.js';
import {DT, MOVE, STANCE_SPEED} from './fixtures/game-shared/constants.js';

const helpers={rayWorld,eyeHeightOf:()=>1.6};
const cfg=normaliseOptions({enabled:true,mode:'autopilot',proMovement:true,autoSlide:true,autoCrouch:true});
const travel={x:0,z:-1,reason:'pro-rotate',sprint:true};
const crouch={x:0,z:0,reason:'pro-hold-sightline',crouch:true};
const sample={forward:true,backward:false,left:false,right:false,jump:false,fire:false,aim:false,reload:false,plate:false,use:false,slot:-1};
function setup(boxes=[],bound=68){
 const mv=newMoveState();
 return {local:{mv,alive:true,hp:100,ws:{plateT:0}},map:{boxes,bound},modeState:{type:'tdm'},zremotes:{list:[]}};
}
const advance=(g,input) => stepMove(g.local.mv,{...sample,...input,yaw:0,pitch:0},DT,1,g.map);
test('real shared/stepMove: slide activates on a SINGLE rising crouch edge while running',()=>{
 const g=setup(),state={};
 let i=applyProStance(g,sample,travel,2,state,cfg,helpers);
 assert.equal(i.crouch,true);assert.equal(i.slide,true);
 advance(g,i);
 assert.ok(g.local.mv.slideT>0);assert.equal(g.local.mv.stance,0);
 assert.ok(g.local.mv.vz < -MOVE.speed);
 i=applyProStance(g,sample,travel,2+DT,state,cfg,helpers);
 assert.equal(i.crouch,false);assert.equal(i.slide,false);
 advance(g,i);
 assert.equal(g.local.mv.slidePrev,false);
 for(let n=2;n<35;n++)advance(g,applyProStance(g,sample,travel,2+n*DT,state,cfg,helpers));
 assert.equal(g.local.mv.slideT,0);
 assert.equal(g.local.mv.stance,0);
 // Bot-level cooldown prevents another slide immediately after game cooldown.
 g.local.mv.slideCd=0;
 const noRepeat=applyProStance(g,sample,travel,2+.8,state,cfg,helpers);
 assert.equal(noRepeat.crouch,false);
 assert.equal(noRepeat.slide,false);
 const repeated=applyProStance(g,sample,travel,4.2,state,cfg,helpers);
 assert.equal(repeated.crouch,true);
});
test('shared/stepMove: crouch stays active while scoped or firing, rises when leaving cover',()=>{
 const g=setup(),state={};
 let i=applyProStance(g,{...sample,forward:false,fire:true,aim:true},crouch,5,state,cfg,helpers);
 assert.equal(i.crouch,true);
 advance(g,i);
 assert.equal(g.local.mv.stance,1);
 assert.equal(g.local.mv.slideT,0);
 for(let n=1;n<25;n++){
   i=applyProStance(g,{...sample,forward:false,fire:true,aim:true},crouch,5+n*DT,state,cfg,helpers);
   advance(g,i);
 }
 assert.equal(g.local.mv.stance,1);
 const escape=applyProStance(g,{...sample,fire:false,aim:false},travel,6,state,cfg,helpers);
 assert.equal(escape.crouch,false);
 advance(g,escape);
 assert.equal(g.local.mv.stance,0);
 assert.ok(STANCE_SPEED[1] < STANCE_SPEED[0]);
});
test('no slide into a solid obstacle within locked travel distance',()=>{
 const g=setup([{x0:-2,x1:2,y0:0,y1:2,z0:-4,z1:-3.5}]);
 assert.equal(safeDirection(g,0,-1,helpers,6.5),false);
 assert.equal(applyProStance(g,sample,travel,2,{},cfg,helpers).crouch,false);
});
test('no slide near boundary, in mid-air, in prone, while aiming/firing/reloading/plating',()=>{
 const g=setup([],4.5);
 const bad=()=>applyProStance(g,sample,travel,3,{},cfg,helpers);
 assert.equal(bad().slide,false);
 g.map.bound=68;
 for (const changed of [
  {fire:true}, {aim:true}, {reload:true}, {plate:true}, {jump:true}, {backward:true,forward:false},
  {use:true}, {interact:true}, {prone:true}
 ]) {
   assert.notEqual(applyProStance(g,{...sample,...changed},travel,3,{},cfg,helpers).slide,true,JSON.stringify(changed));
 }
 g.local.mv.onGround=false;
 assert.equal(bad().slide,false);
 g.local.mv.onGround=true;g.local.mv.stance=2;
 assert.equal(bad().slide,false);
 g.local.mv.stance=0;g.local.ws.plateT=2;
 assert.equal(bad().slide,false);
});
test('crouch is configurable, Assist mode never overrides manual stance input',()=>{
 const g=setup();
 assert.equal(applyProStance(g,sample,crouch,1,{}, {...cfg,autoCrouch:false},helpers).crouch,false);
 assert.equal(applyProStance(g,sample,travel,1,{}, {...cfg,autoSlide:false},helpers).slide,false);
 assert.equal(applyProStance(g,sample,travel,1,{},cfg,helpers,{autonomous:false}).slide,undefined);
 assert.equal(applyProStance(g,{...sample,crouch:true},travel,1,{},cfg,helpers).crouch,true);
 assert.equal(normaliseOptions({autoSlide:false,autoCrouch:false}).autoSlide,false);
 assert.equal(normaliseOptions({autoSlide:false,autoCrouch:false}).autoCrouch,false);
});
test('slide escapes zombies only with safe exit and respects loot interaction distance',()=>{
 const g=setup();g.modeState.type='zm';g.zremotes.list=[{alive:true,pos:{x:2,y:0,z:2}}];
 assert.equal(applyProStance(g,sample,{...travel,reason:'zombie-kite'},3,{},cfg,helpers).slide,true);
 g.zremotes.list=[{alive:true,pos:{x:2,y:0,z:-2}}];
 assert.equal(applyProStance(g,sample,{...travel,reason:'zombie-kite'},3,{},cfg,helpers).slide,false);
 g.zremotes.list=[{alive:true,pos:{x:20,y:0,z:20}}];
 assert.equal(applyProStance(g,sample,{...travel,reason:'zombie-kite'},3,{},cfg,helpers).slide,true);
 assert.equal(applyProStance(g,sample,{...travel,reason:'loot-travel',goal:{x:0,z:-7}},3,{},cfg,helpers).slide,false);
 assert.equal(applyProStance(g,sample,{...travel,reason:'loot-travel',goal:{x:0,z:-25}},3,{},cfg,helpers).slide,true);
});
test('an active slide releases automatic crouch on next tick instead of crouching afterward',()=>{
 const g=setup(),st={};g.local.mv.slideT=.3;g.local.mv.slidePrev=true;
 assert.equal(applyProStance(g,sample,travel,5,st,cfg,helpers).crouch,false);
 assert.equal(applyProStance(g,{...sample,crouch:true},travel,5,st,cfg,helpers).crouch,true);
});
