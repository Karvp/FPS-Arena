import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {manageResources,autoFireInput,planProMovement,planBattleRoyalePush} from '../combat-core.mjs';
import {enemyCameraRisk,peekCycle} from '../camera-tactics.mjs';
import {brPickupDecision} from '../weapon-policy.mjs';
import {lootSafe,lootCandidates,planLoot} from '../loot-core.mjs';
import {ammoClassOf} from './fixtures/game-shared/rarity.js';
const opts={enabled:true,mode:'autopilot',weaponTactics:true,autoReload:true,autoSwitch:true,sidearmEmergencyRange:10};
const helpers={eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_a,_b,_c,len)=>len};
function game(mode='tdm',primary='m4a1',secondary='g17'){
 const ws=makeGunsState([{id:primary,mag:WEAPONS[primary].magSize,reserve:90},{id:secondary,mag:WEAPONS[secondary].magSize,reserve:35}],mode!=='tdm');
 const local={alive:true,down:false,frozen:false,hp:100,armor:50,plates:0,maxArmor:50,
  ws,mv:{x:0,y:0,z:0,vx:0,vz:0,onGround:true,slideCd:0,slideT:0,stance:0}};
 Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
 return {local,modeState:{type:mode,ring:{cx:0,cz:0,r:145,phase:'wait',next:100}},map:{bound:180,boxes:[]},
  pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},input:{enabled:true,locked:true},running:true,phase:'match',
  loot:{data:{items:[],crates:[]}},remotes:{list:[]},bremotes:{list:[]},zremotes:{list:[]},you:{tm:0,ringRate:0}};
}
const target=d=>({id:'enemy',point:{x:0,y:1.6,z:-d},visible:true,yaw:0,pitch:0,remote:{data:{w:'m4a1'}}});
const risk=d=>({risk:{hot:d<110,nearest:d,visible:d<110?1:0,close:d<42?1:0,aiming:d<20?1:0},
 lastDanger:10,lastFire:10,lastDamage:10});
