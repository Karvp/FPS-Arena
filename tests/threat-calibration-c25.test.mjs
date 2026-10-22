import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ThreatCalibrationObserverC25} from '../lab/arena/threat-calibration-observer-c25.mjs';
import {validateC25,evaluateC25,C25_ENDPOINT} from '../lab/arena/evaluate-threat-calibration-c25.mjs';
const cue=(n=0)=>({receivedShotCount:n,receivedNearTracerCount:0,nearestReceivedTracerMeters:null,
 lookbackSeconds:1.5,cueDefinition:'delivered public shot packets only; may include friendlies; no future server labels'});
const stat={alive:true,healthFraction:1,armorFraction:.5};
const clone=x=>structuredClone(x);
function fixture(){
 const strata=[['arena','mp5sd'],['arena','hk_sl8'],['foundry','m4a1'],['foundry','aa12'],['neon','m4a1'],['neon','mp5sd']];
 const matches=[],jobs=[];
 for(const [si,[map,weapon]] of strata.entries())for(let i=0;i<4;i++){
  const seed=25025000+si*100+i,split=i<2?'train':i===2?'validation':'test';
  const observer=new ThreatCalibrationObserverC25();
  for(let k=0;k<4;k++){
   const t=3+k*1.8;observer.beforeClientStep(t,cue(k+si+i),stat);
   observer.serverShot(t+.1,k===0);
   if((si+i+k)%7===0)observer.serverWeaponHit(t+.2,11);
  }
  matches.push({schema:'fpsarena-c25-fixed-grid-match-v1',metadata:{seed,mode:'tdm',map,loadout:weapon,seconds:12,profile:'release',producer:'headless-simulator',productionActuation:false,observerOnly:true,snapshotLagMs:65},...Object.fromEntries(Object.entries(observer.finish(12)).filter(([key])=>key!=='schema'))});
  jobs.push({id:`${map}-${weapon}-${i}`,seed,split,map,weapon});
 }
 const plan={schema:'fpsarena-c25-threat-calibration-plan-v1',version:1,endpoint:C25_ENDPOINT,
  sourceSHA256:'a'.repeat(64),seconds:12,profile:'release',bots:5,opponents:'stress',snapshotLagMs:65,jobs};
 plan.registrationSHA256=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
 return {data:{schema:'fpsarena-c25-fixed-grid-dataset-v1',engine:'uploaded-main',matches},plan};
}
test('C25 fixed time windows are nonoverlapping, deterministic, and independent of cues',()=>{
 const o=new ThreatCalibrationObserverC25();o.beforeClientStep(2.9,cue(999),stat);
 assert.equal(o.windows.length,0);o.beforeClientStep(3,cue(0),stat);o.serverShot(3.1,true);o.serverWeaponHit(4.0,19);
 o.beforeClientStep(4.8,cue(9),stat);
 assert.deepEqual(o.windows.map(w=>[w.start,w.end]),[[3,4.8],[4.8,6.6]]);
 assert.equal(o.windows[0].label.hostileWeaponHitEvents,1);assert.equal(o.windows[0].complete,true);
 assert.equal(o.windows[1].publicCueBeforeWindow.receivedShotCount,9);
});
test('C25 prevents post-action server labels from altering the frozen pre-window cue',()=>{
 const o=new ThreatCalibrationObserverC25();o.beforeClientStep(3,cue(1),stat);const before=clone(o.windows[0].publicCueBeforeWindow);
 o.serverShot(3.2,true);o.serverWeaponHit(3.5,9);assert.deepEqual(o.windows[0].publicCueBeforeWindow,before);
});
test('C25 rejects events before/after window and censored final window correctly',()=>{
 const o=new ThreatCalibrationObserverC25();o.serverShot(2,true);o.beforeClientStep(3,cue(),stat);o.serverShot(3.4,true);
 o.serverShot(4.8,false);const d=o.finish(4.7);
 assert.equal(d.windows[0].complete,false);assert.equal(d.windows[0].label.hostileShotEvents,1);
 assert.equal(d.events.hostileShotEvents,3);
});
test('C25 does not open samples when client is dead, but preserves anchored schedule',()=>{
 const o=new ThreatCalibrationObserverC25();o.beforeClientStep(3,cue(),{...stat,alive:false});o.beforeClientStep(4.8,cue(),stat);
 assert.equal(o.windows.length,1);assert.equal(o.windows[0].start,4.8);
});
test('C25 full match + frozen split preregistration validation succeeds',()=>{
 const {data,plan}=fixture(),v=validateC25(data,plan);assert.equal(v.matches,24);assert.equal(v.complete,96);
 const e=evaluateC25(data,plan);assert.equal(e.data.train.windows,48);assert.equal(e.data.validation.windows,24);assert.equal(e.data.test.windows,24);
 assert.equal(e.deployment.startsWith('DISABLED'),true);
});
test('C25 validation detects future-label injection into client cue',()=>{
 const {data,plan}=fixture();data.matches[0].windows[0].publicCueBeforeWindow.futureServerDamage=99;
 assert.throws(()=>validateC25(data,plan),/fields\/label leakage/);
});
test('C25 validation detects window overlap, wrong timing, forged damage',()=>{
 const {data,plan}=fixture();const a=clone(data);a.matches[0].windows[1].start+=.4;
 assert.throws(()=>validateC25(a,plan),/fixed time grid altered|fixed nonoverlap/);
 const b=clone(data);b.matches[0].windows[0].label.hostileWeaponHitEvents=0;
 if(b.matches[0].windows[0].label.hostileWeaponDamage>0)assert.throws(()=>validateC25(b,plan),/event count\/damage inconsistency/);
 const c=clone(data);c.matches[0].windows[0].label.hostileWeaponDamage=99;
 assert.throws(()=>validateC25(c,plan),/event count\/damage inconsistency|label\/events count mismatch/);
});
test('C25 plan refuses reused and duplicate seeds or mutated registration',()=>{
 const {data,plan}=fixture();const q=clone(plan);q.jobs[0].seed=q.jobs[1].seed;
 assert.throws(()=>validateC25(data,q),/preregistered hash tampered/);
 assert.throws(()=>validateC25(data,plan,{excludedSeeds:[plan.jobs[0].seed]}),/reused seed/);
 const w=clone(plan);w.endpoint.windowSeconds=.9;
 assert.throws(()=>validateC25(data,w),/preregistered endpoint changed/);
});
test('C25 leakage firewall: modifying test labels cannot alter validation-selected model',()=>{
 const {data,plan}=fixture();const a=evaluateC25(data,plan);
 const t=clone(data),testSeeds=new Set(plan.jobs.filter(j=>j.split==='test').map(j=>j.seed));
 for(const m of t.matches)if(testSeeds.has(m.metadata.seed))for(const w of m.windows){
  if(w.label.hostileWeaponHitEvents){w.label.hostileWeaponHitEvents=0;w.label.hostileWeaponDamage=0;}
 }
 const b=evaluateC25(t,plan);assert.deepEqual(a.selected,b.selected);assert.deepEqual(a.validationSelection,b.validationSelection);
});
test('C25 evaluation is bitwise reproducible from the saved dataset',()=>{
 const {data,plan}=fixture();const a=evaluateC25(data,plan),b=evaluateC25(clone(data),clone(plan));
 assert.deepEqual(a,b);assert.ok(a.holdout.baseline.brier>=0);assert.equal(a.trainingGate.passes,false);
});
