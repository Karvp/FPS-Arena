import test from 'node:test';import assert from 'node:assert/strict';
import {movementUnitC35T,targetRelativeCandidateC35T,TargetRelativeMovementC35T} from '../lab/arena/target-relative-motion-c35t.mjs';
function client(now,{distance=28,age=.07,boxes=[],hp=100,stance=0}={}){
 return {you:{tm:0},pos:{x:2,y:0,z:30},rig:{yaw:Math.PI,pitch:0},map:{bound:150,boxes},
  local:{alive:true,team:0,down:false,hp,mv:{stance,lean:0,onGround:true,y:0}},
  remotes:{list:[{id:'hostile',team:1,alive:true,invisible:false,pos:{x:2,y:0,z:30+distance},stance:0,
   buf:[{t:now-age-.06,x:2,z:30+distance},{t:now-age,x:2,z:30+distance}]}]}};
}
const move={fire:true,aim:true,forward:false,backward:false,left:false,right:true,slot:-1,skill:false};
test('engine-matched movement world projection (yaw pi faces +z)',()=>{
 assert.ok(movementUnitC35T({forward:true},Math.PI).z>.99);
 assert.ok(movementUnitC35T({right:true},Math.PI).x<-.99);
 assert.equal(movementUnitC35T({},Math.PI),null);
});
test('public shotgun gap selects safely forward-biased redirect from incumbent strafe',()=>{
 const c=targetRelativeCandidateC35T(client(2),move,2,{weapon:'aa12'});
 assert.equal(c.eligible,true,JSON.stringify(c));assert.equal(c.targetId,'hostile');
 assert.ok(c.closureAfter>=c.closureBefore+.24);assert.equal(c.incumbent.right,true);
 assert.equal(c.selected.forward,true);assert.equal(c.selected.right,true);
});
test('redirect preserves fire/aim/slot and all nonmotor controls and is actually exposed',()=>{
 const x=new TargetRelativeMovementC35T({policy:'redirect',weapon:'aa12',matchId:'test'});
 let changed=0;for(let i=0;i<36;i++){
  const t=2+i/60,o=x.command(t,client(t),move,move);
  assert.equal(o.fire,move.fire);assert.equal(o.aim,move.aim);assert.equal(o.slot,move.slot);
  assert.equal(o.skill,move.skill);if(o.forward)changed++;
 }
 const r=x.finish();assert.ok(changed>=3);assert.equal(r.counts.modifiedTicks,changed);
 assert.equal(r.counts.modifiedFireTicks,changed);
});
test('observe is byte-identical and retains candidate accounting',()=>{
 const x=new TargetRelativeMovementC35T({policy:'observe',weapon:'aa12',matchId:'test'});
 for(let i=0;i<35;i++){const t=2+i/60;assert.strictEqual(x.command(t,client(t),move,move),move);}
 const r=x.finish();assert.equal(r.counts.modifiedTicks,0);assert.ok(r.counts.offers>0);
});
test('stale snapshot, low hp, blocked target, priority and no movement all refuse',()=>{
 const no=(c,m=move)=>assert.equal(targetRelativeCandidateC35T(c,m,2,{weapon:'aa12'}).eligible,false);
 no(client(2,{age:.31}));no(client(2,{hp:10}));no(client(2,{distance:12}));
 no(client(2,{boxes:[{x0:1,x1:3,y0:0,y1:4,z0:34,z1:35}]}));
 no(client(2),{...move,skill:true});no(client(2),{...move,left:false,right:false});
 no(client(2,{stance:1}));
});
test('does not override competing C21/C16 micro, never changes fire',()=>{
 const x=new TargetRelativeMovementC35T({policy:'redirect',weapon:'aa12',matchId:'test'});
 assert.deepEqual(x.command(2,client(2),move,{...move,backward:true}),{...move,backward:true});
 assert.throws(()=>x.command(2.05,client(2.05),move,{...move,fire:false}),/trigger changed/);
});
test('monotonic clock, censoring, unsupported policy rejected',()=>{
 const x=new TargetRelativeMovementC35T({policy:'redirect',weapon:'aa12',matchId:'test'});
 x.command(2,client(2),move,move);assert.throws(()=>x.command(2,client(2),move,move),/clock/);
 assert.equal(x.finish().events[0].censored,true);
 assert.throws(()=>new TargetRelativeMovementC35T({policy:'ship',matchId:'test'}),/configuration/);
});
test('unrelated player/team never selected',()=>{
 const c=client(2);c.remotes.list[0].team=0;
 assert.equal(targetRelativeCandidateC35T(c,move,2,{weapon:'aa12'}).eligible,false);
});
