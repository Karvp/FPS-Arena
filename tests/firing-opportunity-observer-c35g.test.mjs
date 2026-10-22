import test from 'node:test';import assert from 'node:assert/strict';
import {FiringOpportunityObserverC35G} from '../lab/arena/firing-opportunity-observer-c35g.mjs';
const mk=(policy='shadow80')=>new FiringOpportunityObserverC35G({matchId:'test-c35g',policy});
const p=(extra={})=>({alive:true,down:false,frozen:false,air:false,ws:{slot:0,guns:[{id:'m4a1',mag:25}],cd:0,reloading:false,plateT:0,switchT:0,wind:0},...extra});
const run=(a,now,orig,out,player,n0,n1,motor=false)=>{
 a.beforeStep({now,incumbent:orig,applied:out,player,serverShots:n0,motorActive:motor});
 a.afterStep({serverShots:n1});
};
test('reports immutable incumbent fire, final fire and authoritative server shots separately',()=>{
 const a=mk();const orig={fire:true,right:true},applied={...orig,left:true,right:false};
 run(a,1,orig,applied,p(),0,1,true);
 const r=a.finish({serverShots:1});
 assert.equal(r.counts.fireSuppressionTicks,0);assert.equal(r.counts.incumbentFireTicks,1);
 assert.equal(r.counts.appliedFireTicks,1);assert.equal(r.counts.serverShots,1);
 assert.equal(r.counts.motorWithAppliedFireTicks,1);
 assert.equal(r.counts.movementModifiedTicks,1);
 assert.equal(r.rows[0].ready,1);
 assert.deepEqual(orig,{fire:true,right:true});
});
test('records potential input-ready ticks without claiming target or fired shot',()=>{
 const a=mk();run(a,0,{}, {},p(),0,0);
 run(a,1/60,{fire:true},{fire:true},p({ws:{slot:0,guns:[{id:'m4a1',mag:25}],cd:2,reloading:false,plateT:0,switchT:0,wind:0}}),0,0);
 const r=a.finish({serverShots:0});assert.equal(r.counts.readyWithoutAppliedFireTicks,1);
 assert.equal(r.counts.serverShots,0);assert.equal(r.counts.readyAndAppliedFireTicks,0);
});
test('research must never suppress or inject incumbent fire',()=>{
 const a=mk();run(a,1,{fire:true},{fire:false},p(),0,0);
 assert.throws(()=>a.finish({serverShots:0}),/priority fire input changed/);
});
test('detects nonmonotonic clocks, overlapping frames and server shot regressions',()=>{
 const a=mk();assert.throws(()=>a.afterStep({serverShots:0}),/without before/);
 a.beforeStep({now:1,incumbent:{},applied:{},player:p(),serverShots:0,motorActive:false});
 assert.throws(()=>a.beforeStep({now:2,incumbent:{},applied:{},player:p(),serverShots:0,motorActive:false}),/not closed/);
 assert.throws(()=>a.afterStep({serverShots:-1}),/shot regression/);
 a.afterStep({serverShots:0});
 assert.throws(()=>a.beforeStep({now:1,incumbent:{},applied:{},player:p(),serverShots:0,motorActive:false}),/nonmonotonic/);
 assert.throws(()=>a.finish({serverShots:1}),/reconciliation/);
});
test('rejects unsupported policy, handles reloading, ammo and missing server state',()=>{
 assert.throws(()=>mk('predictive80'),/valid match/);
 const a=mk('stagger80');
 run(a,1,{}, {},p({ws:{slot:0,guns:[{id:'m4a1',mag:0}],cd:0,reloading:true}}),0,0);
 run(a,2,{}, {},p({alive:false}),0,0);
 assert.equal(a.finish({serverShots:0}).counts.readyProxyTicks,0);
});
