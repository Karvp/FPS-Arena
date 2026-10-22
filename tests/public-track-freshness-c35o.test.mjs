import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotForShotC35O,PublicTrackFreshnessObserverC35O,C35O_THRESHOLDS} from '../lab/arena/public-track-freshness-c35o.mjs';
function make(age=.215){
 const t=2-age;
 return {you:{tm:0},pos:{x:0,y:0,z:0},rig:{yaw:Math.PI/2,pitch:0},local:{team:'red',mv:{stance:0,lean:0}},
  remotes:{list:[{id:'friend',team:0,alive:true,invisible:false,pos:{x:2,y:0,z:3},buf:[{t:t-.1,x:2,z:3},{t,x:2,z:3}]},
   {id:'enemy',team:1,alive:true,invisible:false,pos:{x:0,y:0,z:10},stance:0,buf:[{t:t-.1,x:0,z:10},{t,x:0,z:10}]}]}};
}
const cmd={fire:true,aim:true};
test('four fixed public freshness thresholds and monotone coverage',()=>{
 const x=snapshotForShotC35O(make(),2);
 assert.deepEqual(C35O_THRESHOLDS,[.15,.2,.275,.35]);
 assert.equal(x.thresholdsMs['150'].eligible,false);
 assert.equal(x.thresholdsMs['200'].eligible,false);
 assert.equal(x.thresholdsMs['275'].eligible,true);
 assert.equal(x.thresholdsMs['350'].eligible,true);
 assert.equal(x.thresholdsMs['275'].aimId,'enemy');
 assert.equal(x.thresholdsMs['275'].confidence,'stale');
});
test('public team filtering excludes allies even when closer',()=>{
 const x=snapshotForShotC35O(make(.1),2);for(const t of Object.values(x.thresholdsMs))assert.equal(t.nearestId,'enemy');
});
test('conflicting own team abstains from all thresholds',()=>{
 const c=make(.1);c.you.tm=1;
 const x=snapshotForShotC35O(c,2);for(const t of Object.values(x.thresholdsMs))assert.equal(t.reason,'conflicting-public-team');
});
test('no backdating or future-snapshot use',()=>{
 const c=make(.1);c.remotes.list[1].buf[1].t=2.1;
 const x=snapshotForShotC35O(c,2);for(const t of Object.values(x.thresholdsMs))assert.equal(t.eligible,false);
});
test('bounded velocity projection requires two plausible public frames',()=>{
 const c=make(.11);c.remotes.list[1].buf[0].x=-.25;
 const x=snapshotForShotC35O(c,2).thresholdsMs['200'];
 assert.equal(x.eligible,true);assert.equal(x.projectedAimId,'enemy');
 assert.ok(x.projectedDisplacement>0&&x.projectedDisplacement<1);
 c.remotes.list[1].buf[0].x=-50;
 assert.equal(snapshotForShotC35O(c,2).thresholdsMs['200'].projectedAimId,null);
});
test('freshness never overrides the current actual aim and fire',()=>{
 const o=new PublicTrackFreshnessObserverC35O({matchId:'a'});
 o.beforeStep({now:2,client:make(.11),incumbent:cmd,applied:cmd,serverShots:0});
 assert.equal(o.rows.length,0);
 assert.equal('serverLabelsAfterStep' in o.pending.row,false);
 o.afterStep({serverShots:1});
 assert.equal(o.finish().rows[0].serverLabelsAfterStep.shots,1);
 assert.equal(cmd.fire,true);
});
test('observer rejects bad ordering and artificial fire changes',()=>{
 const o=new PublicTrackFreshnessObserverC35O({matchId:'b'});
 o.beforeStep({now:2,client:make(.1),incumbent:cmd,applied:{fire:false},serverShots:0});
 assert.throws(()=>o.beforeStep({now:3,client:make(.1),incumbent:cmd,applied:cmd,serverShots:0}),/beforeStep/);
 assert.throws(()=>o.afterStep({serverShots:-1}),/afterStep/);
 o.afterStep({serverShots:0});assert.throws(()=>o.finish(),/audit gate/);
});
test('observer does not silently discard rows when exceeding budget',()=>{
 const o=new PublicTrackFreshnessObserverC35O({matchId:'budget',maxRows:1});
 for(let i=0;i<2;i++){
  o.beforeStep({now:2+i*.1,client:make(.11),incumbent:cmd,applied:cmd,serverShots:i});
  o.afterStep({serverShots:i+1});
 }
 assert.throws(()=>o.finish(),/audit gate/);
});
test('public snapshot omits authoritative labels entirely',()=>{
 const c=make(.1);c.serverTruth={hit:true};
 const x=JSON.stringify(snapshotForShotC35O(c,2));
 assert.doesNotMatch(x,/serverTruth|hitKind|pellets|rewindSeconds|targetHit/);
});
