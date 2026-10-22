import test from 'node:test';import assert from 'node:assert/strict';
import {publicFiringLaneC35I,PublicFiringCorridorObserverC35I} from '../lab/arena/public-firing-corridor-c35i.mjs';
function fixture(now=2,{weaponId='m4a1',boxes=[],target={x:2,z:55},yaw=Math.PI,stale=false}={}){
 return {pos:{x:2,y:0,z:30},local:{id:'trainee',team:'red',hp:100,armor:50,maxArmor:50,alive:true,mv:{onGround:true,y:0,stance:0},weapon:{id:weaponId,magSize:30},ws:{slot:0,guns:[{id:weaponId,mag:25}]}},remotes:{list:[{id:'bot2',team:'blue',alive:true,pos:{x:target.x,y:0,z:target.z},buf:stale?[{t:1,x:target.x,z:target.z},{t:1.1,x:target.x,z:target.z}]:[{t:now-.12,x:target.x,z:target.z},{t:now-.04,x:target.x,z:target.z}]}]},rig:{yaw},map:{bound:150,boxes}};
}
const cmd={fire:true,aim:true,forward:true,slot:-1};
test('public weapon metadata distinguishes shotgun SMG AR and marksman falloff',()=>{
 const ranges=['aa12','mp5sd','m4a1','hk_sl8','l115a3'].map(weaponId=>publicFiringLaneC35I(fixture(2,{weaponId}),cmd,2).weaponFalloffEnd);
 assert.deepEqual(ranges,[16,34,60,85,45]);
});
test('aligned public target, effective range and bilateral clearance create positive score',()=>{
 const p=publicFiringLaneC35I(fixture(),cmd,2);
 assert.equal(p.valid,true,JSON.stringify(p));assert.equal(p.orientation,'aligned');assert.equal(p.rangeBand,'near');assert.equal(p.staticFootprintClear,true);
 assert.equal(p.sideClearance.left,true);assert.equal(p.sideClearance.right,true);assert.ok(p.laneScore>.9);
});
test('opposite aim direction has score zero without declaring a true miss',()=>{
 const p=publicFiringLaneC35I(fixture(2,{yaw:0}),cmd,2);
 assert.equal(p.orientation,'off-axis');assert.equal(p.laneScore,0);
});
test('public static solid directly across the target ray blocks footprint proxy',()=>{
 const boxes=[{x0:1.5,x1:2.5,z0:42,z1:44,y0:0,y1:4}];
 const p=publicFiringLaneC35I(fixture(2,{boxes}),cmd,2);
 assert.equal(p.valid,true);assert.equal(p.staticFootprintClear,false);assert.equal(p.laneScore,0);
});
test('parallel ray OUTSIDE the box does not falsely report occlusion',()=>{
 const boxes=[{x0:4,x1:6,z0:40,z1:44,y0:0,y1:4}];
 const p=publicFiringLaneC35I(fixture(2,{boxes}),cmd,2);
 assert.equal(p.staticFootprintClear,true);
});
test('stale observation and incomplete geometry explicitly fail closed',()=>{
 assert.equal(publicFiringLaneC35I(fixture(2,{stale:true}),cmd,2).valid,false);
 const c=fixture();delete c.map.boxes;
 const p=publicFiringLaneC35I(c,cmd,2);assert.equal(p.valid,false);assert.ok(p.reasons.includes('invalid-public-map'));
});
test('passive observer leaves original/applied controls unchanged and counts unsampled ticks',()=>{
 const o=new PublicFiringCorridorObserverC35I({matchId:'m1',policy:'observe',samplePeriod:2});
 const x=fixture();const unchanged={...cmd};
 for(let i=0;i<5;i++){
  o.beforeStep({now:2+i/60,client:fixture(2+i/60),incumbent:cmd,applied:cmd,serverShots:i,serverHits:0});
  o.afterStep({serverShots:i+1,serverHits:0});
 }
 const out=o.finish();assert.deepEqual(cmd,unchanged);
 assert.equal(out.counts.sampledFire,3);assert.equal(out.counts.unsampledFire,2);
 assert.equal(out.counts.sampledServerShots,3);assert.equal(out.rows.length,3);
});
test('server outcome labels are applied AFTER decision and require valid order',()=>{
 const o=new PublicFiringCorridorObserverC35I({matchId:'m2',policy:'lateral',samplePeriod:1});
 assert.throws(()=>o.afterStep({serverShots:0,serverHits:0}),/missing/);
 o.beforeStep({now:2,client:fixture(),incumbent:cmd,applied:{...cmd,right:true},serverShots:1,serverHits:0});
 assert.throws(()=>o.beforeStep({now:2.01,client:fixture(),incumbent:cmd,applied:cmd,serverShots:1,serverHits:0}),/pending/);
 assert.throws(()=>o.afterStep({serverShots:0,serverHits:0}),/nonmonotonic/);
 o.afterStep({serverShots:2,serverHits:1});const t=o.finish();
 assert.equal(t.rows[0].serverLabelsAfterStep.hits,1);assert.equal(t.counts.macroModifiedSamples,1);
});
test('fire suppression or fire injection is detectable rather than silently scored',()=>{
 const o=new PublicFiringCorridorObserverC35I({matchId:'m3',policy:'observe'});
 o.beforeStep({now:2,client:fixture(),incumbent:cmd,applied:{...cmd,fire:false},serverShots:0,serverHits:0});
 o.afterStep({serverShots:0,serverHits:0});assert.throws(()=>o.finish(),/original fire/);
});
test('sampling bound is audited and not mistaken for all eligible events',()=>{
 const o=new PublicFiringCorridorObserverC35I({matchId:'m4',policy:'observe',samplePeriod:1,maxSamples:1});
 for(let i=0;i<2;i++){o.beforeStep({now:2+i/60,client:fixture(2+i/60),incumbent:cmd,applied:cmd,serverShots:i,serverHits:0});o.afterStep({serverShots:i+1,serverHits:0});}
 const v=o.finish();assert.equal(v.counts.sampledFire,2);assert.equal(v.counts.storedDropped,1);assert.equal(v.rows.length,1);
});
