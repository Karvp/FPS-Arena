import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normaliseOptions, wrapAngle, findTarget, aimStep, getAimPoint, ownTeamIndex, avatarControllable } from '../aim-core.mjs';
const player = { headYs:[1.62,1.15,0.55], headY:1.62, slideHeadY:1.02, slideBodyHeight:0.9, bodyH:[1.4,.95,.5] };
const helper = {player, leanOffset:.35, eyeHeightOf:()=>1.6, rayWorld:(_e,_d,_b,limit)=>limit};
const r = (id,x,y,z,tm=1, extras={}) => ({ id, pos:{x,y,z}, team:tm, alive:true, invisible:false, sliding:false, stance:0, data:{}, ...extras});
const g = (mode='tdm') => ({
  running:true, local:{alive:true,team:'red',mv:{lean:0}}, modeState:{type:mode}, phase:'match',
  rig:{yaw:0,pitch:0}, pos:{x:0,y:0,z:0}, map:{boxes:[]}, net:{id:'me'},
  remotes:{list:[]},zremotes:{list:[]},bremotes:{list:[]},
});
const o = normaliseOptions({...DEFAULTS, enabled:true});
test('defaults and input validation are constrained', () => {
  assert.equal(normaliseOptions(null).enabled,false);
  assert.equal(normaliseOptions({enabled:'yes',fov:NaN,smoothing:-2,maxDistance:999,activation:'invalid'}).enabled,false);
  assert.equal(normaliseOptions({fov:999}).fov,45);
  assert.equal(normaliseOptions({smoothing:-2}).smoothing,0);
  assert.equal(normaliseOptions({maxDistance:999}).maxDistance,420);
  assert.equal(normaliseOptions({activation:'invalid'}).activation,'ads');
});
test('centered enemy ahead is selected, including exact yaw and pitch', () => {
  const game=g(); game.remotes.list=[r('enemy',0,0,-15)];
  const t=findTarget(game,o,helper);
  assert.equal(t.id,'p:enemy'); assert.ok(Math.abs(t.yaw)<1e-10); assert.ok(t.pitch>0);
});
test('ignore same team, self, invisible and dead players', () => {
  const game=g(); game.remotes.list=[r('friend',0,0,-5,0),r('me',0,0,-5,1),r('invis',0,0,-6,1,{invisible:true}),r('dead',0,0,-8,1,{alive:false}),r('enemy',0,0,-13)];
  assert.equal(findTarget(game,o,helper)?.id,'p:enemy');
});
test('FOV rejects off-axis and behind camera', () => {
  const game=g(); game.remotes.list=[r('side',10,0,0),r('behind',0,0,10)];
  assert.equal(findTarget(game,o,helper),null);
});
test('world collision excludes obscured enemies when LOS enabled', () => {
  const game=g(); game.remotes.list=[r('enemy',0,0,-10)];
  const blocked={...helper,rayWorld:(_eye,_dir,_boxes,_limit)=>2};
  assert.equal(findTarget(game,o,blocked),null);
  assert.equal(findTarget(game,{...o,visibility:false},blocked).id,'p:enemy');
});
test('battle royale targets enemy teams but never squadmates; zombie mode filters humans', () => {
  const battle=g('br'); battle.you={tm:3}; battle.local.team='gold';
  battle.remotes.list=[r('squadmate',0,0,-4,3), r('other',0,0,-8,0)];
  assert.equal(findTarget(battle,o,helper).id,'p:other');
  assert.deepEqual(opponents(battle).map(q=>q.id),['p:other']);
  const zombie=g('zm'); zombie.remotes.list=[r('human',0,0,-4)]; zombie.zremotes.list=[r('zombie',0,0,-7)];
  assert.equal(findTarget(zombie,o,helper).id,'z:zombie');
});
test('spirit body owner and teams must be filtered',()=>{
  const game=g(); game.bremotes.list=[r('mine',0,0,-4,1,{data:{owner:'me'}}), r('ally',0,0,-6,0),r('foe',0,0,-9,1)];
  assert.equal(findTarget(game,o,helper).id,'b:foe');
});
test('nearest to crosshair prioritized over nearer in physical distance',()=>{
  const game=g(); game.remotes.list=[r('left',-2,0,-8),r('center',0,0,-30)];
  assert.equal(findTarget(game,o,helper).id,'p:center');
});
test('sticky target preserves a viable target close to competitor',()=>{
  const game=g(); game.remotes.list=[r('left',-.3,0,-20),r('right',.2,0,-20)];
  assert.equal(findTarget(game,o,helper)?.id,'p:right');
  assert.equal(findTarget(game,o,helper,'p:left')?.id,'p:left');
});
test('range and invalid gameplay phase block targeting',()=>{
  const game=g(); game.remotes.list=[r('enemy',0,0,-120)];
  assert.equal(findTarget(game,{...o,maxDistance:40},helper),null);
  game.local.alive=false; assert.equal(findTarget(game,o,helper),null);
  game.local.alive=true;game.running=false; assert.equal(findTarget(game,o,helper),null);
});
test('head/body and sliding positions are calculated consistently',()=>{
  const remote=r('x',1,2,-3,1,{sliding:true});
  assert.equal(getAimPoint(remote,'head',player).y,3.02);
  assert.ok(getAimPoint(remote,'body',player).y<getAimPoint(remote,'head',player).y);
});
test('smoothing frame rate independent and instant mode exact',()=>{
  const desired={yaw:1,pitch:.5};
  const sixty=aimStep(0,0,desired,1/60,100,1.56);
  const thirty=aimStep(0,0,desired,1/30,100,1.56);
  const sixty2=aimStep(sixty.yaw,sixty.pitch,desired,1/60,100,1.56);
  assert.ok(Math.abs(sixty2.yaw-thirty.yaw)<1e-12);
  assert.equal(aimStep(0,0,desired,.016,0,1.56).yaw,1);
  assert.ok(Math.abs(wrapAngle(Math.PI+.1)-(-Math.PI+.1))<1e-10);
});

