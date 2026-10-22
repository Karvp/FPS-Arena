import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OpportunityPreservingShadowC35E} from '../lab/arena/opportunity-preserving-shadow-c35e.mjs';
import {MacroMicroIntegrationC35C} from '../lab/arena/macro-micro-integration-c35c.mjs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const model=JSON.parse(readFileSync(new URL('../reports/c35d2/FROZEN-FORECAST.json',import.meta.url),'utf8'));
const opts={seed:35370011,map:'arena',loadout:'m4a1',lagMs:65,matchId:'shadow-unittest',registrationSHA256:'a'.repeat(64),setupId:'shadow-setup'};
function fake(now){return {pos:{x:2,y:0,z:30},local:{id:'trainee',team:'red',hp:100,armor:50,maxArmor:50,alive:true,mv:{vx:1,vz:1,onGround:true,y:0,stance:0},weapon:{id:'m4a1',magSize:30},ws:{slot:0,guns:[{id:'m4a1',mag:30}]}},remotes:{list:[{id:'bot2',team:'blue',alive:true,pos:{x:3,y:0,z:65},yaw:.3,data:{w:'aa12'},buf:[{t:now-.16,x:3,z:65},{t:now-.065,x:3,z:65}]}]},rig:{yaw:0},map:{bound:150,boxes:[]}};}
test('rejects unsupported policy and missing frozen model',()=>{
 assert.throws(()=>new OpportunityPreservingShadowC35E({...opts,policy:'legacy80',forecastModel:model}),/shadow80/);
 assert.throws(()=>new OpportunityPreservingShadowC35E({...opts,policy:'shadow80'}),/frozen/);
});
test('exact legacy80 command parity at every tick including busy, shooting, C16 veto',()=>{
 const legacy=new MacroMicroIntegrationC35C({...opts,policy:'legacy80'}),
       shadow=new OpportunityPreservingShadowC35E({...opts,policy:'shadow80',forecastModel:model});
 const commands=[];
 for(let i=0;i<330;i++){
  const now=2+i/60,c=fake(now);
  const cmd=i%45===0?{fire:true}:i%71===0?{reload:true}:i%58===0?{aim:true,left:true}:{aim:true};
  assert.deepEqual(shadow.command(now,c,cmd),legacy.command(now,c,cmd));
 }
 const a=legacy.finish(7.49),b=shadow.finish(7.49);
 assert.deepEqual(a.diagnostics,b.diagnostics);
 assert.deepEqual(a.offers,b.offers);
 assert.deepEqual(a.c35c,b.c35c);
 assert.equal(b.c35e.rows.length,b.c35c.preoffers.length);
 assert.equal(b.c35e.rows.length,b.c35e.complete+b.c35e.censored);
 assert.equal(b.metadata.policy,'shadow80');
 for(let i=0;i<b.offers.length;i++)assert.equal(b.offers[i].assignedAction,assignedActionC21(opts.seed,i+1));
});
test('future-label time horizon, present-only forecast, and trailing censoring',()=>{
 const x=new OpportunityPreservingShadowC35E({...opts,policy:'shadow80',forecastModel:model});
 for(let i=0;i<113;i++)x.command(2+i/60,fake(2+i/60),i===6?{fire:true}:{});
 const out=x.finish(3.88);
 assert.ok(out.c35e.complete>0&&out.c35e.censored>0);
 const first=out.c35e.rows.find(z=>z.tMs===2000);
 assert.equal(first.futurePriority,true);
 assert.equal(first.futurePriorityEdge,true);
 const last=out.c35e.rows.find(z=>!z.complete);
 assert.equal(last.futurePriority,null);
 assert.equal(last.futurePriorityEdge,null);
 assert.ok(out.c35e.rows.every(z=>z.forecastRisk>=0&&z.forecastRisk<=1));
 assert.ok(out.c35e.rows.every(z=>z.source==='predecision-incumbent-command-only'));
});
test('rejects nonmonotonic clock',()=>{
 const x=new OpportunityPreservingShadowC35E({...opts,policy:'shadow80',forecastModel:model});
 x.command(3,fake(3),{});
 assert.throws(()=>x.command(2.99,fake(2.99),{}),/nonmonotonic/);
});
