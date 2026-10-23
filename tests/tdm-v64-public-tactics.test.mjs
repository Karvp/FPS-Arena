import test from 'node:test';
import assert from 'node:assert/strict';
import {publicTacticalContextV64,V64_CONTEXT_SCHEMA} from '../lab/arena/tdm-public-tactics-v64.mjs';
import {V64TacticalTrial,V64_SCHEMA} from '../lab/arena/tdm-context-trial-v64.mjs';
const cmd={forward:false,backward:false,left:false,right:false,fire:false,aim:false,ads:false,skill:false,reload:false};
function actor({cover=false,stale=false}={}) {
 const now=30;
 return {
  pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},you:{tm:'blue'},
  local:{alive:true,hp:100,team:'blue',mv:{lean:0}},
  map:{bound:110,boxes:cover?[{x0:-2,x1:2,y0:0,y1:4,z0:-13,z1:-12}]:[]},
  remotes:{list:[
   {id:'enemy',team:'red',alive:true,invisible:false,
    pos:{x:0,y:0,z:-22},buf:[{x:0,z:-23,t:29.85},{x:0,z:-22,t:stale?28:29.95}]},
   {id:'friend',team:'blue',alive:true,invisible:false,
    pos:{x:2,y:0,z:-4},buf:[{x:1,z:-5,t:29.85},{x:2,z:-4,t:29.95}]}
  ]},
 };
}
test('public tactical context LOS uses static visible cover, not server',()=>{
 const clear=publicTacticalContextV64(actor(),30),blocked=publicTacticalContextV64(actor({cover:true}),30);
 assert.equal(clear.valid,true);
 assert.equal(blocked.valid,true);
 assert.equal(clear.schema,V64_CONTEXT_SCHEMA);
 assert.equal(clear.los3DClear,true);
 assert.equal(blocked.los3DClear,false);
 assert.equal(clear.coverFootprint,false);
 assert.equal(blocked.coverFootprint,true);
 assert.equal(blocked.teammatesNearby20m,1);
 assert.equal(blocked.teammatesSupportingTarget25m,1);
 assert.equal(blocked.visibleEnemies,1);
 assert.equal(clear.validMotion,true);
 assert.ok(clear.radialSpeed<0);
 assert.equal(clear.noPrivateServerInput,true);
});
test('stale, unknown teams, invalid collision boxes refuse context',()=>{
 assert.equal(publicTacticalContextV64(actor({stale:true}),30).valid,false);
 const t=actor();t.you.tm='red';
 assert.equal(publicTacticalContextV64(t,30).valid,false);
 const x=actor();x.map.boxes=[{x0:0}];
 assert.equal(publicTacticalContextV64(x,30).valid,false);
});
test('motion with corrupted buffer is explicitly missing, not future fabricated',()=>{
 const x=actor();x.remotes.list[0].buf=[{t:29.8},{t:29.95}];
 const got=publicTacticalContextV64(x,30);
 assert.equal(got.valid,true);
 assert.equal(got.validMotion,false);
 assert.equal(got.motionSpeed,0);
});
test('four V64 arms produce same public context at trigger before any intervention',()=>{
 const arms=['keep','close','strafe','withdraw'];
 const trials=arms.map(arm=>new V64TacticalTrial({arm,stratum:'aim-lock',
  seed:0,earliestTick:600,latestTick:1200,confirmationSamples:2,treatmentTicks:60,outcomeTicks:90}));
 const input={...cmd,ads:true};
 for(let tick=1;tick<=780;tick++){
  for(const t of trials){
   const output=t.beforeStep({tick,now:30,client:actor(),command:input});
   assert.deepEqual(output,input);
  }
  if(trials[0].triggerTick!==null)break;
 }
 const trigger=trials[0].triggerTick;
 assert.ok(trigger>=600&&trigger<=780);
 assert.equal(new Set(trials.map(t=>t.prefixSHA256)).size,1);
 assert.equal(new Set(trials.map(t=>JSON.stringify(t.contextV64))).size,1);
 for(const t of trials){
  assert.equal(t.finish().schema,V64_SCHEMA);
  assert.equal(t.contextV64.valid,true);
  assert.equal(t.finish().productionAllowed,false);
  t.setWitness({serverSHA256:'witness',rngState:123,tick:trigger},
   {kills:0,deaths:0,shots:0,hits:0,damageTaken:0});
  const action=t.beforeStep({tick:trigger+1,now:30,client:actor(),command:input});
  assert.equal(action.ads,true);
  assert.equal(action.fire,false);
 }
});
