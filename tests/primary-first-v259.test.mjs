import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {manageResources,planProMovement,planBattleRoyalePush} from '../combat-core.mjs';
import {normaliseOptions} from '../aim-core.mjs';

const options={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,autoArmor:false,
 reloadQuietSeconds:3.5,weaponTactics:true,proMovement:true,sidearmEmergencyRange:10};
const helpers={rayWorld:(_a,_b,_c,len)=>len,eyeHeightOf:()=>1.6,leanOffset:.35};
const sample={slot:-1,fire:false,aim:false,reload:false,plate:false};
const t=d=>({id:'enemy',point:{x:0,y:1.6,z:-d},visible:true,yaw:0,pitch:0});
const mem=(near,now=3)=>({risk:{hot:Number.isFinite(near),nearest:near,visible:Number.isFinite(near)?1:0,aiming:0,close:near<42?1:0},lastDanger:now,lastDamage:now,lastFire:now});
function game(primary='l115a3',secondary='g17',mode='tdm') {
 const ws=makeGunsState([{id:primary,mag:WEAPONS[primary].magSize,reserve:90},
   {id:secondary,mag:WEAPONS[secondary].magSize,reserve:80}],mode==='br'||mode==='zm');
 const local={alive:true,down:false,frozen:false,hp:100,armor:50,maxArmor:50,plates:0,
   mv:{x:0,y:0,z:0,vx:0,vz:0,onGround:true},ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {running:true,phase:'match',modeState:{type:mode},local,pos:{x:0,y:0,z:0},
   rig:{yaw:0,pitch:0},map:{bound:180,boxes:[]},you:{ringRate:0},
   input:{locked:true,enabled:true},zremotes:{list:[]},remotes:{list:[]},bremotes:{list:[]}};
}
const act=(g,d,now=3,state={},config=options,override=null)=>{
 const memory=override||mem(d,now);
 const cmd=manageResources(g,sample,config,t(d),helpers,{now,memory,resourceState:state,catalog:WEAPONS});
 return {cmd,result:stepWeapons(g.local.ws,cmd,1/60,{alive:true,frozen:false,armor:50,maxArmor:50,plates:0})};
};

test('sniper retains primary against close and distant enemies while loaded',()=>{
 for(const d of [2,8,20,80,160]){
  const g=game();const a=act(g,d);
  assert.equal(a.cmd.slot,-1,`d=${d}`);
  assert.equal(g.local.ws.slot,0);
 }
});
test('sniper with empty magazine reloads immediately instead of swapping to pistol at 70m',()=>{
 const g=game();g.local.ws.guns[0].mag=0;
 const a=act(g,70);
 assert.equal(a.cmd.slot,-1);assert.equal(a.cmd.fire,false);assert.equal(a.cmd.reload,true);
});
test('close enemy at 8m triggers emergency swap from dry main weapon',()=>{
 const g=game();g.local.ws.guns[0].mag=0;
 const a=act(g,8);
 assert.equal(a.cmd.slot,1);assert.equal(a.result.switched,true);
});
test('11m enemy is outside 10m emergency threshold, but adjustable 12m threshold activates',()=>{
 const g=game();g.local.ws.guns[0].mag=0;
 assert.equal(act(g,11).cmd.slot,-1);
 assert.equal(act(g,11,3,{}, {...options,sidearmEmergencyRange:12}).cmd.slot,1);
});
test('real zombie positions (not just selected target risk) trigger sidearm only in melee buffer',()=>{
 const g=game('m4a1','g17','zm');g.local.ws.guns[0].mag=0;
 const safe={risk:{hot:false,nearest:Infinity,visible:0,aiming:0,close:0},lastDanger:3,lastFire:3,lastDamage:3};
 g.zremotes.list=[{alive:true,pos:{x:0,z:-19,y:0}}];
 assert.equal(act(g,55,3,{},options,safe).cmd.slot,-1);
 g.zremotes.list[0].pos.z=-6;
 assert.equal(act(g,55,3,{},options,safe).cmd.slot,1);
});
test('autopilot instantly returns to a loaded primary even if pistol has bullets and hot contact',()=>{
 const g=game();g.local.ws.slot=1;
 const a=act(g,5);
 assert.equal(a.cmd.slot,0);assert.equal(a.result.switched,true);
});
test('not switching to backup only to refill its magazine during quiet time',()=>{
 const g=game('m4a1','g17','tdm');g.local.ws.guns[1].mag=0;
 const state={};let switches=0;
 const calm={risk:{hot:false,nearest:Infinity,visible:0,aiming:0,close:0},lastDanger:0,lastFire:0,lastDamage:0};
 for(let i=0;i<360;i++){
  const a=act(g,Infinity,50+i/60,state,options,calm);
  if(a.result.switched)switches++;
 }
 assert.equal(switches,0);assert.equal(g.local.ws.slot,0);
});
test('pistol at long range stops firing and preserves sniper spacing during a temporary recovery',()=>{
 const g=game();g.local.ws.guns[0].mag=0;g.local.ws.slot=1;
 const result=manageResources(g,{...sample,fire:true,aim:true},options,t(48),helpers,
   {now:7,memory:mem(48,7),resourceState:{},catalog:WEAPONS});
 assert.equal(result.fire,false);assert.equal(result.aim,false);
 const plan=planProMovement(g,t(18),helpers,{...options,strategicPrimaryWeapon:WEAPONS.l115a3},10,{});
 assert.equal(plan?.reason,'pro-spacing');
});
test('BR rifle/sniper temporary sidearm does not cause aggression push toward player',()=>{
 const g=game('l115a3','g17','br');g.local.ws.slot=1;
 g.modeState.ring={cx:0,cz:0,r:160,next:100,phase:'wait'};
 assert.equal(planBattleRoyalePush(g,t(50),helpers,
   {...options,strategicPrimaryWeapon:WEAPONS.l115a3,brAggression:100},9),null);
});
test('when primary ammo is unrecoverable, does not use backup at 40m, saves it for close fight',()=>{
 const g=game('m4a1','g17','zm');g.local.ws.guns[0].mag=0;g.local.ws.guns[0].reserve=0;
 assert.equal(act(g,40).cmd.slot,-1);
 assert.equal(act(g,7).cmd.slot,1);
});
test('config validates emergency range and uses 10m by default',()=>{
 assert.equal(normaliseOptions({sidearmEmergencyRange:-4}).sidearmEmergencyRange,5);
 assert.equal(normaliseOptions({sidearmEmergencyRange:50}).sidearmEmergencyRange,15);
 assert.equal(normaliseOptions({}).sidearmEmergencyRange,10);
});
