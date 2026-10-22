import test from 'node:test';
import assert from 'node:assert/strict';
import {routeToProtectedCover,planProtectedRecovery,observeRespawnWindow,planRespawnAdvantage} from '../defensive-core.mjs';
import {autoThrowableDecision,ballisticThrow} from '../throwable-core.mjs';
import {THROWABLES} from '../lab/arena/source/shared/skills.js';
import {cameraOccluded} from '../camera-tactics.mjs';
import {Game as ServerGame} from '../lab/arena/source/server/game.js';
import neon from '../lab/arena/source/maps/neon.js';
const box={x0:-2,x1:2,z0:6,z1:8,y0:0,y1:4};
const threat={id:'e1',x:0,y:0,z:18,yaw:0,pitch:0,aim:true,recentFire:true};
const map={boxes:[box],bound:68};
function player(overrides={}) {return {modeState:{type:'tdm'},map,rig:{yaw:0,pitch:0},running:true,phase:'match',you:{tm:0},net:{id:'me'},local:{alive:true,hp:100,armor:30,team:'red',mv:{x:0,y:0,z:0,onGround:true},ws:{reloading:true,plateT:0}},remotes:{list:[]},...overrides};}
test('reload selects a protected route and holds ground on reaching cover',()=>{
 const g=player(),mem={};g.local.mv.x=6;const a=planProtectedRecovery(g,[threat],10,mem,{});
 assert.ok(a?.reason.startsWith('recovery-'),`route=${JSON.stringify(a)}`);
 assert.ok(mem.cover?.blocked>=1);
 assert.ok(mem.cover?.route?.length);
 assert.ok(Number.isFinite(mem.cover?.travelExposure));
 g.local.mv={...mem.cover.point,onGround:true};
 const b=planProtectedRecovery(g,[threat],10.1,mem,{});
 assert.match(b?.reason||'',/hold/);
});
test('armor plating is treated as active recovery including first pressed tick',()=>{
 const g=player();g.local.ws.reloading=false;let a=planProtectedRecovery(g,[threat],9,{}, {plate:true});
 assert.ok(a && a.reason.startsWith('recovery-'));
 g.local.ws.plateT=2.6;a=planProtectedRecovery(g,[threat],10,{}, {});
 assert.ok(a);
});
test('no recover state never hijacks movement',()=>{
 const g=player();g.local.ws.reloading=false;
 assert.equal(planProtectedRecovery(g,[threat],10,{},{}),null);
});
test('cover must block an actual shooter LOS and be reachable by A*',()=>{
 const g=player();const p=routeToProtectedCover(g.map,g.local.mv,[threat]);
 assert.ok(p?.blocked>=1);
 const open=routeToProtectedCover({boxes:[],bound:68},g.local.mv,[threat]);
 assert.equal(open,null);
});
test('observed dead rival opens temporary respawn staging window',()=>{
 const g=player({map:neon});g.remotes.list=[{id:'e',team:1,alive:true,pos:{x:0,z:-48}}];const state={};
 assert.equal(observeRespawnWindow(g,5,state),null);
 g.remotes.list[0].alive=false;
 assert.equal(observeRespawnWindow(g,6,state)?.count,1);
 assert.ok(observeRespawnWindow(g,10,state));
 assert.equal(observeRespawnWindow(g,11,state),null);
});
test('respawn staging does not run outside TDM or during living close enemy pressure',()=>{
 const g=player({map:neon});g.remotes.list=[{id:'e',team:1,alive:false,pos:{x:0,z:-58}}];
 const state={};
 assert.ok(observeRespawnWindow(g,5,state));
 g.modeState.type='br';assert.equal(planRespawnAdvantage(g,5.2,state),null);
 g.modeState.type='tdm';g.remotes.list.push({id:'alive',team:1,alive:true,pos:{x:5,z:0}});
 assert.equal(planRespawnAdvantage(g,5.3,state),null);
});
test('no fabricated respawn intelligence without public spawn data',()=>{
 const g=player({map:{boxes:[],bound:68}});g.remotes.list=[{id:'e',team:1,alive:false}];
 assert.equal(planRespawnAdvantage(g,10,{}),null);
});
test('throwable ignores empty inventory, manual throw, busy actions and illegal states',()=>{
 const g=player();g.local.thr={id:'impact',n:1};g.local.ws.reloading=false;
 const c=[{id:'e',x:0,y:0,z:-18}];
 assert.equal(autoThrowableDecision(g,{throw:true},null,c,12,{},THROWABLES),null);
 assert.equal(autoThrowableDecision(g,{plate:true},null,c,12,{},THROWABLES),null);
 g.local.thr.n=0;assert.equal(autoThrowableDecision(g,{},null,c,12,{},THROWABLES),null);
});
test('stim fires only when wounded and cooldown prevents double-edge',()=>{
 const g=player();g.local.ws.reloading=false;g.local.thr={id:'stim',n:2};g.local.hp=40;
 const memory={},one=autoThrowableDecision(g,{},null,[],7,memory,THROWABLES);
 assert.equal(one?.throw,true);
 assert.equal(autoThrowableDecision(g,{},null,[],7.01,memory,THROWABLES),null);
 assert.equal(autoThrowableDecision(g,{},null,[],7.1,memory,THROWABLES),null);
});
test('impact and frag never throw into nearby teammate',()=>{
 const g=player();g.local.ws.reloading=false;g.local.thr={id:'impact',n:2};
 g.remotes.list=[{alive:true,team:0,pos:{x:0,z:-20}}];
 const c=[{id:'e',x:0,y:0,z:-20}];
 assert.equal(autoThrowableDecision(g,{},null,c,10,{},THROWABLES),null);
});
test('ballistic arc refuses solid wall or unsafe range',()=>{
 const g=player();g.local.thr={id:'impact',n:1};
 assert.equal(ballisticThrow(g,{x:0,y:0,z:-1},THROWABLES.impact),null);
 const safe=ballisticThrow({...g,map:{boxes:[],bound:68}},{x:0,y:0,z:-19},THROWABLES.impact);
 assert.ok(safe && Number.isFinite(safe.pitch),`solution=${JSON.stringify(safe)}`);
 assert.equal(ballisticThrow({...g,map:{boxes:[{x0:-4,x1:4,y0:0,y1:30,z0:-11,z1:-8}],bound:68}},{x:0,y:0,z:-19},THROWABLES.impact),null);
});
test('authoritative input edge consumes a real throwable once',()=>{
 const events=[];const g=new ServerGame({to(){return {emit(){}};}},'classic');g.config.mode='tdm';g.config.map='neon';
 const p=g.addPlayer({id:'thrower',emit:(e,d)=>events.push({e,d})},{name:'Thrower'});
 p.nextThrow='frag';g.startMatch();const initial=p.thr.n;
 g.queueInput(p,{seq:1,ep:p.epoch,slot:-1,throw:true,yaw:0,pitch:.3,lt:0});g.step();
 assert.equal(p.thr.n,initial-1);
 g.queueInput(p,{seq:2,ep:p.epoch,slot:-1,throw:true,yaw:0,pitch:.3,lt:0});g.step();
 assert.equal(p.thr.n,initial-1);
});

