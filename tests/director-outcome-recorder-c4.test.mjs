import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectorOutcomeRecorder} from '../lab/arena/director-outcome-recorder.mjs';
import {extractDirectorTrajectories,summarizeDirectorTrajectories} from '../lab/arena/export-director-trajectories.mjs';
const planned=(t,id)=>({state:'director-planned',t,planId:id,active:true,type:'FLANK',targetId:'p:enemy',utility:1.2,risk:.5,timeToFire:2,terminalTimeToFire:5,routeLength:25,uncertainty:1,earlyShotWindow:true});
const selected=(t,id)=>({state:'director-command-selected',t,planId:id});
const completed=(t,id)=>({state:'director-outcome',t,planId:id,reason:'emergency'});
test('only actually selected plans open observation windows; pre-selection shots never count',()=>{
 const r=new DirectorOutcomeRecorder();r.directorEvent(planned(1,1));r.serverEvent(1.1,'shot',{id:'trainee'});
 assert.equal(r.finish(8).length,0);
 r.directorEvent(selected(2,1));r.serverEvent(2.1,'shot',{id:'bot'});
 r.serverEvent(2.2,'shot',{id:'trainee'});r.serverEvent(2.3,'hit',{dmg:18});
 r.serverEvent(2.4,'kill',{k:'trainee',v:'bot'});r.serverEvent(2.5,'dmg',{h:9,a:2});
 r.control(2.6,{fire:true});r.displacement(2.7,4.5);
 r.directorEvent(completed(3,1));
 r.serverEvent(4,'shot',{id:'trainee'});r.serverEvent(4.2,'hit',{dmg:6});
 r.serverEvent(4.3,'kill',{k:'bot',v:'trainee'});r.displacement(4.4,3);
 r.serverEvent(7.1,'shot',{id:'trainee'}); // strictly outside [2, 7)
 const w=r.finish(9)[0];
 assert.equal(w.horizonComplete,true);assert.equal(w.observedTotal.shots,2);
 assert.equal(w.duringOwnership.shots,1);assert.equal(w.afterOwnership.shots,1);
 assert.equal(w.observedTotal.hits,2);assert.equal(w.observedTotal.damageDealt,24);
 assert.equal(w.observedTotal.damageTaken,11);assert.equal(w.observedTotal.kills,1);
 assert.equal(w.observedTotal.deaths,1);assert.equal(w.observedTotal.metersMoved,7.5);
 assert.equal(w.observedTotal.fireInputTicks,1);
});
test('terminal censorship does not treat partial five-second horizon as complete',()=>{
 const r=new DirectorOutcomeRecorder();r.directorEvent(planned(3,1));r.directorEvent(selected(3,1));
 const w=r.finish(4)[0];assert.equal(w.horizonComplete,false);
 assert.equal(w.ownershipCensored,true);assert.equal(w.observedSeconds,1);
});
test('overlapping windows are flagged and never presented as independent outcome labels',()=>{
 const r=new DirectorOutcomeRecorder();r.directorEvent(planned(1,1));r.directorEvent(selected(1,1));
 r.directorEvent(completed(2,1));r.directorEvent(planned(3,2));r.directorEvent(selected(3,2));
 r.serverEvent(4,'shot',{id:'trainee'});
 const [a,b]=r.finish(10);assert.equal(a.overlappingHorizon,true);assert.equal(b.overlappingHorizon,true);
 assert.equal(a.observedTotal.shots,1);assert.equal(b.observedTotal.shots,1);
});
test('bounded collection, duplicate unrelated events and invalid telemetry cannot create plans',()=>{
 const r=new DirectorOutcomeRecorder({maxPlans:1});
 r.directorEvent(planned(1,1));r.directorEvent(planned(2,2));
 r.directorEvent(selected(2,2));r.directorEvent({state:'director-command-selected',planId:1,t:NaN});
 r.directorEvent(selected(1.5,1));r.serverEvent(NaN,'shot',{id:'trainee'});
 r.serverEvent(2,'dmg',{h:-100,a:-20});
 assert.equal(r.dropped,1);assert.equal(r.finish(7).length,1);
 assert.equal(r.finish(7)[0].observedTotal.damageTaken,0);
});
test('C4 exporter uses actual post-selection ledger, never silently falls back to legacy',()=>{
 const r=new DirectorOutcomeRecorder();r.directorEvent(planned(1,1));r.directorEvent(selected(1,1));
 r.directorEvent(completed(2,1));r.serverEvent(3,'shot',{id:'trainee'});
 const match={mode:'tdm',map:'arena',seed:1,profile:'research',primaryLoadout:'mp5sd',duration:10,errors:0,
   directorOutcomeWindows:r.finish(10),directorPlanWindows:[{planId:1,commandSelected:true,start:1,end:2}]};
 const rows=extractDirectorTrajectories({results:[match]});assert.equal(rows.length,1);
 assert.equal(rows[0].schema,'fpsarena-executed-engagement-observation-v2');
 assert.equal(rows[0].observation.afterOwnership.shots,1);
 assert.equal(rows[0].trainingEligibility.counterfactualAvailable,false);
 assert.equal(summarizeDirectorTrajectories(rows).completeNonoverlappingHorizon,1);
});
test('truncated C4 observation remains in dataset but is excluded from complete subset',()=>{
 const r=new DirectorOutcomeRecorder();r.directorEvent(planned(4,1));r.directorEvent(selected(4,1));
 const rows=extractDirectorTrajectories([{mode:'tdm',map:'arena',seed:1,duration:5,errors:0,
   directorOutcomeWindows:r.finish(5)}]);
 assert.equal(rows.length,1);assert.equal(rows[0].observation.horizonComplete,false);
 assert.equal(rows[0].trainingEligibility.fullyObserved,false);
});
