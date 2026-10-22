import test from 'node:test';import assert from 'node:assert/strict';
import {PhysicalOptionAuditC35AI} from '../lab/arena/physical-option-audit-c35ai.mjs';
const move={forward:true,backward:false,left:false,right:false,fire:false,aim:true};
const side={...move,forward:false,right:true};
const row=(arm='option-a')=>({index:1,assignedArm:arm,propensity:arm==='incumbent'?.5:.25,start:0,modifiedTicks:arm==='incumbent'?0:1,interruptions:0,factual:{complete:true}});
const c=()=>new PhysicalOptionAuditC35AI({matchId:'m',setupId:'s',weapon:'m4a1'});
test('C35AI authoritative displacement after step, and changed-command accounting',()=>{
 const o=c(),p={x:0,y:0,z:0};o.beforeStep({now:0,optionRows:[row()],activeOptionIndex:1,incumbent:move,applied:side,player:p});
 p.x=.15;o.afterStep({now:0,player:p});const out=o.finish({optionRows:[row()],optionCounts:{offers:1}});
 assert.equal(out.rows[0].measure.modifiedCommandTicks,1);assert.equal(out.rows[0].measure.realizedMovingTicks,1);
 assert.equal(out.rows[0].measure.travelMeters,.15);assert.equal(out.rows[0].allPotentialOutcomes,null);
});
test('C35AI changed motor command need not produce physical movement',()=>{
 const o=c(),p={x:0,y:0,z:0};o.beforeStep({now:0,optionRows:[row()],activeOptionIndex:1,incumbent:move,applied:side,player:p});
 o.afterStep({now:0,player:p});const v=o.finish({optionRows:[row()],optionCounts:{offers:1}});
 assert.equal(v.rows[0].measure.modifiedCommandTicks,1);assert.equal(v.rows[0].measure.stalledMotorTicks,1);
 assert.equal(v.rows[0].measure.realizedMovingTicks,0);
});
test('C35AI records control assignment without mutation',()=>{
 const o=c(),p={x:0,y:0,z:0},r=row('incumbent');o.beforeStep({now:0,optionRows:[r],activeOptionIndex:1,incumbent:move,applied:move,player:p});
 p.z=.2;o.afterStep({now:0,player:p});assert.equal(o.finish({optionRows:[r],optionCounts:{offers:1}}).rows[0].measure.travelMeters,.2);
});
test('C35AI excludes teleport while retaining reason and assignment',()=>{
 const o=c(),p={x:0,y:0,z:0},r=row('incumbent');o.beforeStep({now:0,optionRows:[r],activeOptionIndex:1,incumbent:move,applied:move,player:p});
 p.z=100;o.afterStep({now:0,player:p});const v=o.finish({optionRows:[r],optionCounts:{offers:1}});
 assert.equal(v.rows[0].measure.teleportTicks,1);assert.equal(v.rows[0].measure.travelMeters,0);
});
test('C35AI captures inertia when inputs no longer request motion',()=>{
 const o=c(),p={x:0,y:0,z:0},r=row('incumbent');o.beforeStep({now:0,optionRows:[r],activeOptionIndex:1,incumbent:{},applied:{},player:p});
 p.x=.1;o.afterStep({now:0,player:p});assert.equal(o.finish({optionRows:[r],optionCounts:{offers:1}}).rows[0].measure.momentumTravelMeters,.1);
});
test('C35AI rejects mismatched source option change and missing truthful step',()=>{
 const o=c(),p={x:0,y:0,z:0},r={...row('option-a'),modifiedTicks:0};o.beforeStep({now:0,optionRows:[r],activeOptionIndex:1,incumbent:move,applied:side,player:p});
 assert.throws(()=>o.beforeStep({now:.01,optionRows:[r],activeOptionIndex:1,incumbent:move,applied:side,player:p}),/phase/);
 o.afterStep({now:0,player:p});assert.throws(()=>o.finish({optionRows:[r],optionCounts:{offers:1}}),/changed ticks mismatch/);
});
test('C35AI refuses bad geometry, time, options and unclosed steps',()=>{
 assert.throws(()=>new PhysicalOptionAuditC35AI({matchId:'m',setupId:'s',weapon:'m4a1',epsilonMeters:-1}),/design/);
 const o=c();assert.throws(()=>o.beforeStep({now:0,optionRows:[],activeOptionIndex:null,incumbent:move,applied:move,player:{x:NaN,y:0,z:0}}),/bad pre-step/);
 o.beforeStep({now:0,optionRows:[],activeOptionIndex:null,incumbent:move,applied:move,player:{x:0,y:0,z:0}});
 assert.throws(()=>o.finish({optionRows:[],optionCounts:{offers:0}}),/unfinished/);
 assert.throws(()=>o.afterStep({now:.1,player:{x:0,y:0,z:0}}),/phase/);
});
test('C35AI passive cohort without randomized offers has no phantom outcomes',()=>{
 const o=c(),p={x:0,y:0,z:0};for(let i=0;i<5;i++){let t=i/60;o.beforeStep({now:t,optionRows:[],activeOptionIndex:null,incumbent:move,applied:move,player:p});p.x+=.04;o.afterStep({now:t,player:p});}
 const a=o.finish({optionRows:[],optionCounts:{offers:0}});assert.equal(a.rows.length,0);assert.equal(a.summary.realizedMovingTicks,5);
});

test('C35AI tolerates rounded start at final option tick',()=>{
 const o=new PhysicalOptionAuditC35AI({matchId:'m',setupId:'s',weapon:'m4a1',doseSeconds:1.25});
 const p={x:0,y:0,z:0},r={...row(),start:.10000,modifiedTicks:2};
 for(const [now,applied] of [[.099996,side],[1.350003,side]]){
  o.beforeStep({now,optionRows:[r],activeOptionIndex:1,incumbent:move,applied,player:p});p.x+=.05;o.afterStep({now,player:p});
 }
 const v=o.finish({optionRows:[r],optionCounts:{offers:1}});
 assert.equal(v.rows[0].measure.modifiedCommandTicks,2);
});

test('C35AI explicit active index owns last tick despite timestamp rounding',()=>{
 const o=c(),p={x:0,y:0,z:0},r={...row(),start:0,modifiedTicks:2};
 for(const now of [0,1.266666667]){
  o.beforeStep({now,optionRows:[r],activeOptionIndex:1,incumbent:move,applied:side,player:p});
  p.z+=.1;o.afterStep({now,player:p});
 }
 assert.equal(o.finish({optionRows:[r],optionCounts:{offers:1}}).rows[0].measure.modifiedCommandTicks,2);
});
test('C35AI refuses changed movement when no matching active option',()=>{
 const o=c(),p={x:0,y:0,z:0},r=row();
 assert.throws(()=>o.beforeStep({now:0,optionRows:[r],activeOptionIndex:null,incumbent:move,applied:side,player:p}),/without active/);
 assert.throws(()=>o.beforeStep({now:1,optionRows:[r],activeOptionIndex:2,incumbent:move,applied:move,player:p}),/active option mismatch/);
});
