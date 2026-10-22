import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combatCandidateC35R,CombatDecisionShadowC35R} from '../lab/arena/combat-decision-shadow-c35r.mjs';
const model=JSON.parse(readFileSync(new URL('../reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json',import.meta.url)));
function make({age=.05,friend=false}={}){
 const t=2-age;
 const r=(id,team,z)=>({id,team,alive:true,invisible:false,pos:{x:0,y:0,z},stance:0,buf:[{t:t-.09,x:0,z},{t,x:0,z}]});
 return {you:{tm:0},pos:{x:0,y:0,z:0},rig:{yaw:Math.PI,pitch:0},map:{boxes:[]},
  local:{team:'red',alive:true,mv:{lean:0,stance:0,onGround:true}},remotes:{list:[r('enemy',friend?0:1,20)]}};
}
const fire=Object.freeze({fire:true,aim:true,forward:false});
test('public-only candidate is stable when server-private labels mutate',()=>{
 const c=make(),before=combatCandidateC35R(c,2,fire,model,{weapon:'m4a1'});
 c.serverSecret={nextHit:true,rewindPlayers:['enemy'],trueHp:20};c.remotes.list[0].serverOnlyHit=true;
 assert.deepEqual(combatCandidateC35R(c,2,fire,model,{weapon:'m4a1'}),before);
 assert.equal(before.targetId,'enemy');
 assert.equal(before.provenance,'PUBLIC_BEFORE_STEP_ONLY');
 assert.equal(before.category,'rifle');
});
test('unknown teams and stale snapshots lead to abstention',()=>{
 assert.equal(combatCandidateC35R(make({friend:true}),2,fire,model).candidateEligible,false);
 assert.equal(combatCandidateC35R(make({age:.45}),2,fire,model).candidateEligible,false);
});
test('reject unknown weapon, clock, malformed model',()=>{
 assert.throws(()=>combatCandidateC35R(make(),2,fire,model,{weapon:'railgun'}));
 assert.throws(()=>combatCandidateC35R(make(),-1,fire,model));
 assert.throws(()=>combatCandidateC35R(make(),2,fire,{...model,features:['serverTruth']}));
});
test('observer joins shot truth only AFTER step and preserves fire',()=>{
 const o=new CombatDecisionShadowC35R({matchId:'test',model,weapon:'m4a1',sampleEvery:2});
 const c=make();o.beforeStep({now:2,client:c,incumbent:fire,applied:fire,serverShots:0});
 assert.equal(o.rows.length,0);assert.equal('serverLabelsAfterStep' in o.pending.row,true);
 assert.equal(o.pending.row.serverLabelsAfterStep,null);
 assert.throws(()=>o.beforeStep({now:2.01,client:c,incumbent:fire,applied:fire,serverShots:0}),/order/);
 o.afterStep({serverShots:1});
 o.beforeStep({now:2.0167,client:c,incumbent:{fire:false},applied:{fire:false},serverShots:1});
 o.afterStep({serverShots:1});
 const end=o.finish();assert.equal(end.counts.confirmedShots,1);assert.equal(end.counts.fireIntents,1);
 assert.equal(end.rows.length,2);assert.equal(end.counts.noFireSamples,1);
 assert.equal(end.rows[0].serverLabelsAfterStep.confirmedShots,1);
});
test('no shot may appear when incumbent did not request fire',()=>{
 const o=new CombatDecisionShadowC35R({matchId:'bad',model});o.beforeStep({now:1,client:make(),incumbent:{fire:false},applied:{fire:false},serverShots:0});
 assert.throws(()=>o.afterStep({serverShots:1}),/without public fire intent/);
});
test('tampered upstream fire command is reported as failed audit',()=>{
 const o=new CombatDecisionShadowC35R({matchId:'badfire',model});o.beforeStep({now:2,client:make(),incumbent:fire,applied:{fire:false},serverShots:0});
 o.afterStep({serverShots:0});assert.throws(()=>o.finish(),/audit invariant/);
});
test('row budget does not distort totals, but labels remain explicitly censored',()=>{
 const o=new CombatDecisionShadowC35R({matchId:'budget',model,maxRows:1});
 for(let i=0;i<2;i++){o.beforeStep({now:2+i*.1,client:make(),incumbent:fire,applied:fire,serverShots:i});o.afterStep({serverShots:i+1});}
 const z=o.finish();assert.equal(z.counts.storedDropped,1);assert.equal(z.counts.confirmedShots,2);
});
