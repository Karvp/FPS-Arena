import test from 'node:test';import assert from 'node:assert/strict';
import {EncounterPolicyRecorderC13,publicPolicyState,commandAction,C13_ACTIONS,C13_FEATURES} from '../lab/arena/encounter-policy-recorder-c13.mjs';
import {c13DecisionVector,flattenC13,splitC13,trainEncounterPolicyC13,policyProbsC13} from '../lab/arena/encounter-policy-learner-c13.mjs';
const client=()=>({pos:{x:0,z:0},local:{team:'red',alive:true,hp:80,armor:50,maxArmor:100,
 weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},mv:{onGround:true}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const record=(g,n=0)=>{
 const [mode,map,seed]=g.split('|');const actions=['hold','advance','retreat','strafe-left','strafe-right'];
 return {schema:'fpsarena-c13-observed-decision-v1',matchId:`${g}-match`,decisionId:`${g}/d${n}`,
  mode,map,seed:+seed,profile:'release',weaponId:'mp5sd',chosenAction:actions[(n+Number(seed))%5],
  eligibility:{complete:true,source:'delayed-public-snapshot-plus-local-player',independentCounterfactual:false},
  features:{distance:40+n%20,lateralSpeed:2,radialSpeed:-1,snapshotAge:.065,observedHostiles:3,onGround:1,
    healthFraction:.8,armorFraction:.5,ammoFraction:.7},outcome:{damageDealt:900,shots:30,kills:90}};
};
test('C13 features are pre-step client-only and action not inside model inputs',()=>{
 const f=publicPolicyState(client(),1.065);assert.equal(f.eligible,true);assert.equal(f.features.ammoFraction,.66667);
 assert.equal(C13_FEATURES.length,9);assert.equal(Object.keys(f.features).includes('serverDamage'),false);
});
test('C13 action mapping respects opposites and five classes',()=>{
 assert.deepEqual(['hold','advance','retreat','strafe-left','strafe-right'],[
 commandAction({}),commandAction({forward:true,right:true}),commandAction({backward:true}),
 commandAction({left:true}),commandAction({right:true})]);
 assert.equal(commandAction({forward:true,backward:true,left:true}),'strafe-left');
});
test('C13 observes non-overlapping decisions and server-confirmed noncausal windows',()=>{
 const r=new EncounterPolicyRecorderC13({matchId:'x',mode:'tdm',map:'arena',seed:1,profile:'release'});
 r.observe(1.065,client(),{forward:true});r.serverEvent(1.09,'shot',{id:'trainee'});
 r.serverEvent(1.1,'hit',{dmg:25});r.observe(1.2,client(),{left:true});
 r.observe(1.565,client(),{left:true});r.serverEvent(1.59,'dmg',{h:5,a:2});
 const out=r.finish(1.7);assert.equal(out.counts.decisions,2);
 assert.equal(out.decisions[0].chosenAction,'advance');assert.equal(out.decisions[0].outcome.shots,1);
 assert.equal(out.decisions[0].outcome.damageDealt,25);assert.equal(out.decisions[0].outcome.censored,false);
 assert.equal(out.decisions[1].outcome.censored,true);assert.equal(out.decisions[1].outcome.damageTaken,7);
});
test('C13 stale/missing history excluded, never imputed as zero velocity',()=>{
 const c=client();c.remotes.list[0].buf=[];assert.equal(publicPolicyState(c,1.065).eligible,false);
});
test('C13 observed outcome fields cannot leak into learning vector',()=>{
 const a=c13DecisionVector(record('tdm|arena|100',2));const b=c13DecisionVector({...record('tdm|arena|100',2),outcome:{damageDealt:0,shots:0,kills:0}});
 assert.deepEqual(a.x,b.x);assert.equal(a.x.length,9);
});
test('C13 paired arms and multiple decisions remain in one group split',()=>{
 const rows=[];for(let i=0;i<24;i++)for(let j=0;j<8;j++)rows.push(c13DecisionVector(record(`tdm|arena|${i+1}`,j)));
 const p=splitC13(rows);for(const [g,arm] of Object.entries(p.assignments)){
  assert.equal(p[arm].filter(r=>r.group===g).length,8);
 }
});
test('C13 rejects duplicates and invalid provenance',()=>{
 const row=record('tdm|arena|1');assert.equal(c13DecisionVector({...row,eligibility:{complete:true,source:'private-server',independentCounterfactual:false}}),null);
 const z=flattenC13({matches:[{decisions:[row,row]}]});assert.equal(z.duplicates,1);assert.equal(z.decisions.length,1);
});
test('C13 small datasets refuse training',()=>{
 const v=trainEncounterPolicyC13({matches:[{decisions:[record('tdm|arena|1')]}]});
 assert.equal(v.status,'insufficient-independent-decisions');assert.equal(v.model,null);assert.equal(v.productionEligible,false);
});
test('C13 train/test separated and model remains shadow-only',()=>{
 const matches=[];for(let i=0;i<25;i++)matches.push({decisions:Array.from({length:30},(_,j)=>record(`tdm|arena|${100+i}`,j))});
 const x=trainEncounterPolicyC13({matches},{epochs:12});assert.equal(x.status,'research-imitation-model-evaluated');
 assert.equal(x.split.train+x.split.valid+x.split.test,25);
 assert.equal(x.productionEligible,false);assert.equal(x.policyActuationEnabled,false);
 const p=policyProbsC13(x.model,Array(C13_FEATURES.length).fill(.5));
 assert.equal(p.length,C13_ACTIONS.length);assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-10);
 assert.ok(x.holdout.accuracy>=0);assert.ok(x.majorityBaseline.accuracy>=0);
});
test('C13 temporal persistence baseline only uses an earlier action',async()=>{
 const {persistenceScoreC13}=await import('../lab/arena/encounter-policy-learner-c13.mjs');
 const data=[record('tdm|arena|1',0),record('tdm|arena|1',1),record('tdm|arena|1',2)];
 const rows=data.map((d,i)=>c13DecisionVector({...d,time:i*.5}));
 const s=persistenceScoreC13(rows,0);
 assert.equal(s.predictions.get(rows[0].decisionId),0);
 assert.equal(s.predictions.get(rows[1].decisionId),rows[0].y);
 assert.equal(s.predictions.get(rows[2].decisionId),rows[1].y);
});
test('C13 cannot infer commands from server post-step outcomes, even high-reward ones',()=>{
 const a=record('tdm|arena|22',5);
 const x=c13DecisionVector(a);
 const y=c13DecisionVector({...a,outcome:{kills:1000,shots:900,damageDealt:100000,serverEnemyVelocity:500}});
 assert.deepEqual(x.x,y.x);assert.equal(x.y,y.y);
});
