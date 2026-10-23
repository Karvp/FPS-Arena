import test from 'node:test';
import assert from 'node:assert/strict';
import {publicCoverCandidatesV69,publicEscapePlanV69,V69CoverEscapeTrial,V69_ARMS} from '../lab/arena/tdm-cover-escape-v69.mjs';
const command={forward:true,backward:false,left:false,right:false,fire:false,aim:false,
 ads:false,skill:false,reload:false,slot:0};
function c({enemyZ=-19,ally=false,low=false,stale=false}={}){
 const box={x0:-4,x1:4,y0:0,y1:5,z0:-9,z1:-6};
 const entities=[{id:'e',team:'red',alive:true,invisible:false,
   pos:{x:0,y:0,z:enemyZ},buf:[{x:0,z:enemyZ,t:29.85},{x:0,z:enemyZ,t:stale?28:29.95}]}];
 if(ally)entities.push({id:'b',team:'blue',alive:true,invisible:false,
  pos:{x:3,y:0,z:2},buf:[{x:3,z:2,t:29.85},{x:3,z:2,t:29.95}]});
 return {pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},
  local:{alive:true,hp:low?40:100,team:'blue'},you:{tm:'blue'},
  map:{bound:85,boxes:[box]},remotes:{list:entities}};
}
test('cover goals occlude real public threat with validated static boxes',()=>{
 const found=publicCoverCandidatesV69(c(),30);
 assert.equal(found.valid,true);
 assert.equal(found.noPrivateState,true);
 assert.ok(found.candidateCount>0);
 assert.ok(found.targets.some(x=>x.occluded>0));
 const plan=publicEscapePlanV69(c(),30);
 assert.equal(plan.valid,true);
 assert.ok(plan.waypoints.length>=1);
 assert.equal(plan.noPrivateState,true);
});
test('missing or corrupt public context never creates a fake escape',()=>{
 const q=c();q.map.boxes=[{x0:2}];
 assert.equal(publicEscapePlanV69(q,30).valid,false);
 const unknown=c();unknown.you.tm='red';
 assert.equal(publicCoverCandidatesV69(unknown,30).valid,false);
});
test('v69 arms share public pre-trigger action prefix and preserve nonmovement commands',()=>{
 const arms=V69_ARMS.map(arm=>new V69CoverEscapeTrial({arm,weapon:'aa12',seed:9,
  earliestTick:650,latestTick:1100,treatmentTicks:350,outcomeTicks:480}));
 assert.deepEqual(V69_ARMS,['keep','route','cover-escape','cover-support']);
 const f=c({enemyZ:-61});
 for(let tick=1;tick<800;tick++){
  for(const arm of arms)
   assert.deepEqual(arm.beforeStep({tick,now:30,client:f,command}),command);
  if(arms[0].triggerTick!==null)break;
 }
 assert.ok(arms[0].triggerTick);
 assert.equal(new Set(arms.map(a=>a.triggerTick)).size,1);
 assert.equal(new Set(arms.map(a=>a.prefixSHA256)).size,1);
 for(const a of arms)a.setWitness({tick:a.triggerTick,rngState:17,serverSHA256:'same'},
   {shots:0,hits:0,kills:0,deaths:0,damageTaken:0});
 // Move public enemy close and cover behind player; this triggers public danger.
 const exposed=c({enemyZ:-5});exposed.map.boxes=[];
 for(let tick=arms[0].triggerTick+1;tick<=arms[0].triggerTick+24;tick++){
  for(const arm of arms){
   const out=arm.beforeStep({tick,now:30,client:exposed,command});
   for(const key of Object.keys(command))
    if(!['forward','backward','left','right'].includes(key))
     assert.equal(out[key],command[key]);
  }
 }
 assert.equal(arms[0].changedTicks,0);
 assert.ok(arms[2].escapeTicks>0);
 assert.ok(arms[2].awayFallback>0);
 assert.equal(arms[2].finish().productionAllowed,false);
 assert.equal(arms[2].finish().allNonWASDUnchanged,true);
});
test('bounded motor changes and anti-stall do not freeze commands forever',()=>{
 const trial=new V69CoverEscapeTrial({arm:'cover-escape',weapon:'aa12',seed:8});
 trial.triggerTick=702;trial.prestate={tick:702,rngState:8};
 trial.changedTicks=620;
 const got=trial.beforeStep({tick:703,now:30,client:c({enemyZ:-5}),command});
 assert.deepEqual(got,command);
 assert.equal(trial.stallFallbackTicks,1);
 assert.equal(trial.finish().maxChangedTicks,620);
});
