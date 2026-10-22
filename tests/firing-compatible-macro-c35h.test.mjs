import test from 'node:test';import assert from 'node:assert/strict';
import {FiringCompatibleMacroC35H,publicFireCorridorC35H} from '../lab/arena/firing-compatible-macro-c35h.mjs';
import {candidateSetC16} from '../lab/arena/safe-action-explorer-c16.mjs';
const opts={seed:35020019,mode:'tdm',matchId:'test-c35h',setupId:'setup-1',cooldown:.25,burstTicks:3};
function fake(now,{boxes=[],pos={x:2,y:0,z:30},hp=100}={}){
 return {pos,local:{id:'trainee',team:'red',hp,armor:50,maxArmor:50,alive:true,mv:{vx:1,vz:1,onGround:true,y:0,stance:0},weapon:{id:'m4a1',magSize:30},ws:{slot:0,guns:[{id:'m4a1',mag:30}]}},remotes:{list:[{id:'bot2',team:'blue',alive:true,pos:{x:3,y:0,z:65},yaw:.3,data:{w:'aa12'},buf:[{t:now-.16,x:3,z:65},{t:now-.065,x:3,z:65}]}]},rig:{yaw:0},map:{bound:150,boxes}};
}
const cmd={fire:true,aim:true,forward:true,slot:-1};
test('symmetric public firing corridor and separate C16 micro exclusion',()=>{
 const client=fake(2);const c=publicFireCorridorC35H(client,cmd,2);
 assert.equal(c.eligible,true,JSON.stringify(c));assert.equal(c.clearance.left,true);assert.equal(c.clearance.right,true);
 assert.equal(candidateSetC16(client,cmd,2,'tdm').eligible,false);
});
test('shadow observes but does not change a bit of original input',()=>{
 const x=new FiringCompatibleMacroC35H({...opts,policy:'observe'});
 for(let t=0;t<60;t++){const c=fake(2+t/60),a=x.command(2+t/60,c,cmd,cmd);assert.deepEqual(a,cmd);}
 const r=x.finish();assert.ok(r.counts.episodes>0);assert.equal(r.counts.modifiedTicks,0);
 assert.equal(r.counts.incumbentFireModified,0);
});
test('lateral controller preserves fire aim forward and only adds one lateral key',()=>{
 const x=new FiringCompatibleMacroC35H({...opts,policy:'lateral'});
 const outputs=[];for(let t=0;t<21;t++)outputs.push(x.command(2+t/60,fake(2+t/60),cmd,cmd));
 const r=x.finish();assert.ok(r.counts.modifiedTicks>=3);assert.ok(r.counts.completed>=1);
 for(const y of outputs){assert.equal(y.fire,true);assert.equal(y.aim,true);assert.equal(y.forward,true);assert.equal(y.slot,-1);assert.ok((!y.left&&!y.right)|| (!!y.left!==!!y.right));}
 assert.equal(r.counts.modifiedTicks,r.events.reduce((s,e)=>s+e.deliveredTicks,0));
});
test('fails closed on competing priority action, map boundaries and stale target',()=>{
 assert.equal(publicFireCorridorC35H(fake(2),{...cmd,reload:true},2).eligible,false);
 assert.equal(publicFireCorridorC35H(fake(2),{...cmd,left:true},2).eligible,false);
 assert.equal(publicFireCorridorC35H(fake(2,{pos:{x:149,y:0,z:30}}),cmd,2).eligible,false);
 const blockers=[{x0:.6,x1:3.5,z0:28,z1:30,y0:-1,y1:3}];
 assert.equal(publicFireCorridorC35H(fake(2,{boxes:blockers}),cmd,2).eligible,false);
 const stale=fake(2);stale.remotes.list[0].buf=[{t:1,x:3,z:65},{t:1.1,x:3,z:65}];
 assert.equal(publicFireCorridorC35H(stale,cmd,2).eligible,false);
});
test('interrupts if protected fire disappears and never inserts fire on a tick without fire',()=>{
 const x=new FiringCompatibleMacroC35H({...opts,policy:'lateral'});
 x.command(2,fake(2),cmd,cmd);
 const original={forward:true,aim:true,slot:-1};
 assert.deepEqual(x.command(2+1/60,fake(2+1/60),original,original),original);
 const r=x.finish();assert.equal(r.counts.modifiedTicks,1);assert.equal(r.counts.interrupted,1);
});
test('refuses upstream attempts to suppress fire or inject competing macro movement',()=>{
 const x=new FiringCompatibleMacroC35H({...opts,policy:'lateral'});
 assert.throws(()=>x.command(2,fake(2),cmd,{...cmd,fire:false}),/upstream fire change/);
 const y=new FiringCompatibleMacroC35H({...opts,policy:'lateral'});
 assert.throws(()=>y.command(2,fake(2),cmd,{...cmd,left:true}),/upstream competing movement/);
});
test('rejects invalid settings and nonmonotonic clock',()=>{
 assert.throws(()=>new FiringCompatibleMacroC35H({...opts,policy:'production'}),/configuration/);
 assert.throws(()=>new FiringCompatibleMacroC35H({...opts,burstTicks:100}),/configuration/);
 const x=new FiringCompatibleMacroC35H({...opts});x.command(2,fake(2),cmd,cmd);
 assert.throws(()=>x.command(2,fake(2),cmd,cmd),/nonmonotonic/);
});
