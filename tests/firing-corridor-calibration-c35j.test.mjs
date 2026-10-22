import test from 'node:test';
import assert from 'node:assert/strict';
import {publicCorridorC35J,serverGeometryLabelC35J,FiringCorridorCalibrationObserverC35J} from '../lab/arena/firing-corridor-calibration-c35j.mjs';
const cmd=Object.freeze({fire:true,aim:true,forward:true,slot:-1});
function client({boxes=[],y=0,remoteY=0,remoteX=2,second=false,yaw=Math.PI,pitch=0,stale=false}={}){
 const now=2;
 const r=(id,x,z)=>({id,team:'blue',alive:true,pos:{x,y:remoteY,z},stance:0,buf:stale?[{t:1.1,x,z},{t:1.2,x,z}]:[{t:1.86,x,z},{t:1.96,x,z}]});
 return {pos:{x:2,y,z:30},local:{id:'trainee',team:'red',alive:true,mv:{x:2,y,z:30,stance:0,lean:0,onGround:true},hp:100,armor:50,maxArmor:50,
  weapon:{id:'m4a1',magSize:30},ws:{slot:0,guns:[{id:'m4a1',mag:25}]}},
  remotes:{list:[r('bot2',remoteX,55),...(second?[r('bot3',2,45)]:[])]},rig:{yaw,pitch},map:{bound:150,boxes}};
}
function world(boxes=[],target={x:2,y:0,z:55}){
 const targetPlayer={id:'bot2',alive:true,team:'blue',...target,stance:0,slideT:0};
 const p={id:'trainee',alive:true,x:2,y:0,z:30,yaw:Math.PI,pitch:0,stance:0,slideT:0,lean:0,team:'red'};
 const game={map:{boxes},players:new Map([[targetPlayer.id,targetPlayer]]),worldBoxes(){return boxes},hostile(a,b){return a.team!==b.team}};
 return {game,p};
}
test('low cover blocks footprint but does not block public 3D eye to body',()=>{
 const b=[{x0:1,x1:3,y0:0,y1:.6,z0:39,z1:41}];const p=publicCorridorC35J(client({boxes:b}),cmd,2);
 assert.equal(p.valid,true,JSON.stringify(p));assert.equal(p.legacy2D,false);assert.equal(p.corrected2D,false);assert.equal(p.nearest3DClear,true);
});
test('tall cover blocks public 3D body ray and 2D footprint',()=>{
 const b=[{x0:1,x1:3,y0:0,y1:3,z0:39,z1:41}];const p=publicCorridorC35J(client({boxes:b}),cmd,2);
 assert.equal(p.nearest3DClear,false);assert.equal(p.legacy2D,false);
});
test('raised floor can block 3D while unobstructed ground footprint is impossible only with vertical obstacle',()=>{
 const b=[{x0:1,x1:3,y0:3,y1:5,z0:39,z1:41}];const p=publicCorridorC35J(client({boxes:b,remoteY:4}),cmd,2);
 assert.equal(p.legacy2D,false);assert.equal(p.corrected2D,false);assert.equal(p.nearest3DClear,true); // shooter-to-raised target ray stays below y=3 at obstacle
});
test('missing public y geometry fails closed instead of guessing a 2D label',()=>{
 const c=client();delete c.remotes.list[0].pos.y;
 const p=publicCorridorC35J(c,cmd,2);assert.equal(p.valid,false);
 assert.ok(p.reasons.includes('missing-public-target-height'));
});
test('missing box y0 fails closed and does not convert footprint to true LOS',()=>{
 const c=client({boxes:[{x0:1,x1:3,z0:40,z1:42,y1:2}]});const p=publicCorridorC35J(c,cmd,2);
 assert.equal(p.valid,false);assert.ok(p.reasons.includes('invalid-public-3d-map'));
});
test('stale target observations are not relabeled as a clear lane',()=>{
 const p=publicCorridorC35J(client({stale:true}),cmd,2);assert.equal(p.valid,false);assert.equal(p.nearest3DClear,null);
});
test('angular aim-candidate distinction from nearest public target',()=>{
 const c=client({second:true,remoteX:2,yaw:Math.PI});
 c.remotes.list[0].pos={x:2,y:0,z:55};
 c.remotes.list[1].pos={x:12,y:0,z:37}; // closer by distance, far off-axis
 const p=publicCorridorC35J(c,cmd,2);
 assert.equal(p.valid,true);assert.equal(p.targetId,'bot3');assert.equal(p.nearestHostileId,'bot3');
 assert.equal(p.aimCandidateId,'bot2');assert.equal(p.aimCandidateDiffers,true);
});
test('oracle after-step only compares static and full world including temporary obstacles',()=>{
 const {game,p}=world([]);game.worldBoxes=()=>[{x0:1,x1:3,y0:0,y1:4,z0:39,z1:41}];
 const o=serverGeometryLabelC35J(game,p,'bot2','bot2');assert.equal(o.nearest.staticClear,true);assert.equal(o.nearest.worldClear,false);assert.equal(o.dynamicBoxes,1);
});
test('observer logs public BEFORE server oracle and does not mutate command',()=>{
 const o=new FiringCorridorCalibrationObserverC35J({matchId:'a',policy:'observe'});const {game,p}=world([]);
 o.beforeStep({now:2,client:client(),incumbent:cmd,applied:cmd,serverShots:0,serverHits:0});
 assert.equal(o.rows.length,0);assert.equal('postStepOracle' in (o.pending?.row||{}),false);
 assert.throws(()=>o.beforeStep({now:3,client:client(),incumbent:cmd,applied:cmd,serverShots:0,serverHits:0}),/pending/);
 o.afterStep({world:game,player:p,serverShots:1,serverHits:1});let v=o.finish();
 assert.equal(v.counts.serverShots,1);assert.equal(v.counts.serverHits,1);assert.equal(v.rows[0].postStepOracle.phase,'POST_GAME_STEP_DIAGNOSTIC_ONLY');assert.deepEqual(cmd,{fire:true,aim:true,forward:true,slot:-1});
});
test('fire change is detected, not a valid calibration sample',()=>{
 const o=new FiringCorridorCalibrationObserverC35J({matchId:'b',policy:'lateral'}),{game,p}=world([]);
 o.beforeStep({now:2,client:client(),incumbent:cmd,applied:{...cmd,fire:false},serverShots:0,serverHits:0});
 o.afterStep({world:game,player:p,serverShots:0,serverHits:0});assert.throws(()=>o.finish(),/modified firing/);
});
test('rows truncation, no-fire ticks, monotonic counters, unfinished tick are auditable',()=>{
 const o=new FiringCorridorCalibrationObserverC35J({matchId:'c',policy:'observe',maxRows:1}),{game,p}=world([]);
 o.beforeStep({now:2,client:client(),incumbent:cmd,applied:cmd,serverShots:0,serverHits:0});
 assert.throws(()=>o.finish(),/unclosed/);o.afterStep({world:game,player:p,serverShots:1,serverHits:0});
 o.beforeStep({now:2.1,client:client(),incumbent:cmd,applied:cmd,serverShots:1,serverHits:0});
 o.afterStep({world:game,player:p,serverShots:2,serverHits:0});
 o.beforeStep({now:2.2,client:client(),incumbent:{fire:false},applied:{fire:false},serverShots:2,serverHits:0});
 o.afterStep({world:game,player:p,serverShots:2,serverHits:0});
 const v=o.finish();assert.equal(v.counts.fireTicks,2);assert.equal(v.counts.storedDropped,1);assert.equal(v.rows.length,1);
});

test('number-coded public teams are filtered without changing legacy C35I observer',()=>{
 const c=client({second:true});c.you={tm:0};c.remotes.list[0].team=0;c.remotes.list[1].team=1;c.remotes.list[0].pos.z=40;c.remotes.list[1].pos.z=55;
 const p=publicCorridorC35J(c,cmd,2);
 assert.equal(p.valid,true);assert.equal(p.legacyTargetIsHostile,false);
 assert.equal(p.nearestHostileId,'bot3');assert.equal(p.observedHostiles,1);
});
test('unknown public teams cannot be silently treated as hostiles',()=>{
 const c=client();c.local.team='unknown';delete c.you;
 assert.equal(publicCorridorC35J(c,cmd,2).valid,false);
});
