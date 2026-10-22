import test from 'node:test';
import assert from 'node:assert/strict';
import {publicHostilesC35K,publicShotFeaturesC35K,publicLOSStratumC35K,PublicTargetLOSObserverC35K} from '../lab/arena/public-target-los-c35k.mjs';
const command=Object.freeze({fire:true,aim:true,forward:false,left:false,right:false});
function make({boxes=[],team='red',codes=true,remotes}={}){
 const r=(id,tm,x,z,age=1.96)=>({id,team:tm,alive:true,invisible:false,pos:{x,y:0,z},stance:0,buf:[{t:age-.1,x,z},{t:age,x,z}]});
 return {you:{tm:codes?0:undefined},pos:{x:2,y:0,z:30},rig:{yaw:Math.PI,pitch:0},
  local:{team,alive:true,weapon:{id:'m4a1'},ws:{slot:0,guns:[{id:'m4a1',mag:25}]},
   mv:{lean:0,stance:0,eye:1.7,onGround:true}},
  map:{boxes},remotes:{list:remotes??[r('ally',0,2,39),r('enemy',1,2,55)]}};
}
const box=(y1,y0=0)=>({x0:1,x1:3,z0:39,z1:41,y0,y1});
test('numeric remote teams vs local red string never treats nearest ally as hostile',()=>{
 const c=make();const s=publicShotFeaturesC35K(c,2,command);
 assert.equal(s.valid,true);assert.equal(s.targetId,'enemy');
 assert.equal(s.allyCount,1);assert.equal(s.hostileCount,1);
 const los=publicLOSStratumC35K(c,2,command);
 assert.equal(los.legacyC12TargetId,'ally');assert.equal(los.legacyTargetHostile,false);
});
test('blue local team and red remote numeric are canonicalized',()=>{
 const c=make({team:'blue'});c.you.tm=1;
 const s=publicShotFeaturesC35K(c,2,command);assert.equal(s.targetId,'ally');
});
test('conflicting public own team fails closed',()=>{
 const c=make();c.you.tm=1;
 assert.equal(publicHostilesC35K(c,2).reason,'conflicting-public-team');
 assert.equal(publicShotFeaturesC35K(c,2).targetId,null);
});
test('unknown team identity fails closed',()=>{
 const c=make({team:'unknown',codes:false});assert.equal(publicHostilesC35K(c,2).valid,false);
});
test('unknown remote team is excluded without inventing opponent',()=>{
 const c=make();c.remotes.list[1].team=777;
 const x=publicHostilesC35K(c,2);assert.equal(x.hostiles.length,0);assert.equal(x.unknown,1);
});
test('stale and future snapshots excluded; no post-step fallback',()=>{
 const c=make();c.remotes.list[1].buf.at(-1).t=1.6;
 assert.equal(publicShotFeaturesC35K(c,2).valid,false);
 c.remotes.list[1].buf.at(-1).t=2.001;
 assert.equal(publicShotFeaturesC35K(c,2).valid,false);
});
test('low cover: blocks footprint but body-center ray is clear',()=>{
 const x=publicLOSStratumC35K(make({boxes:[box(.6)]}),2,command);
 assert.equal(x.geometryValid,true);assert.equal(x.nearest2DClear,false);assert.equal(x.nearest3DClear,true);
 assert.equal(x.coverType,'below-ray');
});
test('tall cover: both footprint and body-center 3d are blocked',()=>{
 const x=publicLOSStratumC35K(make({boxes:[box(3)]}),2,command);
 assert.equal(x.nearest2DClear,false);assert.equal(x.nearest3DClear,false);
 assert.equal(x.coverType,'intersects-ray-height');
});
test('overhead cover footprint still blocks 2d but ray is clear',()=>{
 const x=publicLOSStratumC35K(make({boxes:[box(5,4)]}),2,command);
 assert.equal(x.nearest3DClear,true);assert.equal(x.coverType,'above-ray');
});
test('unknown box height causes geometrical abstention',()=>{
 const c=make({boxes:[{x0:1,x1:3,z0:39,z1:41,y1:2}]});
 assert.equal(publicLOSStratumC35K(c,2,command).geometryValid,false);
});
test('empty geometry does not claim a hit; distinguishes aim target from closest',()=>{
 const c=make();c.remotes.list.push({id:'side',team:1,alive:true,pos:{x:15,y:0,z:34},stance:0,buf:[{t:1.8,x:15,z:34},{t:1.96,x:15,z:34}]});
 const s=publicLOSStratumC35K(c,2,command);
 assert.equal(s.nearest3DClear,true);assert.equal(s.aimCandidateId,'enemy');
 assert.equal(s.geometryValid,true);assert.equal('serverHit' in s,false);
});
test('observer enforces temporal boundary, never modifies original commands',()=>{
 const ob=new PublicTargetLOSObserverC35K({matchId:'case'});
 ob.beforeStep({now:2,client:make(),incumbent:command,applied:command,serverShots:0,serverHits:0});
 assert.equal(ob.rows.length,0);assert.equal('serverLabelsAfterStep' in ob.pending.row,false);
 assert.throws(()=>ob.beforeStep({now:2.1,client:make(),incumbent:command,applied:command,serverShots:0,serverHits:0}),/order/);
 ob.afterStep({serverShots:1,serverHits:1});
 const v=ob.finish();assert.equal(v.counts.fireTicks,1);assert.equal(v.counts.shots,1);
 assert.equal(v.counts.identityMismatch,1);assert.equal(v.counts.legacyNotHostile,1);
 assert.equal(v.rows[0].serverLabelsAfterStep.hits,1);
 assert.equal(command.fire,true);
});
test('observer rejects fire tampering and monotonic violations',()=>{
 const o=new PublicTargetLOSObserverC35K({matchId:'tamper'});
 o.beforeStep({now:2,client:make(),incumbent:command,applied:{fire:false},serverShots:0,serverHits:0});
 assert.throws(()=>o.afterStep({serverShots:-1,serverHits:0}),/nonmonotonic/);
 o.afterStep({serverShots:1,serverHits:0});assert.throws(()=>o.finish(),/audit gate/);
});
test('observer row budget does not bias denominators',()=>{
 const o=new PublicTargetLOSObserverC35K({matchId:'truncate',maxRows:1});
 for(let i=0;i<3;i++){
  o.beforeStep({now:2+i/60,client:make(),incumbent:command,applied:command,serverShots:i,serverHits:0});
  o.afterStep({serverShots:i+1,serverHits:0});
 }
 const v=o.finish();assert.equal(v.counts.fireTicks,3);assert.equal(v.counts.storedDropped,2);
 assert.equal(v.counts.shots,3);assert.equal(v.rows.length,1);
});
