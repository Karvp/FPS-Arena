import test from 'node:test';
import assert from 'node:assert/strict';
import {CausalActionTeacherC35W,assignmentC35W,C35W_ARMS} from '../lab/arena/causal-action-teacher-c35w.mjs';
const cmd={forward:true,fire:true,aim:true,slot:-1};
function client(t,{age=.075,team=1,box=[],hp=100}={}){
 return {you:{tm:0},pos:{x:0,y:0,z:40},rig:{yaw:Math.PI,pitch:0},map:{bound:200,boxes:box},
  local:{alive:true,team:0,down:false,hp,mv:{stance:0,onGround:true,y:0}},
  remotes:{list:[{id:'enemy',team,alive:true,invisible:false,pos:{x:0,y:0,z:70},stance:0,
    buf:[{t:t-age-.06,x:0,z:70},{t:t-age,x:0,z:70}]}]}};
}
const server=(n=0)=>({serverHits:n,serverShots:n,serverKills:0,serverDamageTaken:0,serverAlive:true});
const build=(policy='randomized',seed=15)=>new CausalActionTeacherC35W({seed,matchId:'test',setupId:'s',weapon:'m4a1',policy,cooldown:.6,horizonTicks:6});
function run(q,n=120,fn=()=>server(0)){
 const outputs=[];
 for(let i=1;i<=n;i++){
  const t=1+i/60;
  const applied=q.command(t,client(t),cmd,cmd);
  outputs.push(applied);
  q.afterStep(fn(i));
 }
 return outputs;
}
test('hash assignment is deterministic and design probabilities are stored, not learnt from outcomes',()=>{
 const freq={control:0,'alternative-a':0,'alternative-b':0};
 for(let i=1;i<=10000;i++){const x=assignmentC35W(127,i);freq[x]++;assert.equal(assignmentC35W(127,i),x);}
 assert.ok(Math.abs(freq.control/10000-.8)<.025,JSON.stringify(freq));
 assert.ok(Math.abs(freq['alternative-a']/10000-.1)<.02);
 assert.ok(Math.abs(freq['alternative-b']/10000-.1)<.02);
 for(const [seed,index] of [[-1,1],[0,0],[.3,1]])assert.throws(()=>assignmentC35W(seed,index));
});
test('frozen observe arm does not act or assign even if public menu is eligible',()=>{
 const q=build('observe');const a=run(q);assert.ok(a.every(x=>x===cmd));
 const r=q.finish();assert.equal(r.rows.length,0);assert.equal(r.counts.modifiedTicks,0);
});
test('randomized arm applies only one-tick motor and logs intact pre-step intent with factual post-step labels',()=>{
 const q=build('randomized',127),a=run(q,180,(i)=>server(i>60?1:0));const r=q.finish();
 assert.ok(r.rows.length>=2,JSON.stringify(r.counts));
 assert.ok(r.rows.every(x=>x.propensity===(x.assignedArm==='control'?.8:.1)));
 assert.ok(r.rows.every(x=>x.unselectedOutcomes===null));
 assert.ok(r.rows.every(x=>x.compliant===true&&x.executedArm===x.assignedArm));
 assert.ok(a.every(x=>x.fire===cmd.fire&&x.aim===cmd.aim&&x.slot===cmd.slot));
 assert.equal(r.counts.modifiedTicks,r.rows.filter(x=>x.assignedArm!=='control').length);
 assert.ok(r.rows.every(x=>x.outcome!==null||x.censored));
 assert.ok(r.rows.every(x=>x.actionSet.length===3&&x.assignmentDistribution.control===.8));
});
test('C21/upstream modification cannot be overridden by C35W',()=>{
 const q=build();for(let i=1;i<=120;i++){
  const t=1+i/60, modified={...cmd,right:true};
  const out=q.command(t,client(t),cmd,modified);assert.equal(out,modified);q.afterStep(server());
 }
 assert.equal(q.finish().counts.offers,0);
});
test('public priority, stale targets, same team, low health and static occluder never assign',()=>{
 const variants=[{client:{age:.5}},{client:{team:0}},{client:{hp:20}},
  {client:{box:[{x0:-1,x1:1,y0:0,y1:4,z0:50,z1:55}]}},
  {command:{...cmd,reload:true}}];
 for(const v of variants){const q=build();for(let i=1;i<=50;i++){
  const t=1+i/60,x=v.command??cmd;const out=q.command(t,client(t,v.client),x,x);
  assert.equal(out,x);q.afterStep(server());}
  assert.equal(q.finish().counts.offers,0);
 }
});
test('after-step server outcome cannot influence assigned hash or menu',()=>{
 const a=build('randomized',1234),b=build('randomized',1234);
 run(a,180,()=>server(0));run(b,180,i=>server(i));
 const A=a.finish(),B=b.finish();
 assert.deepEqual(A.rows.map(({assignedArm,actionSet,features})=>({assignedArm,actionSet,features})),
  B.rows.map(({assignedArm,actionSet,features})=>({assignedArm,actionSet,features})));
 assert.ok(A.rows.some((x,i)=>x.outcome?.hitWindow!==B.rows[i]?.outcome?.hitWindow));
});
test('right censoring is not silently relabelled as zero return',()=>{
 const q=build('randomized',127);run(q,40);const a=q.finish();
 assert.ok(a.rows.length>0);assert.ok(a.rows.at(-1).censored||a.rows.at(-1).outcome);
 assert.equal(a.counts.completed+a.counts.censored,a.rows.length);
});
test('reject bad setup, duplicate time and nonmonotone server labels',()=>{
 assert.throws(()=>new CausalActionTeacherC35W({seed:1,setupId:'s',weapon:'m4a1'}),/config/);
 const q=build();q.command(1,client(1),cmd,cmd);q.afterStep(server(5));
 assert.throws(()=>q.command(1,client(1),cmd,cmd),/clock/);
 q.command(2,client(2),cmd,cmd);assert.throws(()=>q.afterStep(server(2)),/nonmonotone/);
});
