import test from 'node:test';
import assert from 'node:assert/strict';
import {publicFarRangeV67,V67AcquisitionTrial,V67_ARMS,V67_SCHEMA} from '../lab/arena/tdm-public-acquisition-v67.mjs';
const cmd=Object.freeze({forward:false,backward:false,left:false,right:false,
  fire:false,aim:false,ads:false,skill:false,reload:false,slot:0});
function client({dist=62,boxes=[],hp=100,stale=false}={}){
 return {pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},you:{tm:'blue'},
  local:{alive:true,hp,team:'blue'},map:{bound:115,boxes},
  remotes:{list:[{id:'red-a',team:'red',alive:true,invisible:false,
    pos:{x:0,y:0,z:-dist},buf:[{x:0,z:-dist,t:29.85},{x:0,z:-dist,t:stale?28:29.95}]}]}};
}
test('V67 far target is selected from public range without a shooting cue',()=>{
 const f=publicFarRangeV67(client(),30,'aa12',cmd);
 assert.equal(f.valid,true);
 assert.equal(f.distance,62);
 assert.equal(f.noPrivilegedState,true);
 assert.ok(f.effectiveRange>10&&f.effectiveRange<18);
 assert.equal(publicFarRangeV67(client({dist:9}),30,'aa12',cmd).valid,false);
 assert.equal(publicFarRangeV67(client({stale:true}),30,'aa12',cmd).valid,false);
 assert.equal(publicFarRangeV67(client({hp:55}),30,'aa12',cmd).valid,false);
 assert.equal(publicFarRangeV67(client(),30,'aa12',{...cmd,fire:true}).valid,false);
});
test('V67 arm aliases freeze exactly 4 matched research treatments',()=>{
 assert.deepEqual(V67_ARMS,['keep','direct','route','flank']);
 assert.throws(()=>new V67AcquisitionTrial({arm:'attack'}),/V67_BAD_CONFIG/);
 assert.throws(()=>new V67AcquisitionTrial({treatmentTicks:2000}),/V67_BAD_CONFIG/);
});
test('four arms share a pre-action trigger and Keep is strictly passive',()=>{
 const trials=V67_ARMS.map(arm=>new V67AcquisitionTrial({arm,weapon:'aa12',seed:13,
  earliestTick:650,latestTick:1050,treatmentTicks:180,outcomeTicks:300,
  sampleEvery:6,confirmationSamples:2}));
 const c=client();
 for(let tick=1;tick<950;tick++){
  const actions=trials.map(t=>t.beforeStep({tick,now:30,client:c,command:cmd}));
  for(const a of actions)assert.deepEqual(a,cmd);
  if(trials[0].triggerTick!==null)break;
 }
 assert.ok(trials[0].triggerTick>=650);
 assert.equal(new Set(trials.map(t=>t.triggerTick)).size,1);
 assert.equal(new Set(trials.map(t=>t.prefixSHA256)).size,1);
 for(const t of trials){
  t.setWitness({serverSHA256:'same',publicSHA256:'same',rngState:481,tick:t.triggerTick},
   {shots:0,hits:0,kills:0,deaths:0,damageTaken:0});
 }
 for(let tick=trials[0].triggerTick+1;tick<=trials[0].triggerTick+40;tick++){
  const actions=trials.map(t=>t.beforeStep({tick,now:30,client:c,command:cmd}));
  assert.deepEqual(actions[0],cmd);
  for(const action of actions){
   for(const key of Object.keys(cmd))
    if(!['forward','backward','left','right'].includes(key))assert.equal(action[key],cmd[key]);
  }
 }
 assert.equal(trials[0].changedTicks,0);
 assert.ok(trials[1].changedTicks>0);
 assert.ok(trials[2].pathPlans>0);
 assert.equal(trials[0].finish().schema,V67_SCHEMA);
 assert.equal(trials[0].finish().productionAllowed,false);
});
test('public map obstacle-aware router refuses invalid geometry; never changes fire',()=>{
 const blocked=[{x0:-3,x1:3,z0:-18,z1:-8,y0:0,y1:5}];
 const c=client({boxes:blocked});
 const arms=['direct','route','flank'];
 const trials=arms.map(arm=>new V67AcquisitionTrial({arm,weapon:'aa12',
  seed:4,earliestTick:650,latestTick:1000,treatmentTicks:180,outcomeTicks:300}));
 for(let tick=1;tick<=800;tick++){
  for(const t of trials)t.beforeStep({tick,now:30,client:c,command:cmd});
  if(trials[0].triggerTick)break;
 }
 assert.ok(trials[0].triggerTick);
 for(const t of trials)t.setWitness({tick:t.triggerTick,rngState:1,serverSHA256:'a'},{
  shots:0,hits:0,kills:0,deaths:0,damageTaken:0});
 for(let i=1;i<=6;i++)for(const t of trials){
  const move=t.beforeStep({tick:t.triggerTick+i,now:30,client:c,command:cmd});
  assert.equal(move.fire,false);assert.equal(move.ads,false);assert.equal(move.aim,false);
 }
 assert.ok(trials[1].routeCache!==null);
 assert.ok(trials[1].pathPlans>0);
 assert.ok(trials.every(t=>t.changedTicks<=6));
 assert.equal(publicFarRangeV67(client({boxes:[{x0:9}]}),30,'aa12',cmd).valid,false);
});
