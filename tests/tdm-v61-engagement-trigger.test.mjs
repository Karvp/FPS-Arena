import test from 'node:test';
import assert from 'node:assert/strict';
import {V61EngagementTrial,cueV61,V61_STRATA} from '../lab/arena/tdm-engagement-trigger-v61.mjs';
const base={fire:false,aim:false,ads:false,skill:false,reload:false,forward:false,backward:false,left:false,right:false};
function client(dist=14,now=30){return {pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},you:{tm:'blue'},local:{alive:true,hp:100,team:'blue'},map:{bound:100,boxes:[]},remotes:{list:[{id:'b',team:'red',alive:true,invisible:false,pos:{x:0,y:0,z:-dist},buf:[{t:now-.01}]}]}};}
test('registered public evidence classes',()=>{assert.deepEqual(V61_STRATA,['post-fire','post-damage','aim-lock']);});
test('must have prior event or persistent aimed target',()=>{
 const c=client(),empty=cueV61(c,30,base,{weapon:'uzi'});
 assert.equal(empty.valid,false);
 const fired=cueV61(c,30,base,{weapon:'uzi',recentFireTicks:20});
 assert.equal(fired.evidence.includes('post-fire'),true);
 const damage=cueV61(c,30,base,{weapon:'uzi',recentDamageTicks:80});
 assert.equal(damage.evidence.includes('post-damage'),true);
 const aim=cueV61(c,30,{...base,ads:true},{weapon:'uzi',aimDurationTicks:19});
 assert.equal(aim.evidence.includes('aim-lock'),true);
});
test('deny stale opponent, far range or active shot',()=>{
 const c=client();c.remotes.list[0].buf[0].t=25;
 assert.equal(cueV61(c,30,base,{recentFireTicks:10}).valid,false);
 assert.equal(cueV61(client(150),30,base,{recentFireTicks:10}).valid,false);
 assert.equal(cueV61(client(),30,{...base,fire:true},{recentFireTicks:10}).valid,false);
});
test('two independent arms see same delayed post-fire trigger, prefix',()=>{
 const a=new V61EngagementTrial({arm:'keep',stratum:'post-fire',seed:31,earliestTick:900,latestTick:1550,treatmentTicks:60,outcomeTicks:90,confirmationSamples:2});
 const b=new V61EngagementTrial({arm:'strafe',stratum:'post-fire',seed:31,earliestTick:900,latestTick:1550,treatmentTicks:60,outcomeTicks:90,confirmationSamples:2});
 for(let tick=1;tick<=1500;tick++){
  const cmd=tick===990?{...base,fire:true}:base;
  const x=a.beforeStep({tick,now:30,client:client(),command:cmd});
  const y=b.beforeStep({tick,now:30,client:client(),command:cmd});
  assert.deepEqual(x,y);
  if(a.triggerTick!==null)break;
 }
 assert.equal(a.triggerTick,b.triggerTick);
 assert.notEqual(a.triggerTick,null);
 assert.equal(a.prefixSHA256,b.prefixSHA256);
 assert.equal(a.finish().triggerCue,'post-fire');
 assert.equal(a.finish().complete,false);
});
test('treatment only modifies WASD; no firing or ADS changes',()=>{
 const t=new V61EngagementTrial({arm:'strafe',stratum:'post-damage',seed:0,earliestTick:900,latestTick:1600,confirmationSamples:1});
 for(let tick=1;tick<=906;tick++){
  const c=client();c.local.hp=tick>=894?88:100;
  t.beforeStep({tick,now:30,client:c,command:base});
  if(t.triggerTick===tick)t.setWitness({serverSHA256:'x',rngState:5,tick},{kills:0,deaths:0,damageTaken:0,shots:0,hits:0});
 }
 assert.ok(t.triggerTick!==null);

 const actual=t.beforeStep({tick:t.triggerTick+1,now:30,client:client(),command:{...base,ads:true,slot:0}});
 assert.equal(actual.ads,true);assert.equal(actual.fire,false);assert.equal(actual.slot,0);
});
test('reject invalid arms and strata',()=>{
 assert.throws(()=>new V61EngagementTrial({stratum:'something'}),/V61_BAD_CONFIG/);
 assert.throws(()=>new V61EngagementTrial({arm:'rush'}),/V61_BAD_CONFIG/);
});