const noop={slot:-1,fire:false,aim:false,reload:false,plate:false};
function command(g,d,now=10,state={},base=noop){
 return manageResources(g,base,opts,target(d),helpers,{now,memory:risk(d),catalog:WEAPONS,resourceState:state});
}
function step(g,cmd){return stepWeapons(g.local.ws,cmd,1/60,{alive:true,frozen:false,armor:50,maxArmor:50,plates:0});}
test('reload not started when a partially loaded primary is threatened at 6m',()=>{
 const g=game();g.local.ws.guns[0].mag=3;
 const cmd=command(g,6);assert.notEqual(cmd.reload,true);
 assert.equal(cmd.slot,-1);
});
test('partially loaded shotgun interrupts shell-by-shell reload and fires',()=>{
 const g=game('zm','benelli_m4');const ws=g.local.ws;
 ws.guns[0].mag=2;ws.reloading=true;ws.reloadT=.65;
 const s=autoFireInput(g,noop,target(6),helpers,opts);
 assert.equal(s.fire,true);
 const out=command(g,6,10,{},s);
 const result=step(g,out);
 assert.equal(result.fired,true,'server weapon state confirms the shot');
 assert.equal(ws.reloading,false,'shot cancels shell-by-shell reload');
});
test('magazine reload cancellation uses two authoritative switches and restores primary rounds',()=>{
 const g=game();const ws=g.local.ws,state={};
 ws.guns[0].mag=9;ws.reloading=true;ws.reloadT=2.15;
 let o=command(g,6,10,state);assert.equal(o.slot,1);
 assert.equal(step(g,o).switched,true);assert.equal(ws.reloading,false);
 let returned=false;
 for(let n=1;n<115;n++){
  const now=10+n/60;
  o=command(g,6,now,state);const r=step(g,o);
  if(r.switched && ws.slot===0)returned=true;
 }
 assert.equal(returned,true);
 assert.equal(ws.slot,0);
 assert.equal(ws.guns[0].mag,9,'rounds retained by cancel, rather than losing ammo');
 assert.equal(ws.reloading,false);
 assert.equal(state.interruptReload,false);
 assert.notEqual(o.reload,true,'does not immediately restart reloading');
});
test('finish a nearly completed reload rather than spending .8s on two switches',()=>{
 const g=game();const ws=g.local.ws;
 ws.guns[0].mag=8;ws.reloading=true;ws.reloadT=.12;
 const out=command(g,5,10,{});
 assert.notEqual(out.slot,1);
 assert.equal(out.fire,false);
});
test('empty primary still reloads at range; emergency sidearm remains at melee distance',()=>{
 const far=game(),close=game();far.local.ws.guns[0].mag=0;close.local.ws.guns[0].mag=0;
 assert.equal(command(far,68).reload,true);
 assert.equal(command(close,6).slot,1);
});
test('peek history is not forced left-right and long delay not tied to every fourth cycle',()=>{
 const mem={phase:'retreat',until:0,seed:222,cycle:0};
 const sides=[{sign:-1,point:{x:-2,z:0},risk:.3},{sign:1,point:{x:2,z:0},risk:.4}];
 const signs=[],holds=[];let now=0;
 for(let i=0;i<150;i++){
  const event=peekCycle(mem,now,sides,{longDelay:true});
  if(event.phase==='expose')signs.push(event.selected.sign);
  if(event.phase==='hidden')holds.push(event.until-now);
  now=event.until+.001;
 }
 assert.ok(signs.some((x,i)=>i>0&&x===signs[i-1]));
 assert.ok(signs.some((x,i)=>i>0&&x!==signs[i-1]));
 assert.ok(holds.some(x=>x>4));
 assert.ok(holds.some(x=>x<1));
});
test('gun-specific 3D camera exposure treats a shotgun as higher point-blank risk',()=>{
 const shot={x:0,y:0,z:13,yaw:0,pitch:0,aim:true,pressure:1,weaponCategory:'Shotgun'};
 const sniper={...shot,weaponCategory:'Sniper'};
 const near={x:0,y:0,z:0};
 assert.ok(enemyCameraRisk(shot,near) > enemyCameraRisk(sniper,near));
 const far={...shot,z:100};
 assert.ok(enemyCameraRisk({...far,weaponCategory:'Sniper'},near)>enemyCameraRisk({...far,weaponCategory:'Shotgun'},near));
});
test('pro tactics counter shotgun range and sniper firing lane, BR does not charge visible sniper',()=>{
 const g=game('br');
 const shotgun=planProMovement(g,target(9),helpers,{...opts,enemyWeapon:WEAPONS.benelli_m4},10,{});
 assert.match(shotgun.reason,/counter-shotgun/);
 const sniper=planProMovement(g,target(60),helpers,{...opts,enemyWeapon:WEAPONS.l115a3},10,{});
 assert.match(sniper.reason,/counter-sniper/);
 assert.equal(planBattleRoyalePush(g,target(60),helpers,{...opts,enemyWeapon:WEAPONS.l115a3},10),null);
});
test('BR can loot at an opportunity but denies close scoped threat or gas',()=>{
 const g=game('br');g.loot.data.crates=[{id:1,x:1,y:0,z:-9,rar:3,open:false}];
 assert.equal(lootSafe(g,{hot:true,nearest:82,visible:1,aiming:1},opts,WEAPONS),true);
 assert.equal(lootSafe(g,{hot:true,nearest:18,visible:1,aiming:1},opts,WEAPONS),false);
 g.you.ringRate=5;
 assert.equal(lootSafe(g,{hot:false,nearest:Infinity},opts,WEAPONS),false);
});
test('BR evaluates both occupied slots and requests replacing only the weaker backup',()=>{
 const g=game('br','m4a1','g17');
 const swap=brPickupDecision(g,WEAPONS.fn_scar,WEAPONS);
 if(swap)assert.equal(swap.slot,1);
 const guns=[WEAPONS.fn_scar,WEAPONS.l115a3,WEAPONS.m249];
 let observed=false;
 for(const w of guns){const plan=brPickupDecision(g,w,WEAPONS);if(plan){observed=true;assert.equal(plan.slot,1);}}
 assert.ok(observed,'at least one upgrade should be considered');
});

test('BR actual loot planner stages weak secondary slot before rifle pickup',()=>{
 const g=game('br','m4a1','g17');
 g.loot.data.items=[{id:66,kind:0,wid:'fn_scar',x:4,y:0,z:-3,rar:4}];
 const plan=planLoot(g,{hot:false,nearest:Infinity,visible:0},{...opts,autoLoot:true},helpers,WEAPONS,ammoClassOf,{},10);
 assert.equal(plan?.targetId,'item:66');
 assert.equal(plan?.prepareSlot,1,'must not discard strong primary');
});
test('visible distant ADS sniper denies BR loot opportunity',()=>{
 const g=game('br');g.remotes.list=[{id:'s',alive:true,pos:{x:0,y:0,z:-78},team:1,data:{aim:true,w:'l115a3'}}];
 assert.equal(lootSafe(g,{hot:true,nearest:78,visible:1,aiming:1},opts,WEAPONS),false);
});