test('short cover blocks feet but does not claim to block head-level fire',()=>{
  const m={boxes:[{x0:-1,x1:1,z0:6,z1:8,y0:0,y1:1.0}]};
  assert.equal(cameraOccluded(m,{x:0,y:1.5,z:10},{x:0,y:1.4,z:0}),false);
  assert.equal(cameraOccluded(m,{x:0,y:.8,z:10},{x:0,y:.8,z:0}),true);
});
test('armor in temporarily empty intel holds rather than following exposed combat route',()=>{
  const g=player();g.local.ws.reloading=false;g.local.ws.plateT=2.3;
  assert.equal(planProtectedRecovery(g,[],10,{},{}).reason,'armor-stay-concealed');
});

test('automatic G inventory reads authoritative snapshot you.thr (not non-existent local.thr)',()=>{
 const g=player();g.local.ws.reloading=false;g.local.hp=33;delete g.local.thr;g.you.thr={id:'stim',n:1};
 assert.equal(autoThrowableDecision(g,{},null,[],22,{},THROWABLES)?.reason,'stim-recovery');
});

test('automatic impact emits a legal one-tick pitch/yaw command on clear terrain',()=>{
 const g=player({map:{boxes:[],bound:68}});g.local.ws.reloading=false;
 g.you.thr={id:'impact',n:1};
 const enemies=[{id:'e',x:0,y:0,z:-19,yaw:Math.PI}];
 const m={};const action=autoThrowableDecision(g,{slot:-1},null,enemies,8,m,THROWABLES);
 assert.equal(action?.throw,true);
 assert.ok(Number.isFinite(action.yaw)&&Number.isFinite(action.pitch));
 assert.equal(autoThrowableDecision(g,{slot:-1},null,enemies,8.01,m,THROWABLES),null);
});

test('visible enemy death yields a reachable public spawn staging position with sightline',()=>{
 const g=player({map:neon});g.remotes.list=[{id:'dead',team:1,alive:false,pos:{x:0,z:-56}}];
 const m={},dir=planRespawnAdvantage(g,5,m);
 assert.equal(dir?.reason,'respawn-advantage-route');
 assert.ok(m.target && m.route?.length);
 const spawn=neon.spawns.blue[0];
 assert.ok(Math.hypot(spawn.x-m.target.x,spawn.z-m.target.z)>15);
});