const { opponents, projectToScreen, predictDodge, dodgeMovement } = await import('../aim-core.mjs');
test('ESP collection respects teams, death and modes but does not hide blocked targets',()=>{
  const game=g(); game.remotes.list=[r('friend',2,0,-4,0),r('enemy',4,0,-8),r('invisible',7,0,-9,1,{invisible:true}),r('dead',0,0,-2,1,{alive:false})];
  assert.deepEqual(opponents(game).map(o=>o.id),['p:enemy','p:invisible']);
  game.modeState.type='zm';game.zremotes.list=[r('zombie',0,0,-9)];
  assert.deepEqual(opponents(game).map(o=>o.id),['z:zombie']);
});
test('3D world projection maps visible target to screen centre and rejects behind',()=>{
  const camera={matrixWorldInverse:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},projectionMatrix:{elements:[1,0,0,0,0,1,0,0,0,0,-1,-1,0,0,-.2,0]}};
  const hit=projectToScreen({x:0,y:0,z:-10},camera,1280,720);
  assert.equal(hit.x,640);assert.equal(hit.y,360);assert.equal(hit.inside,true);
  assert.equal(projectToScreen({x:0,y:0,z:10},camera,1280,720),null);
  assert.equal(projectToScreen({x:NaN,y:0,z:-10},camera,1280,720),null);
});
test('evasion predicts aimed line of sight and preserves firing inputs',()=>{
  const game=g();game.input={locked:true,enabled:true};game.local.mv={x:0,y:0,z:0};
  game.remotes.list=[r('enemy',0,0,18,1,{yaw:0,data:{aim:1,pitch:0}})];
  const move=predictDodge(game,[],helper,{dodgeRange:45},null,20);
  assert.ok(move);
  const input=dodgeMovement(move,0,{forward:true,backward:false,right:false,left:false,fire:true,skill:true});
  assert.equal(input.fire,true);assert.equal(input.skill,true);assert.equal(input.left,true);assert.equal(input.forward,false);
});
test('evasion ignores friendly, nonaiming, behind-wall and far-away sightlines',()=>{
  const game=g();game.input={locked:true,enabled:true};game.local.mv={x:0,y:0,z:0};
  const enemy=r('enemy',0,0,18,1,{yaw:0,data:{aim:1,pitch:0}});
  game.remotes.list=[enemy];
  assert.equal(predictDodge(game,[],{...helper,rayWorld:()=>1},{dodgeRange:45}),null);
  enemy.data.aim=0;assert.equal(predictDodge(game,[],helper,{dodgeRange:45}),null);
  enemy.data.aim=1;enemy.team=0;assert.equal(predictDodge(game,[],helper,{dodgeRange:45}),null);
  enemy.team=1;enemy.pos.z=80;assert.equal(predictDodge(game,[],helper,{dodgeRange:45}),null);
  game.local.alive=false;assert.equal(predictDodge(game,[],helper,{dodgeRange:45}),null);
});
test('projectile proximity anticipates grenade without requiring enemy ADS and expires stale traces',()=>{
  const game=g();game.input={locked:true,enabled:true};game.local.mv={x:0,y:0,z:0};
  const sample={x:3,y:1,z:0,kind:'frag',stuck:true,fuse:1,time:100,vx:0,vz:0};
  const settings={dodgeRange:45};
  const move=predictDodge(game,[sample],helper,settings,null,100.15);
  assert.ok(move && move.x<0,'evade away from grenade on positive X');
  assert.equal(predictDodge(game,[sample],helper,settings,null,102),null,'no stale grenades');
  assert.equal(predictDodge(game,[{...sample,kind:'smoke'}],helper,settings,null,100.15),null);
});
test('evasion refuses unsafe movement towards a physical wall or outside bounds',()=>{
  const game=g();game.input={locked:true,enabled:true};game.local.mv={x:0,y:0,z:0};game.map.bound=2;
  game.remotes.list=[r('enemy',0,0,8,1,{yaw:0,data:{aim:1,pitch:0}})];
  assert.equal(predictDodge(game,[],{...helper,rayWorld:()=>0},{dodgeRange:45}),null);
  game.map.bound=.5;
  assert.equal(predictDodge(game,[],helper,{dodgeRange:45}),null);
});
test('new settings strictly validate type and range',()=>{
  const opts=normaliseOptions({esp:'true',dodge:1,espDistance:1000,dodgeRange:2});
  assert.equal(opts.esp,false);assert.equal(opts.dodge,false);
  assert.equal(opts.espDistance,250);assert.equal(opts.dodgeRange,10);
});


