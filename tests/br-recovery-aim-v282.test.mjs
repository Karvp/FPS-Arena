import test from 'node:test';
import assert from 'node:assert/strict';
import {lootSafe,lootCandidates,planLoot} from '../loot-core.mjs';
import {remoteVelocity,predictedPoint,assessThreats,updateCombatMemory,manageResources} from '../combat-core.mjs';
import {findTarget,normaliseOptions,aimStep} from '../aim-core.mjs';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState} from './fixtures/game-shared/weaponstate.js';
import {ammoClassOf} from './fixtures/game-shared/rarity.js';
const helpers={rayWorld:(_o,_d,_b,max)=>max,eyeHeightOf:()=>1.6,player:{headRadius:.24,headYs:[1.62,1.15,.55],bodyH:[1.4,.95,.5],bodyHalf:.36,slideBodyHeight:.9,slideHeadY:1.02},rayAABB:()=>Infinity,raySphere:()=>Infinity};
function game(mode='br'){
 const ws=makeGunsState([{id:'m4a1',mag:8,reserve:90},{id:'g17',mag:17,reserve:30}],true);
 const local={alive:true,down:false,frozen:false,hp:90,armor:0,plates:2,maxArmor:50,mv:{x:0,y:0,z:0,onGround:true},ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id]}});
 return {running:true,phase:'match',modeState:{type:mode,ring:{cx:0,cz:0,r:100}},
  local,you:{tm:0,ringRate:0},net:{id:'self'},input:{locked:true,enabled:true},rig:{yaw:0,pitch:0},pos:{x:0,y:0,z:0},map:{bound:100,boxes:[]},
  remotes:{list:[]},bremotes:{list:[]},loot:{data:{crates:[{id:1,x:0,y:0,z:-9,rar:2,open:false}],items:[]}}};
}
const opts={enabled:true,mode:'autopilot',autoLoot:true,autoReload:true,autoArmor:true,autoSwitch:true,armorQuietSeconds:5,reloadQuietSeconds:3.5,lootRange:65};
function airborne(y=100){return {id:'enemy',alive:true,team:1,pos:{x:0,y,z:-6},yaw:0,stance:0,sliding:false,
 data:{air:1,aim:0,pitch:0},buf:[{t:1,x:0,y:y+34/30,z:-6},{t:1+1/30,x:0,y,z:-6}]};}
test('newly-landed BR player loots a usable crate even if an enemy glides directly overhead',()=>{
 const g=game(),r=airborne();g.remotes.list=[r];
 g.local.ws.guns[0]={id:'fists',mag:0,reserve:0};g.local.ws.guns[1]={id:'fists',mag:0,reserve:0};
 assert.equal(assessThreats(g,helpers).total,0);
 assert.equal(lootSafe(g,{nearest:Infinity,hot:false},opts,WEAPONS),true);
 assert.equal(lootCandidates(g,opts,WEAPONS,ammoClassOf).length,1);
 assert.equal(planLoot(g,{nearest:Infinity},opts,helpers,WEAPONS,ammoClassOf)?.kind,'crate');
 r.data.air=0;r.pos.y=0;
 assert.equal(assessThreats(g,helpers).hot,true);
 assert.equal(lootCandidates(g,opts,WEAPONS,ammoClassOf).length,0);
});
test('BR soft rotation checks actual loot destination instead of globally vetoing all pickups',()=>{
 const g=game();g.local.mv.x=5;g.local.ws.guns[0].mag=25;
 g.modeState.ring={cx:0,cz:0,r:100,phase:'wait',next:30,nxt:{cx:-20,cz:0,r:20}};
 g.loot.data.crates=[{id:1,x:-1,z:0,y:0,rar:3,open:false}];
 assert.equal(lootSafe(g,{nearest:Infinity},opts,WEAPONS),true);
 g.modeState.ring.next=7;
 assert.equal(lootSafe(g,{nearest:Infinity},opts,WEAPONS),false);
});
test('airborne 34m/s dive is tracked instead of discarded as teleport; ground teleport is rejected',()=>{
 const r=airborne(75),v=remoteVelocity(r);
 assert.ok(v.y < -33.9 && v.y > -34.1);
 assert.ok(predictedPoint({x:0,y:75,z:0},r,.065).y<73);
 r.data.air=0;assert.deepEqual(remoteVelocity(r),{x:0,y:0,z:0});
});
test('BR aim uses freshest snapshot and torso before head during air dive',()=>{
 const g=game();const r=airborne(36);r.pos={x:0,y:39,z:-40};
 r.buf=[{t:1,x:0,y:37.133333,z:-40},{t:1+1/30,x:0,y:36,z:-40}];
 g.remotes.list=[r];const options=normaliseOptions({...opts,target:'head',prediction:true,maxDistance:150,fov:45});
 const aim=findTarget(g,options,helpers);
 assert.ok(aim);assert.equal(aim.hitRegion,'body');
 assert.ok(aim.point.y<36,`predicted ${aim.point.y} should lead dive from newest snapshot`);
 assert.ok(aim.point.y>30);
});
test('after opponents disappear in TDM, quickly top-up magazine and plate; threat return cancels',()=>{
 const g=game('tdm');g.remotes.list=[{...airborne(0),data:{air:0,aim:0},pos:{x:0,y:0,z:-35}}];
 let m=updateCombatMemory(g,{},10,helpers,null,{});
 g.remotes.list=[];m=updateCombatMemory(g,{},10.1,helpers,null,m);
 assert.equal(m.emptySince,10.1);
 m=updateCombatMemory(g,{},11,helpers,null,m);
 const ctx={now:11,memory:m,catalog:WEAPONS,resourceState:{}};
 const s=manageResources(g,{slot:-1,fire:false,aim:false,reload:false},opts,null,helpers,ctx);
 assert.equal(s.reload,true);
 g.local.ws.guns[0].mag=WEAPONS.m4a1.magSize;
 const a=manageResources(g,{slot:-1,fire:false,aim:false},opts,null,helpers,ctx);
 assert.equal(a.plate,true);
 g.remotes.list=[{...airborne(0),data:{air:0,aim:1},pos:{x:0,y:0,z:-20}}];
 m=updateCombatMemory(g,{},11.1,helpers,null,m);
 assert.notEqual(manageResources(g,{slot:-1,fire:false,aim:false},opts,null,helpers,{...ctx,now:11.1,memory:m}).plate,true);
});
test('glider aim 10ms damping reduces step jitter without overshooting the target',()=>{
 const yaw=0,pitch=0,target={yaw:.06,pitch:-.02};
 const step=aimStep(yaw,pitch,target,1/60,10,1.56);
 assert.ok(step.yaw>0&&step.yaw<.06);
 assert.ok(step.pitch<0&&step.pitch>-.02);
 assert.ok(Math.abs(step.yaw-target.yaw)<.012);
});
