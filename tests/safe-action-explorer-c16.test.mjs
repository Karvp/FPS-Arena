import test from 'node:test';
import assert from 'node:assert/strict';
import {SafeActionExplorerC15,matchAssignmentC15} from '../lab/arena/safe-action-explorer-c15.mjs';
import {SafeActionExplorerC16,candidateSetC16,candidateSetC14} from '../lab/arena/safe-action-explorer-c16.mjs';
const mkClient=()=>({pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},rig:{yaw:0},
 local:{team:'red',alive:true,hp:100,armor:50,maxArmor:100,weapon:{magSize:30},
  ws:{slot:0,guns:[{id:'mp5sd',mag:20}]},mv:{x:0,y:0,z:0,onGround:true,stance:0}},
 remotes:{list:[{id:'enemy',team:'blue',alive:true,pos:{x:40,z:0},
  buf:[{t:.9,x:39.8,z:0},{t:1,x:40,z:0}]}]}});
const assignment=arm=>matchAssignmentC15(160001,{forcedArm:arm});
const setup=(Ctor,arm)=>new Ctor({seed:160001,mode:'tdm',map:'arena',loadout:'mp5sd',assignment:assignment(arm)});
const normalizeOffer=o=>({time:o.time,arm:o.arm,selectedAction:o.selectedAction,originalAction:o.originalAction,
  candidateSet:o.candidateSet,publicFeatures:o.publicFeatures,clearance:o.clearance,
  outcome:o.outcome,interrupted:o.interrupted});

test('C16 early rejection preserves every validity outcome and first safety reason',()=>{
 const c=mkClient();
 const cases=[{cmd:{},name:'eligible'}, {cmd:{fire:true},name:'fire'},
  {cmd:{skill:1},name:'skill'}, {cmd:{backward:true},name:'backward'}];
 for(const [name,mutate] of [
  ['hp',x=>x.local.hp=65],['offground',x=>x.local.mv.onGround=false],
  ['dead',x=>x.local.alive=false],['distance',x=>{x.remotes.list[0].pos.x=120;x.remotes.list[0].buf=[{t:.9,x:120,z:0},{t:1,x:120,z:0}];}],
  ['edge',x=>x.pos.x=67],['wall',x=>x.map.boxes.push({x0:-1.5,x1:1.5,z0:-2,z1:2,y0:-.5,y1:2})]]){
  const d=mkClient();mutate(d);cases.push({cmd:{},name,client:d});
 }
 for(const {cmd,name,client} of cases){
  const d=client||c,old=candidateSetC14(d,cmd,1.065),now=candidateSetC16(d,cmd,1.065);
  assert.equal(now.eligible,old.eligible,name);
  assert.equal(now.reasons[0],old.reasons[0],name);
  assert.deepEqual(now.candidates,old.candidates,name);
  assert.deepEqual(now.state,old.state,name);
  if(old.eligible)assert.deepEqual(now.clearance,old.clearance,name);
  if(!old.eligible&&old.reasons[0]!=='public-static-geometry')assert.equal(now.clearance.left,null,name);
 }
});
test('C16 action sequence matches C15 with control and treatment, all priorities',()=>{
 for(const arm of ['control','treatment']){
  const old=setup(SafeActionExplorerC15,arm),next=setup(SafeActionExplorerC16,arm);
  const c=mkClient(),inputs=[{}, {fire:true}, {},{skill:1},{}, {reload:true},{}, {jump:true},
   {},{forward:true},{left:true},{}, {interact:true},{}, {plate:true},{}];
  for(let i=0;i<120;i++){
   const t=1.065+i/60;const command=inputs[i%inputs.length];
   assert.deepEqual(next.command(t,c,command),old.command(t,c,command),'tick '+i+' arm '+arm);
   assert.equal(next.nextOfferAt,old.nextOfferAt);
  }
  const a=old.finish(3.3),b=next.finish(3.3);
  assert.deepEqual(b.offers.map(normalizeOffer),a.offers.map(normalizeOffer));
  assert.equal(b.diagnostics.eligibleOffers,a.diagnostics.eligibleOffers);
  assert.equal(b.diagnostics.interventionTicks,a.diagnostics.interventionTicks);
  assert.equal(b.diagnostics.probeAttempts,a.diagnostics.probeAttempts);
  assert.ok(b.diagnostics.lazyGeometry.earlyRejectedEvaluations>0);
  assert.equal(b.metadata.productionActuation,false);
 }
});
test('C16 never loosens geometry, retries or mode/priority vetoes',()=>{
 const c=mkClient();c.map.boxes.push({x0:-2,x1:2,z0:-1.5,z1:1.5,y0:0,y1:3});
 const a=setup(SafeActionExplorerC16,'treatment');
 a.command(1.065,c,{});
 assert.equal(a.totalEligible,0);
 assert.equal(a.firstRejectionReasons['public-static-geometry'],1);
 assert.ok(a.nextOfferAt<1.3);
 assert.equal(a.skippedGeometryWhenBlocked,0);
 c.map.boxes=[];
 a.command(1.2,c,{fire:true});
 assert.equal(a.totalEligible,0);
 assert.equal(a.skippedGeometryWhenBlocked,1);
 const res=a.finish(3);
 assert.equal(res.diagnostics.lazyGeometry.geometryEvaluations,1);
 assert.equal(res.metadata.explorationAlgorithm,'c16-lazy-geometry-c15-scheduler');
});
test('C16 does not use game RNG and failed state stays unmodified',()=>{
 const a=setup(SafeActionExplorerC16,'control'),c=mkClient(),cmd={fire:true,forward:true};
 const orig=JSON.stringify(cmd),saved=Math.random;
 Math.random=()=>{throw Error('Game RNG accessed');};
 try{assert.deepEqual(a.command(1.065,c,cmd),cmd);}finally{Math.random=saved;}
 assert.equal(JSON.stringify(cmd),orig);
 assert.equal(a.offers.length,0);
});
