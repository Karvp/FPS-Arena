import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAimPoint, candidateHitDistance, findTarget, observeLeanSnapshot,
  estimateRemoteLean, leanRate, normaliseOptions, DEFAULTS
} from '../aim-core.mjs';
import {rayWorld,rayAABB,raySphere} from './fixtures/game-shared/geometry.js';
import {PLAYER, LEAN} from './fixtures/game-shared/constants.js';

const helpers={player:PLAYER,leanOffset:LEAN.offset,eyeHeightOf:()=>1.6,rayWorld,rayAABB,raySphere};
const options=normaliseOptions({...DEFAULTS,enabled:true,activation:'always',maxDistance:200,fov:45});
const makeRemote=(lean=0,yaw=0,extra={})=>({id:'enemy',alive:true,invisible:false,
  pos:{x:0,y:0,z:-20},yaw,lean,team:1,sliding:false,stance:0,data:{ln:lean},...extra});
const makeGame=(remote,boxes=[])=>({running:true,phase:'match',net:{id:'me'},
  rig:{yaw:0,pitch:0},local:{alive:true,team:'red',mv:{lean:0}},
  pos:{x:0,y:0,z:0},map:{boxes},modeState:{type:'tdm'},
  remotes:{list:[remote]},bremotes:{list:[]},zremotes:{list:[]}});
const unitTo=(eye,p)=>{const v=[p.x-eye[0],p.y-eye[1],p.z-eye[2]],d=Math.hypot(...v);return v.map(x=>x/d);};

// Reproduce the *server/combat.js* formula for the stored authoritative
// lag-compensated head sphere / body AABB (not the cosmetic Three.js mesh).
function actualHit(r,kind,eye,unit){
  const sx=Math.cos(r.yaw)*r.lean*LEAN.offset,sz=-Math.sin(r.yaw)*r.lean*LEAN.offset;
  const st=r.stance||0;
  if(kind==='head')return raySphere(eye,unit,r.pos.x+sx,r.pos.y+(r.sliding?PLAYER.slideHeadY:PLAYER.headYs[st]),r.pos.z+sz,PLAYER.headRadius);
  const h=r.sliding?PLAYER.slideBodyHeight:PLAYER.bodyH[st],hw=st===2?.55:PLAYER.bodyHalf;
  return rayAABB(eye,unit,r.pos.x+sx*.5-hw,r.pos.y,r.pos.z+sz*.5-hw,r.pos.x+sx*.5+hw,r.pos.y+h,r.pos.z+sz*.5+hw);
}

test('left/right lean across stances and yaw agrees with authoritative server collision',()=>{
  const eye=[0,1.6,0];
  for(const yaw of [0,.45,-1.2,Math.PI])for(const lean of [-1,-.75,-.25,0,.25,.75,1])
    for(const stance of [0,1,2])for(const kind of ['head','body']){
      const r=makeRemote(lean,yaw,{stance});
      const p=getAimPoint(r,kind,PLAYER);
      const u=unitTo(eye,p);
      assert.ok(Number.isFinite(actualHit(r,kind,eye,u)),`miss ${yaw},${lean},${stance},${kind}`);
      assert.ok(Number.isFinite(candidateHitDistance(kind,eye,u,r,PLAYER,lean,LEAN.offset,helpers)));
    }
});
test('head moves full lean offset, torso only half (the previous body offset was wrong)',()=>{
  const r=makeRemote(1,0);
  assert.ok(Math.abs(getAimPoint(r,'head',PLAYER).x-.35)<1e-10);
  assert.ok(Math.abs(getAimPoint(r,'body',PLAYER).x-.175)<1e-10);
  r.data.ln=-1;
  assert.ok(Math.abs(getAimPoint(r,'head',PLAYER).x+.35)<1e-10);
  assert.ok(Math.abs(getAimPoint(r,'body',PLAYER).x+.175)<1e-10);
});
test('snapshot-based Q/E tracking stays bounded and prefers body on sudden lean reversal',()=>{
  const r=makeRemote(0),game=makeGame(r);
  observeLeanSnapshot(game,{t:10,pl:[{id:'enemy',ln:-.45}]});
  observeLeanSnapshot(game,{t:10.04,pl:[{id:'enemy',ln:-.18}]});
  r.data.ln=-.18;r.lean=-.18;
  assert.ok(leanRate(game,r)>4.5);
  assert.ok(estimateRemoteLean(game,r)>-.18);
  const target=findTarget(game,options,helpers);
  assert.equal(target.hitRegion,'body');
  assert.equal(target.hitboxVisible,true);
  observeLeanSnapshot(game,{t:10.08,pl:[{id:'enemy',ln:1}]});
  assert.ok(estimateRemoteLean(game,r)<=1);
  observeLeanSnapshot(game,{t:10.12,pl:[{id:'enemy',ln:-1}]});
  assert.ok(estimateRemoteLean(game,r)>=-1);
});
test('head-only cover chooses server-valid torso and still fires; complete cover rejects target',()=>{
  const r=makeRemote(1),eye=[0,1.6,0];
  // A high wall segment near the target blocks the head, not the torso.
  const high={x0:-1,x1:1,z0:-19.75,z1:-19.25,y0:1.3,y1:3};
  const g=makeGame(r,[high]);
  const head=getAimPoint(r,'head',PLAYER),headD=Math.hypot(head.x,head.y-1.6,head.z);
  const hdir=unitTo(eye,head);
  assert.ok(rayWorld(eye,hdir,[high],headD)<headD-.2);
  const t=findTarget(g,options,helpers);
  assert.ok(t,'torso still exposed');
  assert.equal(t.hitRegion,'body');
  assert.equal(t.hitboxVisible,true);
  assert.equal(findTarget(makeGame(r,[{...high,y0:0,y1:4}]),options,helpers),null);
});
test('body/head target geometry remains finite during slide and rapidly changing side',()=>{
  const r=makeRemote(-1,-Math.PI/2,{sliding:true});
  const game=makeGame(r);
  for(const lean of [-1,1,-1,1]){
    r.lean=lean;r.data.ln=lean;
    const t=findTarget(game,{...options,target:'body'},helpers);
    assert.ok(t && Number.isFinite(t.yaw) && Number.isFinite(t.pitch));
    assert.equal(t.hitRegion,'body');
  }
});
