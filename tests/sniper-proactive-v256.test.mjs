import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireCombatTarget,normaliseOptions} from '../aim-core.mjs';
import {autoFireInput,planProMovement,planPrecisionSightline} from '../combat-core.mjs';
import {weaponProfile} from '../weapon-tactics.mjs';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';

const opts=normaliseOptions({enabled:true,mode:'autopilot',maxDistance:130,brLeadSeconds:24});
const clear=(o,v,boxes,d)=>d;
const helper={player:{headYs:[1.6,1.15,.35],slideHeadY:1,bodyH:[1.3,.9,.5],slideBodyHeight:.75},eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:clear};
function game(id='l115a3',z=-175){
 const w=WEAPONS[id],ws=makeGunsState([{id,mag:w.magSize,reserve:50},{id:'g17',mag:17,reserve:60}],true);
 const local={alive:true,down:false,inView:false,frozen:false, hp:100,armor:100, ws,mv:{x:0,y:0,z:0,stance:0,onGround:true,lean:0,vx:0,vz:0,sprint:false}};
 Object.defineProperty(local,'weapon',{get:()=>WEAPONS[ws.guns[ws.slot].id]});
 return {running:true,phase:'match',map:{boxes:[],bound:250},rig:{yaw:1.3,pitch:0},pos:{x:0,y:0,z:0},input:{locked:true,enabled:true},net:{id:'me'},you:{tm:0,ringRate:0},local,
 modeState:{type:'br',ring:{cx:0,cz:0,r:220,phase:'wait',next:75,nxt:{cx:-20,cz:0,r:60}}},remotes:{list:[{id:'e',alive:true,team:1,pos:{x:0,y:0,z},yaw:0,stance:0,sliding:false,data:{}}]},bremotes:{list:[]},zremotes:{list:[]}};
}
function aim(g){const t=acquireCombatTarget(g,opts,helper);if(t?.visible){g.rig.yaw=t.yaw;g.rig.pitch=t.pitch;}return t;}

test('Sniper and DMR actively acquire foes beyond generic 130 m cap',()=>{
 const s=game('l115a3',-170),t=aim(s);assert.ok(t?.visible);
 assert.ok(t.distance>130);assert.ok(Math.abs(s.rig.yaw)<1e-6);
 const marksman=game('svt40',-155);
 assert.ok(aim(marksman)?.visible);
 const rifle=game('m4a1',-170);
 assert.ok(aim(rifle)?.visible,'AR Autopilot can detect a target inside its 200 m hitscan reach');
 assert.equal(acquireCombatTarget(rifle,{...opts,mode:'assist'},helper),null,'Assist still respects manual targeting distance');
});

test('Sniper waits only for usable scope ADS, then fires through authoritative weapon state',()=>{
 const g=game('l115a3',-142),t=aim(g);
 g.ads={e:.22};let command=autoFireInput(g,{slot:-1,aim:false,fire:false},t,helper,opts);
 assert.equal(command.aim,true);assert.equal(command.fire,false,'no early hipfire shot while sniper scope is settling');
 g.ads.e=.85;
 command=autoFireInput(g,{slot:-1,aim:false,fire:false},t,helper,opts);
 assert.equal(command.fire,true,'fire on first eligible input tick');
 const before=g.local.ws.guns[0].mag;
 const res=stepWeapons(g.local.ws,command,1/60,{alive:true,frozen:false,armor:100,plates:0,maxArmor:100});
 assert.equal(res.fired,true);assert.equal(g.local.ws.guns[0].mag,before-1);
});

test('Sniper approaching from beyond effective weapon range does not orbit indefinitely',()=>{
 const g=game('l115a3',-235),t=aim(g);
 assert.ok(t?.visible);assert.ok(t.distance>weaponProfile(g.local.weapon,opts).fire);
 const proposal=planProMovement(g,t,helper,opts,1,{});
 assert.equal(proposal?.reason,'pro-long-range-close');assert.ok(proposal.z<0);
});

test('When a distant sniper target is occluded, planner finds a safe lateral sightline',()=>{
 const g=game('l115a3',-80),t=aim(g);
 const blockedHelper={...helper,rayWorld:(origin,vec,boxes,d)=>{
   // Simulate a wall blocking the central corridor near the shooter's origin,
   // and open shots from an offset vantage farther than 3 m on either side.
   if(vec[2]<-.15 && Math.abs(origin[0])<3)return Math.min(2,d);
   return d;
 }};
 const hidden=acquireCombatTarget(g,opts,blockedHelper);
 assert.ok(hidden && !hidden.visible);
 const waypoint=planPrecisionSightline(g,hidden,blockedHelper,opts);
 assert.ok(waypoint && Math.abs(waypoint.x)>3,`could not find open vantage: ${JSON.stringify(waypoint)}`);
 g.modeState.ring.r=5;
 assert.equal(planPrecisionSightline(g,hidden,blockedHelper,opts),null,'cannot reposition outside tiny BR ring');
});

test('Proposed sniper lane change never blocks shots merely due to velocity',()=>{
 const g=game('l115a3',-55),t=aim(g);g.local.mv.vx=5;
 const p=planProMovement(g,t,helper,opts,1,{});
 assert.equal(p.reason,'pro-brake');assert.notEqual(p.suppressFire,true);
});
