import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OpportunityConstrainedSchedulerC35F} from '../lab/arena/opportunity-constrained-scheduler-c35f.mjs';
import {OpportunityPreservingShadowC35E} from '../lab/arena/opportunity-preserving-shadow-c35e.mjs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const saved=JSON.parse(readFileSync(new URL('../reports/c35d2/FROZEN-FORECAST.json',import.meta.url),'utf8'));
const model=(intercept)=>({...saved,weights:[intercept,0,0,0,0,0]});
const opts={seed:35370011,map:'arena',loadout:'m4a1',lagMs:65,matchId:'c35f-unit',registrationSHA256:'d'.repeat(64),setupId:'f-unit'};
function fake(now){return {pos:{x:2,y:0,z:30},local:{id:'trainee',team:'red',hp:100,armor:50,maxArmor:50,alive:true,mv:{vx:1,vz:1,onGround:true,y:0,stance:0},weapon:{id:'m4a1',magSize:30},ws:{slot:0,guns:[{id:'m4a1',mag:30}]}},remotes:{list:[{id:'bot2',team:'blue',alive:true,pos:{x:3,y:0,z:65},yaw:.3,data:{w:'aa12'},buf:[{t:now-.16,x:3,z:65},{t:now-.065,x:3,z:65}]}]},rig:{yaw:0},map:{bound:150,boxes:[]}};}
function make(seed,intercept=10){return new OpportunityConstrainedSchedulerC35F({...opts,seed,policy:'stagger80',forecastModel:model(intercept)});}
function base(seed,intercept=10){return new OpportunityPreservingShadowC35E({...opts,seed,policy:'shadow80',forecastModel:model(intercept)});}
test('rejects invalid policy, model and backwards timestamps',()=>{
 assert.throws(()=>new OpportunityConstrainedSchedulerC35F({...opts,policy:'shadow80',forecastModel:model(10)}),/stagger80/);
 assert.throws(()=>new OpportunityConstrainedSchedulerC35F({...opts,policy:'stagger80'}),/frozen/);
 const s=make(35370011);s.command(2,fake(2),{});assert.throws(()=>s.command(1,fake(1),{}),/nonmonotonic/);
});
test('low public predicted risk is exactly shadow80 including randomized offers',()=>{
 const a=base(35370011,-10),b=make(35370011,-10);
 for(let i=0;i<320;i++){const now=2+i/60;const c=fake(now);const cmd=i%37===0?{fire:true}:{aim:true};assert.deepEqual(b.command(now,c,cmd),a.command(now,c,cmd));}
 const x=a.finish(7.32),y=b.finish(7.32);
 assert.deepEqual(y.offers.map(o=>[o.offerId,o.executedTicks,o.interrupted]),x.offers.map(o=>[o.offerId,o.executedTicks,o.interrupted]));
 assert.equal(y.c35f.delayedMicro,0);assert.equal(y.diagnostics.interventionTicks,x.diagnostics.interventionTicks);
 assert.deepEqual(y.c35e.rows,x.c35e.rows);
});
test('high risk defers exactly first tick, then C16 rechecks and recovers; no lost assignment',()=>{
 const seed=Array.from({length:150},(_,i)=>i+500).find(s=>assignedActionC21(s,1)!=='baseline');
 const a=base(seed),b=make(seed);
 const cmd={aim:true}; const c=fake(2);
 const immediate=a.command(2,c,cmd),deferred=b.command(2,c,cmd);
 assert.deepEqual(deferred,cmd,'original incumbent command must survive');
 assert.equal(a.offers[0].executedTicks,1);assert.equal(b.offers[0].executedTicks,0);
 assert.ok(Math.abs(b.activeUntil-a.activeUntil-1/60)<1e-10);
 assert.equal(b.c35fDecisions[0].action,a.offers[0].assignedAction);
 assert.equal(b.c35fDecisions[0].deferralTicks,1);
 for(let i=1;i<=6;i++){const now=2+i/60;a.command(now,fake(now),cmd);b.command(now,fake(now),cmd);}
 const ar=a.finish(2.2),br=b.finish(2.2);
 assert.equal(br.offers.length,ar.offers.length);assert.equal(br.offers[0].assignedAction,ar.offers[0].assignedAction);
 assert.equal(br.offers[0].executedTicks,ar.offers[0].executedTicks);
 assert.equal(br.c35f.delayedMicro,1);assert.equal(br.c35f.deferredMotorTicks,1);
 assert.equal(br.diagnostics.interventionTicks,br.c35f.deliveredMicroTicks);
});
test('C16 priority blocks deferred tick, cannot be bypassed by scheduler',()=>{
 const seed=Array.from({length:150},(_,i)=>i+500).find(s=>assignedActionC21(s,1)!=='baseline');
 const b=make(seed);b.command(2,fake(2),{});
 assert.deepEqual(b.command(2+1/60,fake(2+1/60),{fire:true}),{fire:true});
 assert.equal(b.offers[0].executedTicks,0);
 assert.equal(b.offers[0].interrupted,true);
 const out=b.finish(2.1);assert.equal(out.c35f.delayedMicro,1);
 assert.equal(out.c35f.deliveredMicroTicks,0);
 assert.equal(out.offers[0].outcome.censored,true);
});
test('bounded stress: C21 assignments and C16 safety remain intact across 2,000 ticks',()=>{
 const seed=35370011;const b=make(seed);
 for(let i=0;i<2000;i++){
  const now=2+i/60;
  const original=i%103===0?{fire:true}:i%163===0?{reload:true}:i%47===0?{right:true,aim:true}:{aim:true};
  const out=b.command(now,fake(now),original);
  if(original.fire||original.reload)assert.deepEqual(out,original);
  if(i%103!==0&&i%163!==0)for(const k of ['fire','reload','skill','use','throw'])assert.equal(!!out[k],false);
 }
 const r=b.finish(35.4);
 assert.equal(r.c35c.offers.length,r.offers.length);
 assert.equal(r.c35f.assigned,r.offers.length);
 assert.ok(r.c35f.delayedMicro>0);
 for(let i=0;i<r.offers.length;i++){
  const o=r.offers[i]; assert.equal(o.assignedAction,assignedActionC21(seed,i+1));
  assert.ok(o.executedTicks>=0&&o.executedTicks<=5);
  if(o.c35f.deferralTicks)assert.ok(['micro-left','micro-right'].includes(o.assignedAction));
 }
 assert.equal(r.diagnostics.interventionTicks,r.c35f.deliveredMicroTicks);
});
