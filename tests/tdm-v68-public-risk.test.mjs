import test from 'node:test';
import assert from 'node:assert/strict';
import {V68GuardedTrial,V68_ARMS,V68_SCHEMA,publicExposureV68} from '../lab/arena/tdm-exposure-guard-v68.mjs';
const command={forward:true,backward:false,left:false,right:false,fire:false,aim:false,ads:false,
 skill:false,reload:false,slot:1};
const client=({enemyDist=25,enemyCount=1,hp=100,wall=false,ally=false,stale=false}={})=>{
 const enemies=Array.from({length:enemyCount},(_,i)=>({id:'enemy'+i,team:'red',
  alive:true,invisible:false,pos:{x:i*4,y:0,z:-enemyDist},
  buf:[{x:i*4,z:-enemyDist,t:29.85},{x:i*4,z:-enemyDist,t:stale?27:29.95}]}));
 if(ally)enemies.push({id:'ally',team:'blue',alive:true,invisible:false,
  pos:{x:1,y:0,z:-5},buf:[{x:1,z:-5,t:29.85},{x:1,z:-5,t:29.95}]});
 return {pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},you:{tm:'blue'},
  local:{team:'blue',alive:true,hp},map:{bound:110,boxes:wall?
   [{x0:-4,x1:4,y0:0,y1:5,z0:-13,z1:-10}]:[]},
  remotes:{list:enemies}};
};
test('public LOS risk detects unsupported close visible enemies',()=>{
 const exposed=publicExposureV68(client(),30);
 assert.equal(exposed.valid,true);
 assert.equal(exposed.visibleClose,1);
 assert.equal(exposed.highRisk,true);
 assert.equal(exposed.noPrivateState,true);
 const covered=publicExposureV68(client({wall:true}),30);
 assert.equal(covered.valid,true);
 assert.equal(covered.visibleClose,0);
 assert.equal(covered.highRisk,false);
 const supported=publicExposureV68(client({ally:true}),30);
 assert.equal(supported.nearbyAllies,1);
 assert.equal(supported.highRisk,false);
 const low=publicExposureV68(client({hp:60,enemyDist:64}),30);
 assert.equal(low.highRisk,true);
});
test('stale public target and invalid geometry are not accepted as safe context',()=>{
 assert.equal(publicExposureV68(client({stale:true}),30).valid,true);
 const unknown=client();unknown.you.tm='red';
 assert.equal(publicExposureV68(unknown,30).valid,false);
 const wrong=client();wrong.map.boxes=[{x0:1}];
 assert.equal(publicExposureV68(wrong,30).valid,false);
});
test('four-arm pretrigger prefix is identical, guarded movement changes only WASD',()=>{
 const trials=V68_ARMS.map(arm=>new V68GuardedTrial({arm,weapon:'aa12',
  seed:17,earliestTick:650,latestTick:930,treatmentTicks:300,outcomeTicks:470}));
 for(let tick=1;tick<850;tick++){
  for(const t of trials){
   const action=t.beforeStep({tick,now:30,client:client({enemyDist:61}),command});
   assert.deepEqual(action,command);
  }
  if(trials[0].triggerTick!==null)break;
 }
 assert.ok(trials[0].triggerTick>=650);
 assert.equal(new Set(trials.map(t=>t.prefixSHA256)).size,1);
 for(const t of trials)t.setWitness({tick:t.triggerTick,rngState:7,serverSHA256:'same'},
  {shots:0,hits:0,kills:0,deaths:0,damageTaken:0});
 // Triggered from far snapshot; now close unsupported target => guarded neutralizes movement.
 for(let tick=trials[0].triggerTick+1;tick<trials[0].triggerTick+15;tick++){
  const actions=trials.map(t=>t.beforeStep({tick,now:30,client:client(),command}));
  assert.deepEqual(actions[0],command);
  assert.equal(actions[2].forward,false);
  assert.equal(actions[3].forward,false);
  for(const cmd of actions){
   for(const key of Object.keys(command))
    if(!['forward','backward','left','right'].includes(key))assert.equal(cmd[key],command[key]);
  }
 }
 assert.ok(trials[2].gatedTicks>0);
 assert.ok(trials[3].safetyStopChanged>0);
 assert.equal(trials[2].finish().schema,V68_SCHEMA);
 assert.equal(trials[2].finish().productionAllowed,false);
});
test('guarded movement budget stops research overrides',()=>{
 const t=new V68GuardedTrial({arm:'guarded-route',seed:3,weapon:'aa12',treatmentTicks:900});
 t.triggerTick=701;t.prestate={tick:701,serverSHA256:'sample',rngState:1};t.changedTicks=520;
 const got=t.beforeStep({tick:702,now:30,client:client({enemyDist:60}),command});
 assert.deepEqual(got,command);
 assert.equal(t.changedTicks,520);
 assert.equal(t.budgetExhaustedTicks,1);
 assert.equal(t.finish().maxChangedTicks,520);
});
