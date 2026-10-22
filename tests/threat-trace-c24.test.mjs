import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ThreatTraceObserverC24,tracerProximityC24,tracerSegmentDistanceC24} from '../lab/arena/threat-trace-observer-c24.mjs';
import {RiskAwareRandomizerC22} from '../lab/arena/risk-aware-encounters-c22.mjs';
import {validateC24,evaluateC24,C24_FIXED_ENDPOINT} from '../lab/arena/evaluate-threat-cues-c24.mjs';
const target={x:0,y:0,z:0};
const shot=(x=0)=>({id:'enemy',o:[x,1.1,-12],e:[[x,1.1,12]],w:'mp5sd'});
const client=()=>({pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
function fixture(seed=24024000){
 const c=client(),r=new RiskAwareRandomizerC22({seed,mode:'tdm',map:'arena',loadout:'mp5sd'}),obs=new ThreatTraceObserverC24();
 let now=1.065;const cmd=r.command(now,c,{});
 assert.ok(r.offers.length);obs.attachOffer(r.offers[0],now);
 obs.serverShot(now+.1,shot(.2),target,true,r);obs.serverWeaponHit(now+.2,12,r);
 r.serverEvent(now+.2,'dmg',{h:12,a:0});
 const m=r.finish(3);m.schema='fpsarena-c24-threat-match-v1';m.metadata.threatLabelsAfterAssignmentOnly=true;
 m.diagnostics.threatTrace=obs.finish();
 return {r,obs,cmd,data:{schema:'fpsarena-c24-threat-dataset-v1',engine:'uploaded-main',matches:[m]}};
}
function plan(data){const m=data.matches[0].metadata;
 const unsigned={schema:'fpsarena-c24-threat-study-plan-v1',version:1,endpoint:C24_FIXED_ENDPOINT,sourceSHA256:'a'.repeat(64),
  profile:'release',seconds:75,bots:5,snapshotLagMs:65,opponents:'stress',jobs:[{id:'pilot-00',map:m.map,weapon:m.loadout,seed:m.seed}]};
 return {...unsigned,registrationSHA256:createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')};}
const clone=x=>structuredClone(x);
test('C24 finite clipped segment distance and malformed geometry fail closed',()=>{
 assert.equal(tracerSegmentDistanceC24([0,0,0],[10,0,0],[5,0,2]),2);
 assert.equal(tracerSegmentDistanceC24([0,0,0],[10,0,0],[12,0,0]),2);
 assert.equal(tracerSegmentDistanceC24([0,0,0],[0,0,0],[0,0,0]),null);
 assert.equal(tracerSegmentDistanceC24([NaN,0,0],[1,0,0],[0,0,0]),null);
 assert.equal(tracerProximityC24(shot(.7),target),.7);
});
test('C24 shot delivery cue has strict non-future timestamp cutoff',()=>{
 const a=new ThreatTraceObserverC24();a.observeDeliveredShot(2,shot(0),target);
 assert.equal(a.publicCueAt(1.99).receivedShotCount,0);
 assert.equal(a.publicCueAt(2).receivedShotCount,1);
 assert.equal(a.publicCueAt(3.501).receivedShotCount,0);
});
test('C24 server outcomes cannot alter already-serialized pre-action cue',()=>{
 const {obs,r}=fixture();const before=clone(r.offers[0].publicCueBeforeAction);
 obs.serverShot(1.4,shot(0),target,true,r);obs.serverWeaponHit(1.45,10,r);
 assert.deepEqual(r.offers[0].publicCueBeforeAction,before);
 assert.equal(before.receivedShotCount,0);
});
test('C24 received shot cue counts only public shots that reached nearby client',()=>{
 const a=new ThreatTraceObserverC24();a.observeDeliveredShot(1,shot(),target);
 a.observeDeliveredShot(1.2,{...shot(),id:'trainee'},target);
 a.observeDeliveredShot(1.3,shot(300),target);
 const c=a.publicCueAt(1.35);assert.equal(c.receivedShotCount,1);assert.equal(c.receivedNearTracerCount,1);
 assert.equal(a.finish().publicNearbyShotsDelivered,1);
});
test('C24 nonhostile shots and zero damage excluded from authoritative defensive labels',()=>{
 const {obs,r}=fixture();const n=r.offers[0].threatOutcome.hostileShotEvents;
 obs.serverShot(1.5,shot(),target,false,r);obs.serverWeaponHit(1.5,0,r);
 assert.equal(r.offers[0].threatOutcome.hostileShotEvents,n);
 assert.equal(r.offers[0].threatOutcome.hostileWeaponDamage,12);
});
test('C24 events outside the nonoverlapping offer window never enter its label',()=>{
 const {r,obs}=fixture();const label=clone(r.offers[0].threatOutcome);
 obs.serverShot(10,shot(),target,true,r);obs.serverWeaponHit(10,14,r);
 assert.deepEqual(r.offers[0].threatOutcome,label);
 assert.ok(obs.finish().hostileServerShots>=2);
});
test('C24 dataset validates C22 randomization and provenance unchanged',()=>{
 const {data}=fixture();const v=validateC24(data,plan(data));assert.equal(v.matches,1);
 const e=evaluateC24(data,plan(data));assert.equal(e.complete,1);
 assert.equal(e.assignedWindowLabels.serverWeaponHitWindows,1);assert.equal(e.trainingGate.passes,false);
});
test('C24 rejects forged hit values and bogus before-action cues',()=>{
 const {data}=fixture();const forged=clone(data);forged.matches[0].offers[0].threatOutcome.hostileNearTracerEvents=2;
 assert.throws(()=>validateC24(forged),/near > hostile shots/);
 const leaked=clone(data);leaked.matches[0].offers[0].publicCueBeforeAction.lookbackSeconds=12;
 assert.throws(()=>validateC24(leaked),/cue\/label provenance/);
});
test('C24 refuses changed preregistration or repeated seed',()=>{
 const {data}=fixture(),p=clone(plan(data));p.endpoint.horizonSeconds=.9;
 assert.throws(()=>validateC24(data,p),/endpoint changed/);
 const p2=plan(data);assert.throws(()=>validateC24(data,p2,{excludedSeeds:[24024000]}),/duplicate\/reused seed/);
});
test('C24 no signal is not assumed to be evasive success, and training gate blocks sparse data',()=>{
 const {data}=fixture();const m=data.matches[0];const o=m.offers[0];
 o.threatOutcome.hostileWeaponHitEvents=0;o.threatOutcome.hostileWeaponDamage=0;
 const e=evaluateC24(data);assert.equal(e.trainingGate.passes,false);
 assert.equal(e.assignedWindowLabels.serverWeaponHitWindows,0);
 assert.match(e.decision,/BLOCKED/);
});
