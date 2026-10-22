import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {weaponProfile} from '../weapon-tactics.mjs';
import {liveWeaponPolicy,liveCombatScenario,pickupUpgradeValue} from '../weapon-policy.mjs';
import {lootCandidates} from '../loot-core.mjs';
import {ammoClassOf} from './fixtures/game-shared/rarity.js';
import {manageResources,autoFireInput} from '../combat-core.mjs';
const firearms=Object.values(WEAPONS).filter(w=>!w.unarmed&&!w.melee&&!w.skillWeapon&&!w.noLoot);
const opts={mode:'autopilot',enabled:true,weaponTactics:true,autoReload:true,autoSwitch:true,sidearmEmergencyRange:10};
const helpers={eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_o,_d,_b,length)=>length};
function game(main,mode='tdm',slot=0,secondary='g17'){
  const ws={slot,finite:mode!=='tdm',guns:[
    {id:main.id,mag:main.magSize??0,reserve:main.magSize*3},
    {id:secondary,mag:WEAPONS[secondary]?.magSize??0,reserve:40}],
    reloading:false,plateT:0,switchT:0,wind:0,cd:0,prevFire:false};
  const local={alive:true,frozen:false,hp:100,armor:50,ws,mv:{x:0,y:0,z:0,onGround:true,vx:0,vz:0}};
  Object.defineProperty(local,'weapon',{get:()=>WEAPONS[ws.guns[ws.slot].id]});
  return {local,pos:{x:0,y:0,z:0},modeState:{type:mode,ring:{cx:0,cz:0,r:150}},
    map:{boxes:[],bound:180},remotes:{list:[]},zremotes:{list:[]},
    loot:{data:{items:[],crates:[]}},running:true,phase:'match',
    rig:{yaw:0,pitch:0},input:{locked:true,enabled:true},you:{tm:0,ringRate:0}};
}
const target=(d)=>({id:'enemy',point:{x:0,y:1.6,z:-d},visible:true,yaw:0,pitch:0});
const risk=(d)=>({nearest:d,hot:d<45,visible:1,aiming:d<12?1:0,close:d<12?1:0});
const input=()=>({slot:-1,fire:false,aim:false,reload:false,plate:false});
test('missing dynamic policy leaves original weapon profile unchanged',()=>{
 const sniper=WEAPONS.l115a3;
 assert.deepEqual(weaponProfile(sniper,opts),weaponProfile(sniper,{...opts,dynamicWeaponPolicy:null}));
 assert.equal(weaponProfile(sniper,{...opts,dynamicWeaponPolicy:{weaponId:'wrong',desiredDistance:3}}).distance,
  weaponProfile(sniper,opts).distance);
});
test('full firearm catalog produces safe dynamic policy at short/mid/long ranges in every game mode',()=>{
 assert.equal(firearms.length,75);
 for(const weapon of firearms)for(const mode of ['tdm','zm','br'])for(const distance of [5,20,45,130]){
  const g=game(weapon,mode),p=liveWeaponPolicy(g,target(distance),risk(distance),WEAPONS,opts);
  assert.equal(p.weaponId,weapon.id);
  assert.ok(Number.isFinite(p.score)&&p.score>=0&&p.score<=100,`${weapon.id}/${mode} score`);
  assert.ok(Number.isFinite(p.desiredDistance)&&p.desiredDistance>=5,`${weapon.id}/${mode} distance`);
  assert.equal(p.strategicSlot,0);
  const tactical=weaponProfile(weapon,{...opts,dynamicWeaponPolicy:p});
  assert.equal(tactical.distance,p.desiredDistance);
  assert.ok(Number.isFinite(tactical.fire)&&tactical.fire>0);
  if(weapon.cat==='Sniper')assert.ok(p.desiredDistance>=38,`${weapon.id}/${mode} sniper rushed`);
  if(mode==='zm')assert.ok(p.desiredDistance>=22,`${weapon.id} failed zombie spacing`);
 }
});
test('primary reload intent survives any low-scoring match-up and sidearm remains a close emergency',()=>{
 for(const mode of ['tdm','zm','br']){
  const g=game(WEAPONS.l115a3,mode),w=g.local.ws;
  w.guns[0].mag=0;
  const p=liveWeaponPolicy(g,target(80),risk(80),WEAPONS,opts);
  assert.equal(p.action,'reload');
  const args={now:10,catalog:WEAPONS,resourceState:{},memory:{risk:risk(80),lastFire:0,lastDamage:0,lastDanger:0}};
  const o=manageResources(g,input(),opts,target(80),helpers,args);
  assert.equal(o.reload,true,`${mode}: loaded pistol cannot replace a reloadable primary at long range`);
  assert.notEqual(o.slot,1);
  const gClose=game(WEAPONS.l115a3,mode);gClose.local.ws.guns[0].mag=0;
  const close=manageResources(gClose,input(),opts,target(5),helpers,
    {...args,memory:{...args.memory,risk:risk(5)}});
  assert.equal(close.slot,1,`${mode}: close emergency still works`);
 }
});
test('temporary pistol does not turn sniper spacing into pistol chase behavior',()=>{
 for(const mode of ['tdm','zm','br']){
  const g=game(WEAPONS.l115a3,mode,1);
  const p=liveWeaponPolicy(g,target(15),risk(15),WEAPONS,opts);
  if(mode!=='zm'){assert.equal(p.weaponId,'l115a3');assert.equal(p.strategicSlot,0);}
  else assert.equal(p.weaponId,'g17');
  assert.ok(p.desiredDistance>= (mode==='zm'?22:38));
  const current=weaponProfile(g.local.weapon,{...opts,dynamicWeaponPolicy:p});
  assert.equal(current.style,'sidearm'); // input firing uses the actually equipped weapon
  const strategic=weaponProfile(WEAPONS.l115a3,{...opts,dynamicWeaponPolicy:p});
  if(mode!=='zm')assert.equal(strategic.distance,p.desiredDistance);
 }
});
test('safe pickup behavior honors authoritative equipped-slot replacement and utility delta',()=>{
 const g=game(WEAPONS.m4a1,'br');
 g.loot.data.items=[{id:1,kind:0,wid:'g17',x:0,y:0,z:-2,rar:5},
                    {id:2,kind:0,wid:'fn_scar',x:0,y:0,z:-3,rar:4}];
 assert.equal(pickupUpgradeValue(g,WEAPONS.fn_scar,WEAPONS),null,'cannot sacrifice active primary');
 const nearby=lootCandidates(g,{lootRange:50},WEAPONS,ammoClassOf);
 assert.ok(nearby.every(c=>c.swapSlot!==0),
   'a BR upgrade should never drop a strong primary while a weaker backup can be replaced');
 g.local.ws.slot=1;
 const choices=lootCandidates(g,{lootRange:50},WEAPONS,ammoClassOf);
 assert.ok(choices.some(c=>c.entity.id===2),'superior firearm can replace selected sidearm');
 assert.ok(!choices.some(c=>c.entity.id===1),'equal pistol cannot trigger upgrade');
 g.local.ws.guns[1]={id:'fists',mag:0,reserve:0};g.local.ws.slot=0;
 assert.ok(lootCandidates(g,{lootRange:50},WEAPONS,ammoClassOf).length>0,
  'free secondary slot may be filled without sacrificing primary');
});
test('live policy must not gate shots on a heuristic score',()=>{
 const g=game(WEAPONS.l115a3,'br');
 const p=liveWeaponPolicy(g,target(5),risk(5),WEAPONS,opts);
 const command=autoFireInput(g,input(),target(5),helpers,{...opts,dynamicWeaponPolicy:p});
 assert.equal(command.fire,true,'a visible aligned close target remains shootable');
});
test('snapshot partials/absent target never cause live policy exception',()=>{
 const g=game(WEAPONS.m4a1,'tdm');
 for(const threat of [null,undefined,{}, {nearest:Infinity}, {nearest:NaN,visible:null}]){
  const policy=liveWeaponPolicy(g,null,threat,WEAPONS,opts);
  assert.ok(policy===null || Number.isFinite(policy.desiredDistance));
 }
});
