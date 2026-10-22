import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicConfidenceC35P,PublicConfidenceObserverC35P,validateC35PModel} from '../lab/arena/public-target-confidence-c35p.mjs';
const model=JSON.parse(readFileSync(new URL('../reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json',import.meta.url)));
function client(now=2,age=.2){const t=now-age;return {you:{tm:0},pos:{x:0,y:0,z:0},rig:{yaw:Math.PI/2,pitch:0},local:{team:'red',mv:{stance:0,lean:0}},remotes:{list:[
 {id:'friend',team:0,alive:true,pos:{x:0,y:0,z:2},buf:[{t:t-.1,x:0,z:2},{t,x:0,z:2}]},
 {id:'enemy',team:1,alive:true,pos:{x:0,y:0,z:12},buf:[{t:t-.1,x:0,z:12},{t,x:0,z:12}]}]}}}
const cmd=Object.freeze({fire:true,aim:true,w:false});
test('frozen public model validates strict features and coefficients',()=>{assert.equal(validateC35PModel(model),true)});
test('C35P uses only public target identity; fire and aim remain untouched',()=>{
 const c=client(),a=publicConfidenceC35P(c,2,model);
 assert.equal(a.aimId,'enemy');assert.ok(a.pHit>=0&&a.pHit<=1&&a.pIdCorrectGivenHit>=0&&a.pIdCorrectGivenHit<=1);
 assert.deepEqual(cmd,{fire:true,aim:true,w:false});
});
test('stale >350ms abstains instead of overconfident hallucination',()=>{
 const r=publicConfidenceC35P(client(2,.41),2,model);assert.equal(r.eligible,false);assert.equal(r.pHit,null)
});
test('unknown / contradictory team IDs fail closed',()=>{
 const c=client();c.you.tm=1;assert.equal(publicConfidenceC35P(c,2,model).eligible,false)
});
test('illegal server truth attached to client cannot enter the public score',()=>{
 const c=client();const before=publicConfidenceC35P(c,2,model);
 c.serverTruth={pellets:[{targetId:'enemy',hitKind:'player'}],nextHit:true};c.remotes.list[1].secretServerHP=5;
 assert.deepEqual(publicConfidenceC35P(c,2,model),before)
});
test('reject malicious or wrongly shaped frozen models',()=>{
 assert.throws(()=>validateC35PModel({...model,features:['serverHit']}),/unapproved/);
 assert.throws(()=>validateC35PModel({...model,heads:{...model.heads,hit:{...model.heads.hit,coef:[1]}}}),/malformed/);
});
test('passive observer joins only shot count after engine step',()=>{
 const o=new PublicConfidenceObserverC35P({matchId:'unit',model});o.beforeStep({now:2,client:client(),incumbent:cmd,applied:cmd,serverShots:0});
 assert.equal('serverLabelsAfterStep' in o.pending.row,false);
 o.afterStep({serverShots:1});const x=o.finish();assert.equal(x.counts.confirmedShots,1);
 assert.equal(x.rows[0].serverLabelsAfterStep.shots,1);
 assert.doesNotMatch(JSON.stringify(x.rows[0].publicBeforeStep),/pellet|hitKind|serverTruth/)
});
test('observer aborts on changed fire command',()=>{
 const o=new PublicConfidenceObserverC35P({matchId:'changed',model});o.beforeStep({now:2,client:client(),incumbent:cmd,applied:{fire:false},serverShots:0});o.afterStep({serverShots:0});assert.throws(()=>o.finish(),/audit/)
});
test('observer aborts on synthetic truncation',()=>{
 const o=new PublicConfidenceObserverC35P({matchId:'overflow',model,maxRows:1});
 for(let i=0;i<2;i++){o.beforeStep({now:2+i*.1,client:client(2+i*.1),incumbent:cmd,applied:cmd,serverShots:i});o.afterStep({serverShots:i+1});}
 assert.throws(()=>o.finish(),/audit/)
});
