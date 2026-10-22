import test from 'node:test';
import assert from 'node:assert/strict';
import {macroGoalDecision} from '../macro-goal-controller.mjs';
const base=(x=0)=>({local:{alive:true,hp:100,armor:100,mv:{x,y:0,z:0},ws:{guns:[{mag:30}],slot:0,reloading:false,plateT:0}}});
const target={id:'enemy',visible:false,point:{x:80,y:1.5,z:0}};
const advance={x:1,z:0,reason:'pro-rotate'};
const retreat={x:-1,z:0,reason:'peek-reposition-cover'};
const contacts=[{id:'enemy',x:80,y:0,z:0}];
const policy={isSafe:()=>true,exposureSafe:()=>true};
test('macro continues safe long-distance pursuit against contradictory cover actuator',()=>{
  const m={}; const r=macroGoalDecision(base(),target,advance,retreat,contacts,10,m,policy);
  assert.equal(r.reason,'macro-safe-advance');assert.equal(m.active,true);
});
test('macro does not steal visible peek/fire movement',()=>{
  assert.equal(macroGoalDecision(base(),{...target,visible:true},advance,retreat,contacts,10,{},policy),retreat);
});
test('macro only addresses opposing directives, not ordinary strafing',()=>{
  assert.equal(macroGoalDecision(base(),target,advance,{x:0,z:1,reason:'camera-peek-hide'},contacts,10,{},policy).reason,'camera-peek-hide');
});
test('macro respects hitpoints, armor, reload, empty magazine and recent damage',()=>{
  for(const property of ['hp','armor','reloading','mag']){
    const g=base(); if(property==='hp')g.local.hp=38;
    else if(property==='armor')g.local.armor=10;
    else if(property==='reloading')g.local.ws.reloading=true;
    else g.local.ws.guns[0].mag=0;
    assert.equal(macroGoalDecision(g,target,advance,retreat,contacts,10,{},policy),retreat,property);
  }
  assert.equal(macroGoalDecision(base(),target,advance,retreat,contacts,10,{}, {...policy,lastDamage:9}),retreat);
});
test('macro cancels on actual 3D exposure, obstacle, objective or emergency',()=>{
  assert.equal(macroGoalDecision(base(),target,advance,retreat,contacts,10,{}, {...policy,exposureSafe:()=>false}),retreat);
  assert.equal(macroGoalDecision(base(),target,advance,retreat,contacts,10,{}, {...policy,isSafe:()=>false}),retreat);
  for(const flag of ['emergency','rotatingRing','loot','objective'])assert.equal(macroGoalDecision(base(),target,advance,retreat,contacts,10,{}, {...policy,[flag]:true}),retreat);
});
test('macro progress watchdog releases stalled pursuit',()=>{
  const m={};assert.equal(macroGoalDecision(base(),target,advance,retreat,contacts,10,m,policy).reason,'macro-safe-advance');
  assert.equal(macroGoalDecision(base(),target,advance,retreat,contacts,11.2,m,policy),retreat);
});
test('macro progress is goal-relative, not displacement',()=>{
  const m={};macroGoalDecision(base(),target,advance,retreat,contacts,10,m,policy);
  assert.equal(macroGoalDecision(base(-2),target,advance,retreat,contacts,10.5,m,policy).reason,'macro-safe-advance');
  assert.equal(macroGoalDecision(base(-4),target,advance,retreat,contacts,11.08,m,policy),retreat);
});
test('macro resets per-target rather than holding old opponent intent',()=>{
  const m={};macroGoalDecision(base(),target,advance,retreat,contacts,10,m,policy);
  const next={...target,id:'fresh'};
  assert.equal(macroGoalDecision(base(),next,advance,retreat,contacts,11.5,m,policy).reason,'macro-safe-advance');
});
import {macroChooseHiddenGoal} from '../macro-goal-controller.mjs';
function hidden(id='p:2',x=50){return {id,point:{x,y:1.35,z:0},remote:{id:id.split(':')[1],pos:{x,y:0,z:0}},visible:false};}
const oldActor={kind:'p',id:'1',alive:true,pos:{x:80,y:0,z:0}};
test('macro target keeps valid previous hidden goal despite camera scoring jitter',()=>{
  const m={};macroChooseHiddenGoal(hidden('p:1',80),[oldActor],{x:0,z:0},10,m);
  const next=macroChooseHiddenGoal(hidden('p:2',60),[oldActor],{x:1,z:0},10.5,m);
  assert.equal(next.id,'p:1');assert.equal(next.macroRetained,true);assert.equal(next.point.x,80);
});
test('visible new enemy interrupts hidden macro immediately',()=>{
  const m={};macroChooseHiddenGoal(hidden('p:1',80),[oldActor],{x:0,z:0},10,m);
  const t={...hidden('p:2',60),visible:true};
  assert.equal(macroChooseHiddenGoal(t,[oldActor],{x:1,z:0},10.1,m),t);
  assert.equal(m.goalId,null);
});
test('expired or unavailable hidden target never persists',()=>{
  const m={};macroChooseHiddenGoal(hidden('p:1',80),[oldActor],{x:0,z:0},10,m);
  assert.equal(macroChooseHiddenGoal(hidden('p:2',60),[oldActor],{x:0,z:0},13,m).id,'p:2');
  m.goalId='p:1';m.since=13;
  assert.equal(macroChooseHiddenGoal(hidden('p:2',60),[{...oldActor,alive:false}],{x:0,z:0},13.1,m).id,'p:2');
});
test('macro target does not hold massively worse or unreachable goal',()=>{
  const m={};macroChooseHiddenGoal(hidden('p:1',80),[oldActor],{x:0,z:0},10,m);
  assert.equal(macroChooseHiddenGoal(hidden('p:2',12),[oldActor],{x:0,z:0},10.1,m).id,'p:2');
});
test('macro target uses fresh observed position, not stale cached coordinates',()=>{
  const m={};macroChooseHiddenGoal(hidden('p:1',80),[oldActor],{x:0,z:0},10,m);
  const result=macroChooseHiddenGoal(hidden('p:2',60),[{...oldActor,pos:{x:70,y:0,z:3}}],{x:1,z:0},10.1,m);
  assert.equal(result.point.x,70);assert.equal(result.point.z,3);
});
