import test from 'node:test';import assert from 'node:assert/strict';
import {weaponBandC35U,positioningCandidateC35U,WeaponAwarePositioningC35U} from '../lab/arena/weapon-aware-positioning-c35u.mjs';
const fire={fire:true,aim:true,forward:true,right:false,left:false,backward:false,skill:false,slot:-1};
const strafe={...fire,forward:false,right:true};
function client(t,{distance=14,weapon='aa12',age=.08,box=[],health=100,team=1}={}){
 return {you:{tm:0},pos:{x:0,y:0,z:40},rig:{yaw:Math.PI,pitch:0},map:{bound:200,boxes:box},
  local:{alive:true,team:0,down:false,hp:health,mv:{stance:0,onGround:true,y:0}},
  remotes:{list:[{id:'enemy',team,alive:true,invisible:false,pos:{x:0,y:0,z:40+distance},stance:0,
   buf:[{t:t-age-.06,x:0,z:40+distance},{t:t-age,x:0,z:40+distance}]}]}};
}
test('weapon bands use official table and differ by class',()=>{
 const a=weaponBandC35U('aa12'),s=weaponBandC35U('mp5sd'),r=weaponBandC35U('m4a1');
 assert.ok(a.far<s.far&&s.far<r.far);assert.equal(weaponBandC35U('l115a3'),null);
});
test('shotgun at range redirects strafe toward target',()=>{
 const x=positioningCandidateC35U(client(2,{distance:26}),strafe,2,{weapon:'aa12'});
 assert.equal(x.eligible,true,JSON.stringify(x));assert.equal(x.phase,'close-distance');assert.equal(x.selected.forward,true);
});
test('rifle inside preferred band reduces excess radial charge',()=>{
 const x=positioningCandidateC35U(client(2,{distance:31}),fire,2,{weapon:'m4a1'});
 assert.equal(x.eligible,true,JSON.stringify(x));assert.equal(x.phase,'hold-band');
 assert.equal(x.selected.forward,true);assert.equal(x.selected.right||x.selected.left,true);
});
test('SMG close to target tries to create space without reversing',()=>{
 const x=positioningCandidateC35U(client(2,{distance:6}),fire,2,{weapon:'mp5sd'});
 assert.equal(x.eligible,true,JSON.stringify(x));assert.equal(x.phase,'create-space');
 assert.ok(!x.selected.backward);assert.ok(x.selected.left||x.selected.right);
});
test('refuse stale, ally, cover, low health, movement priority, and unsupported modes',()=>{
 const check=(c,m=fire,o={})=>assert.equal(positioningCandidateC35U(c,m,2,{weapon:'aa12',...o}).eligible,false);
 check(client(2,{age:.4}));check(client(2,{team:0}));
 check(client(2,{distance:27,box:[{x0:-2,x1:2,y0:0,y1:3,z0:48,z1:49}]}));
 check(client(2,{health:20}));check(client(2),{...fire,reload:true});
 check(client(2),fire,{mode:'br'});check(client(2),{...fire,forward:false});
});
test('observe returns original command object and records opportunities',()=>{
 const q=new WeaponAwarePositioningC35U({policy:'observe',weapon:'m4a1',matchId:'x'});
 for(let i=0;i<34;i++){const t=2+i/60;assert.strictEqual(q.command(t,client(t,{distance:31}),fire,fire),fire);}
 const r=q.finish();assert.ok(r.counts.offers>0);assert.equal(r.counts.modifiedTicks,0);
});
test('balance modifies motor only and never fire, aim, skill, or slot',()=>{
 const q=new WeaponAwarePositioningC35U({policy:'balance',weapon:'m4a1',matchId:'x'});
 let changed=0;for(let i=0;i<65;i++){
  const t=2+i/60,x=q.command(t,client(t,{distance:31}),fire,fire);
  assert.equal(x.fire,fire.fire);assert.equal(x.aim,fire.aim);assert.equal(x.slot,fire.slot);
  assert.equal(x.skill,fire.skill);if(x.right||x.left)changed++;
 }
 const r=q.finish();assert.ok(changed>0);assert.equal(r.counts.modifiedTicks,changed);
 assert.equal(r.counts.modifiedFireTicks,changed);
});
test('upstream C16 motion prevents any modification',()=>{
 const q=new WeaponAwarePositioningC35U({policy:'balance',weapon:'m4a1',matchId:'x'});
 const changed={...fire,left:true};
 assert.strictEqual(q.command(2,client(2,{distance:31}),fire,changed),changed);
 assert.equal(q.finish().counts.upstreamConflictTicks,1);
});
test('clock must be monotonic and illegal fire injection fails closed',()=>{
 const q=new WeaponAwarePositioningC35U({policy:'balance',weapon:'m4a1',matchId:'x'});
 q.command(2,client(2,{distance:31}),fire,fire);
 assert.throws(()=>q.command(2,client(2,{distance:31}),fire,fire),/clock/);
 assert.throws(()=>q.command(3,client(3,{distance:31}),fire,{...fire,fire:false}),/fire changed/);
 assert.throws(()=>new WeaponAwarePositioningC35U({policy:'promote',matchId:'x'}),/configuration/);
});
