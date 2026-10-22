import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {rayWorld,raySphere,rayAABB} from './fixtures/game-shared/geometry.js';
import {PLAYER,LEAN} from './fixtures/game-shared/constants.js';
import {findTarget,acquireCombatTarget,zombieTargetPriority} from '../aim-core.mjs';
import {manageResources} from '../combat-core.mjs';
const helpers={player:PLAYER,leanOffset:LEAN.offset,eyeHeightOf:()=>1.6,rayWorld,raySphere,rayAABB};
const options={mode:'autopilot',enabled:true,autoReload:true,autoSwitch:true,weaponTactics:true,sidearmEmergencyRange:10,
 target:'head',fov:180,maxDistance:250,sticky:true,prediction:true,predictionMs:65,visibility:true,priority:'threat'};
function mock(mode='tdm',ids=['m4a1','g17'],slot=0){
 const ws=makeGunsState(ids.map(id=>({id,mag:WEAPONS[id].magSize,reserve:WEAPONS[id].magSize*3})),!['tdm','snd','hp'].includes(mode));
 ws.slot=slot;
 const local={alive:true,down:false,frozen:false,hp:100,armor:50,plates:0,maxArmor:50,
  mv:{x:0,y:0,z:0,lean:0,vx:0,vz:0,onGround:true},ws};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {local,running:true,phase:'match',pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},map:{bound:100,boxes:[]},
  net:{id:'me'},modeState:{type:mode,ring:{cx:0,cz:0,r:50}},input:{locked:true,enabled:true},
  you:{tm:0,ringRate:0},remotes:{list:[]},bremotes:{list:[]},zremotes:{list:[]},
  loot:{data:{items:[],crates:[]}}};
}
const inp=()=>({slot:-1,fire:false,aim:false,reload:false,plate:false});
const tickCtx=(now,nearest=Infinity)=>({now,catalog:WEAPONS,resourceState:state,
 memory:{risk:{nearest,hot:nearest<15,visible:nearest<70?1:0,aiming:0,close:nearest<15?1:0},
   lastFire:0,lastDanger:0,lastDamage:0}});
let state={};
const wsCtx={alive:true,frozen:false,armor:50,maxArmor:50,plates:0};

test('Zombie: imminent melee from side beats farther centered target',()=>{
 const g=mock('zm');
 g.zremotes.list=[
 {id:'far',alive:true,pos:{x:0,y:0,z:-29},stance:0,yaw:0,buf:[],data:{}},
 {id:'near',alive:true,pos:{x:3.6,y:0,z:-2.8},stance:0,yaw:0,buf:[],data:{}}
 ];
 const t=acquireCombatTarget(g,options,helpers);
 assert.equal(t?.id,'z:near');assert.equal(t?.hitRegion,'head');
 assert.ok(zombieTargetPriority(5,1)<zombieTargetPriority(28,0));
});
test('Zombie: nearest blocked enemy is not aim-fired through a wall',()=>{
 const g=mock('zm');
 g.zremotes.list=[
 {id:'occluded',alive:true,pos:{x:4,y:0,z:-3},stance:0,yaw:0,data:{}},
 {id:'shootable',alive:true,pos:{x:0,y:0,z:-22},stance:0,yaw:0,data:{}}
 ];
 // A cover box specifically blocking close side contact; distant lane is clear.
 g.map.boxes=[{x0:1.5,x1:3.3,y0:0,y1:3,z0:-3.8,z1:-1.4}];
 const t=acquireCombatTarget(g,options,helpers);
 assert.equal(t?.id,'z:shootable');assert.equal(t?.visible,true);
});
for(const mode of ['tdm','snd','hp','br','zm']){
 test(`${mode}: after a switch to an EMPTY usable weapon, reload on first unlocked tick`,()=>{
  const g=mock(mode,mode==='zm'?['p08','m4a1']:['m4a1','g17'],0);
  state={};g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=0;
  // Explicitly command a switch as the game itself does (0.4s lockout).
  const switched=stepWeapons(g.local.ws,{...inp(),slot:1},1/60,wsCtx);
  assert.equal(switched.switched,true);
  let began=false,done=false;
  for(let i=0;i<270;i++){
   const cmd=manageResources(g,inp(),options,null,helpers,tickCtx(i/60));
   const evt=stepWeapons(g.local.ws,cmd,1/60,wsCtx);
   if(evt.reloadStarted){began=true;assert.ok(g.local.ws.slot===1 || g.local.ws.slot===0);}
   if(evt.reloadDone){done=true;break;}
  }
  assert.equal(began,true,`${mode}: expected real game reloadStarted`);
  assert.equal(done,true,`${mode}: expected real game reloadDone`);
  assert.ok(g.local.ws.guns.some(x=>x.mag>0));
 });
}
test('BR does not replace loaded rifle with empty sidearm to reload it',()=>{
 const g=mock('br');state={};g.local.ws.guns[1].mag=0;
 const cmd=manageResources(g,inp(),options,null,helpers,tickCtx(15));
 assert.notEqual(cmd.slot,1);
});
