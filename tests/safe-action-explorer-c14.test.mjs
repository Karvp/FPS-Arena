import test from 'node:test';
import assert from 'node:assert/strict';
import {matchAssignmentC14,publicClearanceC14,candidateSetC14,SafeActionExplorerC14} from '../lab/arena/safe-action-explorer-c14.mjs';
const client=()=>({pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,
  weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const exp=(arm='treatment',seed=17)=>new SafeActionExplorerC14({seed,mode:'tdm',map:'arena',loadout:'mp5sd',assignment:matchAssignmentC14(seed,{forcedArm:arm})});
test('C14 match assignment is deterministic, validated and independent of Math.random',()=>{
 const a=matchAssignmentC14(10),b=matchAssignmentC14(10);
 assert.deepEqual(a,b);assert.equal(a.design,'randomized-match');assert.equal(a.assignmentProbability,.5);
 const prior=Math.random;Math.random=()=>{throw Error('game RNG must never be called');};
 try{assert.deepEqual(matchAssignmentC14(10),a);}finally{Math.random=prior;}
 assert.throws(()=>matchAssignmentC14(10,{probability:1.1}));
 assert.throws(()=>matchAssignmentC14(10,{forcedArm:'maybe'}));
});
test('C14 forced arm marked diagnostic, not a randomized causal study',()=>{
 const a=matchAssignmentC14(10,{forcedArm:'control'});
 assert.equal(a.randomized,false);assert.equal(a.assignmentProbability,1);assert.equal(a.treatmentProbability,0);
});
test('C14 safe geometry rejects either lateral obstruction, wall and map edge',()=>{
 const c=client();assert.equal(publicClearanceC14(c,{},-1),true);
 c.map.boxes=[{x0:-1.4,x1:-.5,z0:-.6,z1:.6,y0:0,y1:3}];
 assert.equal(publicClearanceC14(c,{},-1),false);
 assert.equal(candidateSetC14(c,{forward:true},1.065).eligible,false);
 c.map.boxes=[];c.pos.x=67.7;assert.equal(publicClearanceC14(c,{},1),false);
});
test('C14 never changes priority commands or low-health actions',()=>{
 const c=client(),e=exp();const important=[{fire:true},{skill:true},{reload:true},{use:true},{jump:true},{left:true},{right:true},{backward:true},{prone:true}];
 for(const cmd of important){assert.deepEqual(e.command(1.065,c,cmd),cmd);}
 c.local.hp=70;assert.equal(candidateSetC14(c,{},1.065).eligible,false);
 assert.equal(e.finish(2).diagnostics.eligibleOffers,0);
});
test('C14 control never modifies command, even when offer valid',()=>{
 const c=client(),e=exp('control');const before={forward:true,fire:false};
 for(let i=0;i<15;i++){const v=e.command(1.065+i*.2,c,before);assert.deepEqual(v,before);}
 const out=e.finish(6);assert.ok(out.offers.length>=1);assert.ok(out.offers.every(o=>o.selectedAction==='baseline'));
 assert.equal(out.diagnostics.interventionTicks,0);assert.equal(before.left,undefined);
});
test('C14 treatment only adds a bounded lateral key, never modifies aim/fire/skill',()=>{
 const c=client(),e=exp();const input={forward:true,fire:false,aim:true,skill:false};
 const o=e.command(1.065,c,input);
 assert.equal(o.forward,true);assert.equal(o.aim,true);assert.equal(o.fire,false);
 assert.ok(o.left!==o.right);assert.equal(input.left,undefined);
 const out=e.finish(2);assert.equal(out.offers.length,1);
 assert.deepEqual(out.offers[0].candidateSet,['baseline','micro-left','micro-right']);
 assert.equal(out.offers[0].conditionalActionProbability,.5);
 assert.equal(out.offers[0].validity.serverOnlyFeaturesUsed,false);
});
test('C14 active intervention immediately aborts if incumbent starts firing',()=>{
 const c=client(),e=exp();e.command(1.065,c,{});
 const cmd={fire:true,aim:true,forward:true};
 assert.deepEqual(e.command(1.08,c,cmd),cmd);
 assert.equal(e.finish(2).diagnostics.interruptions,1);
});
test('C14 outcome audit labels only executed arm observationally and censors match tail',()=>{
 const e=exp();e.command(1.065,client(),{});
 e.serverEvent(1.1,'shot',{id:'trainee'});e.serverEvent(1.11,'hit',{dmg:11});
 e.serverEvent(1.13,'kill',{k:'trainee'});e.serverEvent(2.1,'hit',{dmg:100});
 const r=e.finish(1.5);assert.equal(r.offers[0].outcome.shots,1);
 assert.equal(r.offers[0].outcome.damageDealt,11);assert.equal(r.offers[0].outcome.kills,1);
 assert.equal(r.offers[0].outcome.censored,true);
 assert.equal(r.metadata.productionActuation,false);
});
test('C14 all off/invalid modes unchanged; no source private enemy access',()=>{
 const c=client(),e=new SafeActionExplorerC14({seed:10,mode:'br',map:'oilrig',loadout:'mp5sd',assignment:matchAssignmentC14(10)});
 assert.equal(candidateSetC14(c,{},1.065,'br').eligible,false);
 assert.deepEqual(e.command(1.065,c,{forward:true}),{forward:true});
 const missing=client();missing.remotes.list[0].buf=[];
 assert.equal(candidateSetC14(missing,{},1.065).eligible,false);
});
