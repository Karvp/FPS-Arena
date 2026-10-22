import test from 'node:test';
import assert from 'node:assert/strict';
import {assignedActionC21,EncounterRandomizerC21,C21_ACTIONS} from '../lab/arena/encounter-randomization-c21.mjs';
import {validateC21,evaluateC21} from '../lab/arena/evaluate-encounters-c21.mjs';
const mkClient=()=>({pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},
  mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const fresh=(c,t)=>{c.remotes.list[0].buf=[{t:t-.15,x:39.8,z:0},{t:t-.04,x:40,z:0}];};
const mk=(seed=210001)=>new EncounterRandomizerC21({seed,mode:'tdm',map:'arena',loadout:'mp5sd'});
const study=(seed=210001)=>{const ex=mk(seed),c=mkClient();for(let i=0;i<400;i++){const t=1.065+i/60;fresh(c,t);ex.command(t,c,{});}
 const m=ex.finish(9);return {schema:'fpsarena-c21-encounter-randomized-dataset-v1',engine:'uploaded-main',matches:[m]};};
test('C21 hash is deterministic, supports three arms and never calls Math.random',()=>{
 const before=Math.random;Math.random=()=>{throw Error('game RNG accessed');};
 try {const xs=Array.from({length:150},(_,i)=>assignedActionC21(210001,i+1));
  assert.deepEqual(new Set(xs),new Set(C21_ACTIONS));assert.deepEqual(xs,Array.from({length:150},(_,i)=>assignedActionC21(210001,i+1)));
  assert.ok(C21_ACTIONS.every(a=>xs.filter(x=>x===a).length>30));}finally{Math.random=before;}
});
test('C21 never mutates incumbent command and blocks unsafe priorities',()=>{
 const c=mkClient(),ex=mk(),cmd={fire:true,forward:true,aim:true};assert.deepEqual(ex.command(1.065,c,cmd),cmd);
 assert.equal(ex.offers.length,0);assert.equal(ex.skippedGeometry,1);assert.deepEqual(cmd,{fire:true,forward:true,aim:true});
});
test('C21 only selects an eligible public safety candidate',()=>{
 const c=mkClient(),ex=mk();c.local.hp=30;ex.command(1.065,c,{});
 assert.equal(ex.offers.length,0);assert.ok(ex.skipped['low-health']);
 c.local.hp=100;fresh(c,1.21);c.map.boxes=[{x0:-1,x1:1,z0:-2,z1:2,y0:-.5,y1:2}];ex.command(1.21,c,{});
 assert.equal(ex.offers.length,0);assert.ok(ex.skipped['public-static-geometry']);
 c.map.boxes=[];fresh(c,1.37);ex.command(1.37,c,{});assert.equal(ex.offers.length,1);
});
test('C21 baseline is a real no-op and assigned lateral action executes',()=>{
 const c=mkClient();let bSeed=null,lSeed=null;
 for(let s=1;s<100;s++){const a=assignedActionC21(s,1);if(a==='baseline'&&!bSeed)bSeed=s;if(a==='micro-left'&&!lSeed)lSeed=s;}
 const base=mk(bSeed),left=mk(lSeed),cmd={forward:true,fire:false};
 assert.deepEqual(base.command(1.065,c,cmd),cmd);
 assert.equal(base.offers[0].executedTicks,0);
 assert.deepEqual(left.command(1.065,c,cmd),{...cmd,left:true});assert.equal(left.offers[0].executedTicks,1);
 assert.equal(base.offers[0].assignment.probability,1/3);
});
test('C21 interrupts treatment immediately if priority command appears',()=>{
 const c=mkClient();let seed=1;while(assignedActionC21(seed,1)==='baseline')seed++;
 const ex=mk(seed);ex.command(1.065,c,{});const now=ex.command(1.082,c,{fire:true});
 assert.deepEqual(now,{fire:true});assert.equal(ex.interruptions,1);assert.equal(ex.offers[0].interrupted,true);
});
test('C21 attributes events to pre-defined non-overlapping window, censored tail excluded',()=>{
 const ex=mk(),c=mkClient();ex.command(1.065,c,{});
 ex.serverEvent(1.08,'shot',{id:'trainee'});ex.serverEvent(1.08,'hit',{dmg:27});
 ex.serverEvent(2.0,'hit',{dmg:999});const x=ex.finish(1.5).offers[0];
 assert.equal(x.outcome.shots,1);assert.equal(x.outcome.damageDealt,27);assert.equal(x.outcome.censored,true);
});
test('C21 recorded dataset validates; analysis is deterministic and blocks small data',()=>{
 const d=study(),v=validateC21(d);assert.ok(v.records.length>1);
 const a=evaluateC21(d,{bootstraps:50}),b=evaluateC21(d,{bootstraps:50});assert.deepEqual(a,b);
 assert.equal(a.gate.passes,false);assert.equal(a.matches,1);
});
test('C21 validator rejects forged assignments and leaked post-treatment data',()=>{
 const d=study(),row=d.matches[0].offers[0];row.selectedAction='garbage';assert.throws(()=>validateC21(d),/assignment integrity/);
 row.selectedAction=assignedActionC21(row.seed,1);row.validity.preActionPublicFeaturesOnly=false;
 assert.throws(()=>validateC21(d),/feature leakage/);
});
test('C21 validator rejects duplicate match and overlapping outcome windows',()=>{
 const d=study();d.matches.push(structuredClone(d.matches[0]));assert.throws(()=>validateC21(d),/duplicate match/);
 d.matches.pop();d.matches[0].offers[1].time=d.matches[0].offers[0].windowEnd-.1;d.matches[0].offers[1].windowEnd=+(d.matches[0].offers[1].time+.9).toFixed(5);
 assert.throws(()=>validateC21(d),/overlapping labels/);
});
test('C21 invalid configuration and index fail closed',()=>{
 assert.throws(()=>assignedActionC21(-1,1));assert.throws(()=>assignedActionC21(10,0));
 assert.throws(()=>new EncounterRandomizerC21({seed:1,map:'arena',loadout:'mp5sd',mode:'br'}));
});

test('C21 real dataset insufficient gate prevents neural training and returns no model',async()=>{
 const {trainGatedC21}=await import('../lab/arena/action-value-network-c21.mjs');
 const result=trainGatedC21(study());assert.equal(result.allowed,false);assert.equal(result.model,null);
 assert.equal(result.productionPromotionAllowed,false);
});
test('C21 shadow MLP is an actual deterministic differentiable network, feature-only',async()=>{
 const {fitC21ExperimentalMLP,predictC21ExperimentalMLP,c21ValueFeatures}=await import('../lab/arena/action-value-network-c21.mjs');
 const d=study(),base=d.matches[0].offers[0];
 const synthetic=Array.from({length:30},(_,i)=>({...base,selectedAction:C21_ACTIONS[i%3],value:i%3===0?0:i%3===1?50:-50}));
 assert.equal(c21ValueFeatures(base.publicFeatures,'baseline').length,12);
 const a=fitC21ExperimentalMLP(synthetic,{epochs:80}),b=fitC21ExperimentalMLP(synthetic,{epochs:80});
 assert.deepEqual(a,b);assert.equal(a.w1.length,12);
 assert.ok(Number.isFinite(predictC21ExperimentalMLP(a,base.publicFeatures,'micro-left')));
 assert.equal(a.productionActuation,false);
});
