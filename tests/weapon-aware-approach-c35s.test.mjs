import test from 'node:test';
import assert from 'node:assert/strict';
import {shotgunApproachCandidateC35S,WeaponAwareApproachC35S} from '../lab/arena/weapon-aware-approach-c35s.mjs';
import {candidateSetC16} from '../lab/arena/safe-action-explorer-c16.mjs';
function fake(now,{distance=24,boxes=[],age=.07}={}){
 const z=30+distance;
 return {you:{tm:0},pos:{x:2,y:0,z:30},rig:{yaw:Math.PI,pitch:0},map:{bound:150,boxes},
  local:{alive:true,team:'red',down:false,mv:{stance:0,lean:0,onGround:true,y:0},hp:100},
  remotes:{list:[{id:'enemy',team:1,alive:true,invisible:false,pos:{x:2,y:0,z},stance:0,
  buf:[{t:now-age-.08,x:2,z},{t:now-age,x:2,z}]}]}};
}
const fire={fire:true,aim:true,forward:false,backward:false,left:false,right:false,slot:-1};
const cfg={policy:'approach',weapon:'aa12',matchId:'unit'};
test('public shotgun gate eligible at 24m with only delayed public state',()=>{
 const g=shotgunApproachCandidateC35S(fake(2),fire,2,{weapon:'aa12'});
 assert.equal(g.eligible,true,JSON.stringify(g));assert.equal(g.targetId,'enemy');
 assert.equal(candidateSetC16(fake(2),fire,2,'tdm').eligible,false);
});
test('controlled policy only inserts forward, never touches fire, aim or slot',()=>{
 const x=new WeaponAwareApproachC35S(cfg);let changed=0;
 for(let i=0;i<35;i++){let now=2+i/60;const o=x.command(now,fake(now),fire,fire);
  assert.equal(o.fire,true);assert.equal(o.aim,true);assert.equal(o.slot,-1);
  assert.equal(o.left,false);assert.equal(o.right,false);if(o.forward)changed++;}
 const r=x.finish();assert.ok(changed>=4);assert.equal(r.counts.modifiedTicks,changed);assert.ok(r.counts.completed>=1);
});
test('observer arm remains command-identical while recording opportunities',()=>{
 const x=new WeaponAwareApproachC35S({...cfg,policy:'observe'});
 for(let i=0;i<35;i++){const now=2+i/60;assert.strictEqual(x.command(now,fake(now),fire,fire),fire);}
 const a=x.finish();assert.equal(a.counts.modifiedTicks,0);assert.ok(a.counts.eligible>0);
});
test('stale, cover, unsafe forward, low range and competing actions are all refused',()=>{
 assert.equal(shotgunApproachCandidateC35S(fake(2,{age:.3}),fire,2,{weapon:'aa12'}).eligible,false);
 assert.equal(shotgunApproachCandidateC35S(fake(2,{distance:10}),fire,2,{weapon:'aa12'}).eligible,false);
 assert.equal(shotgunApproachCandidateC35S(fake(2),fire,2,{weapon:'m4a1'}).eligible,false);
 assert.equal(shotgunApproachCandidateC35S(fake(2),{...fire,reload:true},2,{weapon:'aa12'}).eligible,false);
 assert.equal(shotgunApproachCandidateC35S(fake(2),{...fire,forward:true},2,{weapon:'aa12'}).eligible,false);
 const b={x0:1,x1:3,y0:-1,y1:4,z0:33,z1:36};
 assert.equal(shotgunApproachCandidateC35S(fake(2,{boxes:[b]}),fire,2,{weapon:'aa12'}).eligible,false);
});
test('never overrides a competing micro command or removes fire',()=>{
 const x=new WeaponAwareApproachC35S(cfg);
 assert.deepEqual(x.command(2,fake(2),fire,{...fire,left:true}),{...fire,left:true});
 assert.throws(()=>x.command(2.1,fake(2.1),fire,{...fire,fire:false}),/fire modification/);
});
test('end censoring and accounting; monotonic clock',()=>{
 const x=new WeaponAwareApproachC35S(cfg);
 x.command(2,fake(2),fire,fire);assert.throws(()=>x.command(2,fake(2),fire,fire),/clock/);
 const r=x.finish();assert.equal(r.events[0].censored,true);assert.equal(r.counts.modifiedTicks,1);
 assert.throws(()=>new WeaponAwareApproachC35S({...cfg,policy:'production'}),/configuration/);
});

test('v2 closes shotgun gaps without firing when target is too far for weapon falloff',()=>{
 const cmd={...fire,fire:false};const x=new WeaponAwareApproachC35S(cfg);const c=fake(2,{distance:41});
 const g=shotgunApproachCandidateC35S(c,cmd,2,{weapon:'aa12'});assert.equal(g.eligible,true,JSON.stringify(g));
 const y=x.command(2,c,cmd,cmd);assert.equal(y.forward,true);assert.equal(y.fire,false);
 const z=x.finish();assert.equal(z.counts.modifiedNonFireTicks,1);
});
