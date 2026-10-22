import test from 'node:test';
import assert from 'node:assert/strict';
import {publicMovementMenuC35V,MovementValueObserverC35V} from '../lab/arena/movement-value-observer-c35v.mjs';
const original={forward:true,fire:true,aim:true,slot:-1};
function client(t,{age=.075,team=1,box=[],hp=100,range=30,weapon='m4a1'}={}){
 return {you:{tm:0},pos:{x:0,y:0,z:40},rig:{yaw:Math.PI,pitch:0},map:{bound:200,boxes:box},
  local:{alive:true,team:0,down:false,hp,mv:{stance:0,onGround:true,y:0}},
  remotes:{list:[{id:'enemy',team,alive:true,invisible:false,pos:{x:0,y:0,z:40+range},stance:0,
   buf:[{t:t-age-.06,x:0,z:40+range},{t:t-age,x:0,z:40+range}]}]}};
}
const server=(hits=0,shots=0,kills=0,hp=100)=>({serverHits:hits,serverShots:shots,serverKills:kills,serverHp:hp,serverAlive:hp>0,serverDamageTaken:Math.max(0,100-hp)});
test('public menu provides distinct safe candidates, with counterfactual labels always unknown',()=>{
 const x=publicMovementMenuC35V(2,client(2),original,original);
 assert.equal(x.valid,true,JSON.stringify(x));assert.equal(x.actions.length,8);
 assert.ok(x.actions.some(a=>a.safe));assert.ok(x.actions.some(a=>!a.safe));
 assert.ok(x.actions.every(a=>a.factualOutcome===null));assert.ok(x.bestId!==null);
});
test('refuses stale snapshot, same team, geometrical blocker, low hp, priority and incompatible command',()=>{
 for(const [c,a] of [[client(2,{age:.5}),original],[client(2,{team:0}),original],
  [client(2,{box:[{x0:-1,x1:1,z0:47,z1:49,y0:0,y1:4}]}),original],
  [client(2,{hp:10}),original],[client(2),{...original,reload:true}],[client(2),{...original,forward:false}]]){
  assert.equal(publicMovementMenuC35V(2,c,a,a).valid,false);
 }
});
test('sampling begins only after server previous tick, factual value finalized AFTER horizon',()=>{
 const q=new MovementValueObserverC35V({matchId:'A',setupId:'S',weapon:'m4a1',sampleEvery:6,horizonTicks:6});
 for(let i=1;i<=18;i++){
  const t=2+i/60;q.beforeStep({now:t,client:client(t),incumbent:original,applied:original});
  if(i===10)assert.equal(q.rows[0].factual,null);
  q.afterStep(server(i>=8?1:0,i>=8?1:0,0,100));
 }
 const r=q.finish();assert.equal(r.rows.length,3);assert.equal(r.counts.completed,2);assert.equal(r.counts.censored,1);
 assert.equal(r.rows[0].factual.hitDelta,1);assert.equal(r.rows[0].factual.hitWindow,1);
 assert.equal(r.rows[0].actions.every(a=>a.factualOutcome===null),true);
});
test('server truth can be arbitrary and does not change public action ranking',()=>{
 const t=2,c=client(t),m=publicMovementMenuC35V(t,c,original,original);
 const q=new MovementValueObserverC35V({matchId:'A',setupId:'S',weapon:'m4a1',sampleEvery:6,horizonTicks:6});
 for(let i=1;i<=18;i++){
  const now=2+i/60;q.beforeStep({now,client:client(now),incumbent:original,applied:original});
  q.afterStep(server(i,2*i,0,100));
 }
 assert.deepEqual(q.rows[0].actions,m.actions);assert.deepEqual(q.rows[0].features,m.features);
});
test('reject fire suppression, nonmonotone clock, nonmonotone counters',()=>{
 const q=new MovementValueObserverC35V({matchId:'A',setupId:'S',weapon:'m4a1'});
 assert.throws(()=>q.beforeStep({now:2,client:client(2),incumbent:original,applied:{...original,fire:false}}),/fire boundary/);
 const z=new MovementValueObserverC35V({matchId:'B',setupId:'S',weapon:'m4a1'});
 z.beforeStep({now:2,client:client(2),incumbent:original,applied:original});z.afterStep(server());
 assert.throws(()=>z.beforeStep({now:2,client:client(2),incumbent:original,applied:original}),/clock/);
 z.beforeStep({now:3,client:client(3),incumbent:original,applied:original});
 z.afterStep(server(4,5));
 z.beforeStep({now:4,client:client(4),incumbent:original,applied:original});
 assert.throws(()=>z.afterStep(server(3,5)),/nonmonotone/);
});
test('censor at end of match, do not substitute zero returns for unobserved futures',()=>{
 const q=new MovementValueObserverC35V({matchId:'A',setupId:'S',weapon:'m4a1',sampleEvery:6,horizonTicks:18});
 for(let i=1;i<=8;i++){const now=2+i/60;q.beforeStep({now,client:client(now),incumbent:original,applied:original});q.afterStep(server());}
 const r=q.finish();assert.equal(r.rows.length,1);assert.equal(r.rows[0].factual,null);assert.equal(r.rows[0].censored,true);
});
test('guard rejects unknown or broken setup',()=>{
 assert.throws(()=>new MovementValueObserverC35V({matchId:'A',weapon:'m4a1'}),/config/);
 assert.throws(()=>new MovementValueObserverC35V({matchId:'A',setupId:'S',weapon:'m4a1',sampleEvery:2}),/config/);
});
