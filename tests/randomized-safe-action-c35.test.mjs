import test from 'node:test';
import assert from 'node:assert/strict';
import {RandomizedSafeActionC35,C35_SCHEMA,C35_HORIZONS,publicSnapshotC35} from '../lab/arena/randomized-safe-action-c35.mjs';
import {candidateSetC16} from '../lab/arena/safe-action-explorer-c16.mjs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const opts={seed:35350011,map:'arena',loadout:'m4a1',lagMs:65,matchId:'c35-test-arena-35350011'};
const mock=(now=2)=>({pos:{x:2,y:0,z:30},local:{id:'trainee',team:'red',hp:100,armor:50,maxArmor:50,alive:true,mv:{vx:1,vz:1,onGround:true,y:0,stance:0},weapon:{id:'m4a1',magSize:30},ws:{slot:0,guns:[{id:'m4a1',mag:30}]}},
 remotes:{list:[{id:'bot2',team:'blue',alive:true,pos:{x:3,y:0,z:65},yaw:.3,data:{w:'aa12'},buf:[{t:now-.16,x:3,z:66},{t:now-.06,x:3,z:65}]}]},
 rig:{yaw:0},map:{bound:150,boxes:[]}});
const s=()=>({tick:102,map:{boxes:[{},{}]},players:new Map([['bot2',{id:'bot2',x:4,y:0,z:65,yaw:.1,ws:{guns:[{id:'aa12'}],slot:0},alive:true}]])});
const trainee={x:2,y:0,z:30};
const setup=()=>new RandomizedSafeActionC35(opts);
const eligibleClient=()=>{
 const m=mock();let c=candidateSetC16(m,{},2,'tdm');
 return {m,check:c};
};
test('rejects invalid constructor and lag',()=>{assert.throws(()=>new RandomizedSafeActionC35({...opts,lagMs:-1}));assert.throws(()=>new RandomizedSafeActionC35({...opts,matchId:''}));});
test('publicSnapshot is a copied public-only record',()=>{const m=mock();m.serverAimYaw=123;m.map.boxes.push({x0:0,x1:4,y0:0,y1:2,z0:29,z1:31});const p=publicSnapshotC35(m,2,{},'arena',65,'bot2');assert.equal(p.enemy.position.z,65);assert.equal(p.staticMap.count,1);m.map.boxes[0].x0=555;assert.equal(p.staticMap.nearbyBoxes[0].x0,0);assert.ok(!JSON.stringify(p).includes('serverAimYaw'));});
test('inherits C21 assignment independently of run order',()=>{assert.equal(assignedActionC21(opts.seed,1),assignedActionC21(opts.seed,1));const a=Array.from({length:999},(_,i)=>assignedActionC21(opts.seed+i,1));assert.equal(new Set(a).size,3);});
test('disabled / ineligible command never produces assignment',()=>{const t=setup(),m=mock();const a=t.command(2,m,{fire:true});assert.equal(a.fire,true);assert.equal(t.offers.length,0);});
test('three-arm action probabilities are logged and immutable',()=>{
 const t=setup(),m=mock();const safety=candidateSetC16(m,{},2,'tdm');assert.equal(safety.eligible,true,JSON.stringify(safety.reasons));
 const a=t.command(2,m,{});assert.equal(t.offers.length,1);const row=t.offers[0];assert.equal(row.propensity,1/3);assert.equal(row.assignedAction,assignedActionC21(opts.seed,1));assert.deepEqual(row.candidateSet,['baseline','micro-left','micro-right']);assert.equal(row.public.enemy.position.z,65);assert.equal(row.serverAudit,null);assert.equal(row.public.clearance.left!==null,true);t.afterCommand(2,s(),trainee,a);assert.equal(row.serverAudit.enemy.weapon,'aa12');assert.equal(row.serverAudit.neverInput,true);
});
test('C16 safety and snapshots only use public pre-decision state',()=>{const t=setup(),m=mock();m.serverSecret=123;m.remotes.list[0].privateVelocity=999;t.command(2,m,{});assert.ok(!JSON.stringify(t.offers[0].public).includes('123'));assert.ok(!JSON.stringify(t.offers[0].public).includes('999'));});
test('server-confirmed hostile hit only after assignment and within horizon',()=>{
 const t=setup(),m=mock();t.hostileWeaponHit(1.9,17);t.command(2,m,{});
 t.hostileWeaponHit(2.15,7);t.hostileWeaponHit(3.2,3);t.hostileWeaponHit(4.1,88);t.hostileWeaponHit(3,NaN);
 const o=t.finish(4.0).offers[0];assert.equal(o.outcome.hostileWeaponHits,2);assert.equal(o.outcome.hostileWeaponDamage,10);assert.equal(o.horizons['0.3'].hostileDamage,7);assert.equal(o.horizons['1.8'].hostileDamage,10);
});
test('exact 1.8s randomized windows do not overlap',()=>{const t=setup(),m=mock();t.command(2,m,{});t.command(2.3,m,{});assert.equal(t.offers.length,1);t.command(3.8,mock(3.8),{});assert.equal(t.offers.length,2);});
test('censored window not converted to a complete zero-label outcome',()=>{const t=setup();t.command(2,mock(),{});const r=t.finish(3);assert.equal(r.offers[0].outcome.censored,true);assert.equal(r.offers[0].horizons['0.3'].censored,false);assert.equal(r.offers[0].horizons['1.8'].censored,true);});
test('ITT arm survives per-tick interrupted action',()=>{
 let seed=opts.seed;while(assignedActionC21(seed,1)==='baseline')seed++;
 const t=new RandomizedSafeActionC35({...opts,seed}),m=mock();t.command(2,m,{});const action=t.offers[0].assignedAction;
 t.command(2.0167,m,{fire:true});const r=t.finish(4);assert.equal(r.offers[0].assignedAction,action);assert.equal(r.offers[0].runtimeOverride,true);assert.equal(r.offers[0].deliveredAction,'interrupted');
});
test('replay checks assignment integrity',()=>{const t=setup();t.command(2,mock(),{});t.offers[0].assignedAction='manipulated';assert.throws(()=>t.finish(4),/assignment replay failure/);});
test('result envelope records research-only and strict causal limits',()=>{const t=setup();t.command(2,mock(),{});const r=t.finish(4);assert.equal(r.schema,C35_SCHEMA);assert.equal(r.metadata.productionActuation,false);assert.equal(r.metadata.intentToTreat,true);assert.equal(C35_HORIZONS.at(-1),1.8);});