test('2026-10-09 build: authoritative four-team BR snapshot takes priority over stale local team',()=>{
  const game=g('br'); game.local.team='red'; game.you={tm:2};
  game.remotes.list=[r('squad',0,0,-4,2),r('enemy',0,0,-9,1)];
  assert.equal(ownTeamIndex(game),2);
  assert.equal(findTarget(game,o,helper)?.id,'p:enemy');
  assert.deepEqual(opponents(game).map(x=>x.id),['p:enemy']);
});

test('2026-10-09 build: spectators, scorestreak views, helicopter and airborne players are not controllable',()=>{
  const game=g('tdm');game.input={locked:true,enabled:true};
  assert.equal(avatarControllable(game),true);
  game.you={tm:0,ss:{view:{k:'chopper',x:1,y:2,z:3}}};
  assert.equal(avatarControllable(game),false);
  game.you.ss.view=null;game.local.inView=true;
  assert.equal(avatarControllable(game),false);
  game.local.inView=false;game.local.mv.heli=true;
  assert.equal(avatarControllable(game),false);
  game.local.mv.heli=false;game.local.mv.air=true;
  assert.equal(avatarControllable(game),false);
  game.local.mv.air=false;game.local.down=true;
  assert.equal(avatarControllable(game),false);
  game.local.down=false;game.local.frozen=true;
  assert.equal(avatarControllable(game),false);
});
