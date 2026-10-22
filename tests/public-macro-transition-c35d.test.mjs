import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicMacroTransitionRecorderC35D,priorityC35D} from '../lab/arena/public-macro-transition-c35d.mjs';
const make=()=>new PublicMacroTransitionRecorderC35D({matchId:'m',setupId:'s',seed:101,seconds:3,horizonMs:120,sampleEveryMs:100});
test('priority is derived only from original command',()=>{
 assert.equal(priorityC35D({fire:true}),true);
 assert.equal(priorityC35D({slot:0}),true);
 assert.equal(priorityC35D({aim:true,forward:true}),false);
});
test('future priority is LABEL, cannot appear in predecision feature object',()=>{
 const r=make();r.observe(0,{});const raw=structuredClone(r.pending[0].features);
 r.observe(20,{});r.observe(50,{fire:true});r.observe(100,{});r.observe(130,{});
 assert.equal(r.rows[0].futurePriority,1);assert.deepEqual(r.rows[0].features,raw);
 assert.deepEqual(Object.keys(raw).sort(),['aim','moving','priorityEdges1000','priorityFraction500','quietMs'].sort());
});
test('future at t=0 is not counted as future, boundary t=120 included',()=>{
 const r=make();r.observe(0,{});r.observe(120,{reload:true});assert.equal(r.rows[0].futurePriority,1);
});
test('right censor pending horizons, never silently label zero',()=>{
 const r=make();r.observe(0,{});r.observe(35,{});
 const data=r.finish();assert.equal(data.complete,0);assert.equal(data.censored,1);assert.equal(data.rows.length,0);
});
test('all quiet complete horizon truly negative',()=>{
 const r=make();for(let i=0;i<=15;i++)r.observe(i*20,{});
 const data=r.finish();assert.equal(data.rows[0].futurePriority,0);assert.ok(data.complete>=2);
});
test('fails nonmonotone time and malformed commands',()=>{
 const r=make();r.observe(100,{});assert.throws(()=>r.observe(50,{}),/clock/);
 assert.throws(()=>r.observe(200,null),/command/);
});
test('observer does not modify or clone commands',()=>{
 const r=make();const cmd={forward:true,aim:true};assert.equal(r.observe(0,cmd),cmd);
});
test('observations use bounded history not future values',()=>{
 const r=make();for(let i=0;i<500;i++)r.observe(i*16.67,i%17===0?{fire:true}:{});
 assert.ok(r.history.length<=65);assert.equal(r.finish().rows.length>0,true);
});
