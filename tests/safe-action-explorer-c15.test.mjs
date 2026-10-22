import test from 'node:test';
import assert from 'node:assert/strict';
import {SafeActionExplorerC15,matchAssignmentC15} from '../lab/arena/safe-action-explorer-c15.mjs';
import {SafeActionExplorerC14} from '../lab/arena/safe-action-explorer-c14.mjs';
const makeClient=()=>({pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,
  weapon:{magSize:30},ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const explorer=(arm='treatment')=>new SafeActionExplorerC15({seed:17,mode:'tdm',map:'arena',loadout:'mp5sd',assignment:matchAssignmentC15(17,{forcedArm:arm})});
test('C15 shortened rejection retry preserves C14 safety thresholds',()=>{
 const a=explorer('control'),c=makeClient();
 assert.deepEqual(a.command(1.065,c,{fire:true}),{fire:true});
 assert.ok(a.nextOfferAt<1.3);
 assert.equal(a.totalEligible,0);
 assert.equal(a.finish(2).diagnostics.rejectionReasons['incumbent-priority-command'],1);
});
test('C15 discovers later naturally safe states during C14 rejection cooldown',()=>{
 const a=explorer('treatment'),b=new SafeActionExplorerC14({seed:17,mode:'tdm',map:'arena',loadout:'mp5sd',assignment:matchAssignmentC15(17,{forcedArm:'treatment'})});
 const c=makeClient();
 for(const e of [a,b])e.command(1.065,c,{fire:true});
 for(const e of [a,b])e.command(1.195,c,{forward:true});
 assert.equal(a.offers.length,1);assert.equal(b.offers.length,0);
 assert.equal(a.offers[0].candidateSet.length,3);
 assert.ok(a.nextOfferAt>=2.095);
});
test('C15 does not shorten cooldown after any eligible offer',()=>{
 const a=explorer('control'),c=makeClient();
 a.command(1.065,c,{});
 assert.equal(a.offers.length,1);
 for(let i=1;i<=5;i++)a.command(1.065+i*.12,c,{});
 assert.equal(a.offers.length,1);assert.equal(a.probes,1);
 c.remotes.list[0].buf=[{t:1.8,x:39.8,z:0},{t:1.9,x:40,z:0}];
 a.command(1.97,c,{});assert.equal(a.offers.length,2);
});
test('C15 remains a no-op on control while preserving diagnostics',()=>{
 const a=explorer('control'),c=makeClient();
 for(let i=0;i<12;i++){
  const original=i<2?{fire:true,forward:true}:{forward:true,aim:true};
  assert.deepEqual(a.command(1.065+i*.13,c,original),original);
 }
 const r=a.finish(6);
 assert.equal(r.diagnostics.interventionTicks,0);
 assert.equal(r.metadata.productionActuation,false);
 assert.equal(r.metadata.explorationAlgorithm,'c15-rapid-rejection-retry');
 assert.equal(r.diagnostics.probeAttempts,r.diagnostics.rejectedProbes+r.diagnostics.eligibleProbes);
});
test('C15 treatment cannot override safety priority even during active window',()=>{
 const a=explorer('treatment'),c=makeClient();
 a.command(1.065,c,{});
 const fire={fire:true,aim:true};
 assert.deepEqual(a.command(1.08,c,fire),fire);
 assert.equal(a.interruptions,1);
});
test('C15 retry is bounded and has no game RNG dependency',()=>{
 assert.throws(()=>new SafeActionExplorerC15({seed:17,mode:'tdm',map:'arena',loadout:'mp5sd',assignment:matchAssignmentC15(17),rejectionRetrySeconds:.02}));
 assert.throws(()=>new SafeActionExplorerC15({seed:17,mode:'tdm',map:'arena',loadout:'mp5sd',assignment:matchAssignmentC15(17),rejectionRetrySeconds:1.0}));
 const a=explorer('treatment'),c=makeClient();const saved=Math.random;
 Math.random=()=>{throw Error('game RNG used');};
 try{a.command(1.065,c,{fire:true});a.command(1.195,c,{});}finally{Math.random=saved;}
 assert.equal(a.offers.length,1);
});
