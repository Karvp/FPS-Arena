import test from 'node:test';
import assert from 'node:assert/strict';
import {MacroMicroIntegrationC35C, PublicMacroQuietTimeC35C} from '../lab/arena/macro-micro-integration-c35c.mjs';
import {MicroActionReliabilityC35B} from '../lab/arena/micro-action-reliability-c35b.mjs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';

const make=(policy,seed=35370011)=>new MacroMicroIntegrationC35C({seed,map:'arena',loadout:'m4a1',lagMs:65,
  matchId:`trial-${policy}-${seed}`,registrationSHA256:'1'.repeat(64),policy,setupId:'mock-setup'});
const orig=(seed=35370011)=>new MicroActionReliabilityC35B({doseMs:80,seed,map:'arena',loadout:'m4a1',lagMs:65,
  matchId:`trial-legacy80-${seed}`,registrationSHA256:'1'.repeat(64)});
function client(now=2,age=.06){return {pos:{x:2,y:0,z:30},local:{id:'trainee',team:'red',hp:100,armor:50,maxArmor:50,alive:true,
  mv:{vx:1,vz:1,onGround:true,y:0,stance:0},weapon:{id:'m4a1',magSize:30},ws:{slot:0,guns:[{id:'m4a1',mag:30}]}},
  remotes:{list:[{id:'bot2',team:'blue',alive:true,pos:{x:3,y:0,z:65},yaw:.3,data:{w:'aa12'},
  buf:[{t:now-age-.1,x:3,z:66},{t:now-age,x:3,z:65}]}]},rig:{yaw:0},map:{bound:150,boxes:[]}};}

test('public macro heuristic sees only past input and fails closed until quiet history',()=>{
 const m=new PublicMacroQuietTimeC35C();
 assert.equal(m.observe(0,{fire:true}).nextPriorityEtaMs,0);
 assert.equal(m.observe(100,{}).nextPriorityEtaMs,0);
 assert.equal(m.observe(280,{}).nextPriorityEtaMs,0);
 assert.equal(m.observe(300,{}).nextPriorityEtaMs,250);
 assert.equal(m.observe(330,{reload:true}).nextPriorityEtaMs,0);
 assert.throws(()=>m.observe(320,{}),/non-monotone/);
});

test('legacy80 invokes historical C21 unchanged, identical outcome & action as C35B',()=>{
 const x=make('legacy80'),y=orig();
 for(let i=0;i<=220;i++){
  const now=2+i/60,c=client(now),cmd=i>=16&&i<20?{fire:true}:{};
  assert.deepEqual(x.command(now,c,cmd),y.command(now,c,cmd));
 }
 const r=x.finish(6),old=y.finish(6);
 assert.equal(r.offers.length,old.offers.length);
 for(let j=0;j<old.offers.length;j++){
  assert.equal(r.offers[j].assignedAction,old.offers[j].assignedAction);
  assert.equal(r.offers[j].executedTicks,old.offers[j].executedTicks);
  assert.equal(r.offers[j].interrupted,old.offers[j].interrupted);
  assert.deepEqual(r.offers[j].outcome,old.offers[j].outcome);
 }
 assert.equal(r.c35c.offers.length,r.offers.length);
 assert.ok(r.c35c.preoffers.length>=r.c35c.offers.length);
});

test('hierarchy vetoes prospective offer WITHOUT consuming C21 ordinal',()=>{
 const x=make('hierarchical80');
 x.command(2,client(2),{});
 assert.equal(x.totalEligible,0);
 assert.equal(x.offers.length,0);
 assert.equal(x.c35cPreoffers.rows()[0].predecisionReason,'macro-transition-imminent');
 for(let i=1;i<=16;i++)x.command(2+i/60,client(2+i/60),{});
 assert.equal(x.offers.length,1);
 assert.equal(x.offers[0].assignedAction,assignedActionC21(x.seed,1));
 assert.equal(x.c35cPreoffers.rows().filter(o=>o.eligible).length,1);
});

test('C16 rejection never creates offer and never changes safety',()=>{
 const x=make('hierarchical80');
 for(let i=0;i<25;i++)x.command(2+i/60,client(2+i/60),{fire:true});
 assert.equal(x.totalEligible,0);assert.equal(x.offers.length,0);
 assert.equal(x.c35cPreoffers.rows().every(o=>!o.eligible),true);
});

test('stale public snapshot blocks hierarchy; no fabricated threat bin',()=>{
 const x=make('hierarchical80');
 for(let i=0;i<30;i++)x.command(2+i/60,client(2+i/60,.2),{});
 assert.equal(x.offers.length,0);
 assert.equal(x.c35cPreoffers.rows().every(o=>o.riskBin==='unknown'),true);
});

test('censored hostile hit kept null, not converted to no hits',()=>{
 const x=make('legacy80');x.command(2,client(),{});
 const r=x.finish(2.3);
 assert.equal(r.c35c.offers.length,1);
 assert.equal(r.c35c.offers[0].complete,false);
 assert.equal(r.c35c.offers[0].outcome.hostileHits,null);
 assert.equal(r.c35c.offers[0].outcome.hitPositive,null);
});
