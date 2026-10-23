import test from 'node:test';
import assert from 'node:assert/strict';
import {V60_ARMS,V60_STRATA,V60BranchTrial,armCommandV60,publicStateV60,witnessV60} from '../lab/arena/tdm-stratified-replay-v60.mjs';
const base={forward:false,backward:false,left:false,right:false,fire:false,aim:false,ads:true,skill:false,reload:false,slot:0};
function mock(distance=50,now=10){
 return {you:{tm:'blue'},pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},local:{alive:true,hp:100,team:'blue'},
  map:{bound:100,boxes:[]},remotes:{list:[{id:'target',team:'red',alive:true,invisible:false,pos:{x:distance,y:0,z:0},buf:[{t:now-.04}]}]}};
}
test('four exact arms and three state strata',()=>{
 assert.deepEqual(V60_ARMS,['keep','close','strafe','withdraw']);
 assert.deepEqual(V60_STRATA,['range-gap','contact','under-pressure']);
});
test('public only classification: shotgun out-of-range and contact',()=>{
 assert.equal(publicStateV60(mock(50),10,base,{weapon:'aa12'}).stratum,'range-gap');
 assert.equal(publicStateV60(mock(20),10,base,{weapon:'aa12'}).stratum,'contact');
 assert.equal(publicStateV60(mock(40),10,base,{weapon:'aa12',recentDamage:true}).stratum,'under-pressure');
 assert.equal(publicStateV60(mock(50),10,{...base,fire:true},{weapon:'aa12'}).valid,false);
});
test('unknown team and stale target abstain',()=>{
 const x=mock();x.you.tm='red';assert.equal(publicStateV60(x,10,base).valid,false);
 const q=mock();q.remotes.list[0].buf=[{t:8}];assert.equal(publicStateV60(q,10,base).valid,false);
});
test('motor-only intervention and no forced fire',()=>{
 for(const arm of V60_ARMS){
  const client=mock(),features=publicStateV60(client,10,base);
  const out=armCommandV60({client,now:10,command:base,arm,features});
  for(const k of Object.keys(base))if(!['forward','backward','left','right'].includes(k))assert.equal(out.command[k],base[k]);
  if(arm==='keep')assert.deepEqual(out.command,base);
 }
 assert.throws(()=>armCommandV60({client:mock(),command:base,arm:'bad'}),/V60_BAD_ARM/);
});
test('missing collision geometry is abstention',()=>{
 const c=mock(),f=publicStateV60(c,10,base);delete c.map;
 assert.equal(armCommandV60({client:c,now:10,command:base,arm:'close',features:f}).changed,false);
});
test('seeded stagger prevents deterministic tick360 activation, stable trigger',()=>{
 const t=new V60BranchTrial({seed:0,arm:'keep',earliestTick:600,latestTick:800,confirmationSamples:2,treatmentTicks:30,outcomeTicks:40});
 for(let tick=1;tick<=606;tick++){t.beforeStep({tick,now:10,client:mock(),command:base});}
 assert.equal(t.triggerTick,606);
 assert.ok(t.prefixSHA256);
 const u=new V60BranchTrial({seed:31,arm:'keep',earliestTick:600,latestTick:1000});
 assert.notEqual(u.nextEligibleTick,t.nextEligibleTick);
});
test('all arms pre-action prefix equivalent; actions only after triggering',()=>{
 const trials=V60_ARMS.map(arm=>new V60BranchTrial({arm,seed:0,earliestTick:600,latestTick:800,confirmationSamples:2,treatmentTicks:30,outcomeTicks:40}));
 for(let tick=1;tick<=606;tick++)for(const t of trials)
  assert.deepEqual(t.beforeStep({tick,now:10,client:mock(),command:base}),base);
 assert.equal(new Set(trials.map(t=>t.prefixSHA256)).size,1);
 for(const t of trials)t.setWitness({serverSHA256:'equal',rngState:1},{kills:0,deaths:0,shots:1,hits:0,damageTaken:0});
 for(let tick=607;tick<=646;tick++)for(const t of trials){
  t.beforeStep({tick,now:10,client:mock(),command:base});
  t.afterStep({tick,kills:tick>=640?1:0,deaths:0,shots:tick>=640?3:1,hits:0,damageTaken:0});
 }
 assert.ok(trials.every(t=>t.finish().complete));
 assert.deepEqual(trials[0].finish().outcome,{kills:1,deaths:0,shots:2,hits:0,damageTaken:0});
 assert.equal(trials[0].finish().changedTicks,0);
});
test('censored or nontriggered trials are not complete',()=>{
 const t=new V60BranchTrial({arm:'keep'});
 assert.equal(t.finish().complete,false);
 assert.equal(t.finish().notTriggered,true);
});
test('independent private prestate witness changes when server state/RNG changes',()=>{
 const trainee={id:'me',x:0,z:0,hp:100},world={tick:500,now:8,phase:'match',config:{mode:'tdm'},mode:{},players:new Map([['me',trainee]])};
 const args={world,client:mock(),trainee,randomState:12},h=witnessV60(args);
 assert.deepEqual(h,witnessV60(args));
 assert.notEqual(h.serverSHA256,witnessV60({...args,world:{...world,players:new Map([['me',{...trainee,hp:90}]])}}).serverSHA256);
 assert.notEqual(h.rngState,witnessV60({...args,randomState:13}).rngState);
});
