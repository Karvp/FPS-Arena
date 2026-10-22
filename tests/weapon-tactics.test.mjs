import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {weaponProfile,targetDistance,weaponCanEngage} from '../weapon-tactics.mjs';
import {autoFireInput,manageResources,planMovement} from '../combat-core.mjs';

const helpers={eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_a,_b,_boxes,d)=>d};
const target=(d)=>({id:'enemy',point:{x:0,y:1.6,z:-d},yaw:0,pitch:0});
function game(id='m4a1',secondary='makarov',finite=false) {
  const g0={id,mag:WEAPONS[id].magSize,reserve:100};
  const g1={id:secondary,mag:WEAPONS[secondary].magSize,reserve:100};
  const ws=makeGunsState([g0,g1],finite);
  const local={alive:true,down:false,frozen:false,hp:100,armor:50,maxArmor:50,plates:2,
    mv:{x:0,y:0,z:0,lean:0},ws};
  Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
  return {running:true,phase:'match',pos:{x:0,y:0,z:0},map:{bound:68,boxes:[]},
    input:{locked:true,enabled:true},rig:{yaw:0,pitch:0},local};
}
const options={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,autoArmor:false,autoPeek:false,weaponTactics:true};
const playerCtx=(g)=>({alive:true,frozen:false,armor:g.local.armor,plates:g.local.plates,maxArmor:50});
function tick(g,t=null){
  const i=autoFireInput(g,{slot:-1,fire:false,aim:false,reload:false},t,helpers,options);
  const cmd=manageResources(g,i,options,t,helpers);
  const result=stepWeapons(g.local.ws,cmd,1/60,playerCtx(g));
  return {cmd,result};
}
test('game catalog produces distinct profiles for every stocked firearm',()=>{
  const styles=new Set();
  for(const w of Object.values(WEAPONS)){
    const p=weaponProfile(w,options);
    styles.add(p.style);
    assert.ok(p.distance>0 && p.fire>=0 && Number.isFinite(p.exposed),w.id);
    assert.equal(p.semi,!w.auto || !!w.melee || !!w.unarmed,w.id);
    assert.equal(p.shell,!!(w.shellReload>0),w.id);
  }
  assert.ok(styles.size>=8);
});
test('shotgun closes gap; sniper holds distance; SMG flanks; LMG holds angle',()=>{
  const close=target(14);
  const shot=game('benelli_m4');assert.equal(planMovement(shot,close,helpers,options,2)?.reason,'close-gap');
  const sniper=game('l115a3');assert.equal(planMovement(sniper,target(14),helpers,options,2)?.reason,'retreat');
  const smg=game('mp5sd');assert.match(planMovement(smg,target(13),helpers,options,2)?.reason,/strafe/);
  const lmg=game('m249');assert.equal(planMovement(lmg,target(33),helpers,options,2)?.reason,'hold-angle');
});
test('shotgun never shoots 45 m targets but sniper is allowed',()=>{
  const a=game('benelli_m4'),b=game('l115a3'),t=target(45);
  assert.equal(targetDistance(a,t),45);
  assert.equal(weaponCanEngage(a,t,weaponProfile(a.local.weapon)),false);
  assert.equal(autoFireInput(a,{slot:-1},t,helpers,options).fire,false);
  assert.equal(autoFireInput(b,{slot:-1},t,helpers,options).fire,true);
});
test('semi-auto cadence produces multiple actual server-equivalent shots across 90 ticks',()=>{
  const g=game('g17');let fired=0;
  for(let n=0;n<90;n++){const {result}=tick(g,target(7));if(result.fired)fired++;}
  assert.ok(fired>=5,`expected >=5 semi-auto shots, got ${fired}`);
  assert.equal(g.local.ws.guns[0].mag,WEAPONS.g17.magSize-fired);
});
test('sniper semi-auto fires repeatedly, not just first shot',()=>{
  const g=game('l115a3');let fired=0;
  for(let n=0;n<230;n++){const {result}=tick(g,target(65));if(result.fired)fired++;}
  assert.ok(fired>=2,`expected >=2 sniper shots, got ${fired}`);
});
test('combat prevents proactive reload at any weapon distance',()=>{
  const g=game('m4a1');g.local.ws.guns[0].mag=5;
  const {cmd,result}=tick(g,target(38));
  assert.notEqual(cmd.reload,true);assert.equal(result.reloadStarted,false);
  const quiet={now:12,memory:{lastDanger:0,lastDamage:0,lastFire:0,risk:{hot:false,nearest:Infinity}}};
  const planned=manageResources(g,{fire:false,aim:false,slot:-1},options,null,helpers,quiet);
  assert.equal(planned.reload,true);
  const actual=stepWeapons(g.local.ws,planned,1/60,playerCtx(g));
  assert.equal(actual.reloadStarted,true);
});
test('empty magazine explicitly reloads strong primary when sidearm also empty',()=>{
  const g=game('akm','makarov');g.local.ws.guns[0].mag=0;g.local.ws.guns[1].mag=0;
  const {cmd,result}=tick(g,target(5));
  assert.equal(cmd.reload,true);assert.equal(cmd.fire,false);
  assert.equal(result.reloadStarted,true);
  assert.equal(result.switched,false);
});
test('close visible threat swaps to loaded sidearm instead of long reload',()=>{
  const g=game('m249');g.local.ws.guns[0].mag=0;
  const {cmd,result}=tick(g,target(5));
  assert.equal(cmd.slot,1);assert.equal(result.switched,true);
});
test('finite reserves forbid reload when empty; swap instead',()=>{
  const g=game('m4a1','g17',true);g.local.ws.guns[0].mag=0;g.local.ws.guns[0].reserve=0;
  const {cmd,result}=tick(g,target(7));
  assert.equal(cmd.reload,false);assert.equal(cmd.slot,1);assert.equal(result.switched,true);
});
test('reload state suppresses fire and ADS for magazine-fed weapons',()=>{
  const g=game('m4a1');g.local.ws.reloading=true;g.local.ws.reloadT=1.8;
  const {cmd,result}=tick(g,target(6));
  assert.equal(cmd.fire,false);assert.equal(cmd.aim,false);assert.equal(result.fired,false);
});
test('shell-by-shell shotgun reload may interrupt only at close visible threat',()=>{
  const g=game('benelli_m4');g.local.ws.reloading=true;g.local.ws.reloadT=.5;g.local.ws.guns[0].mag=2;
  const {cmd,result}=tick(g,target(5));
  assert.equal(cmd.fire,true);assert.equal(result.fired,true);assert.equal(g.local.ws.reloading,false);
  g.local.ws.reloading=true;g.local.ws.reloadT=.5;g.local.ws.prevFire=false;
  const second=tick(g,target(17));
  assert.equal(second.cmd.fire,false);assert.equal(second.result.fired,false);
});
test('manual reload/switch commands remain authoritative in Assist',()=>{
  const g=game();const assisted={...options,mode:'assist'};
  assert.equal(manageResources(g,{slot:1,reload:false,fire:true},assisted,target(10),helpers).slot,1);
  assert.equal(manageResources(g,{slot:-1,reload:true,fire:true},assisted,target(10),helpers).reload,true);
});
test('weapon-tactics toggle falls back to selected engage distance',()=>{
  const p=weaponProfile(WEAPONS.l115a3,{weaponTactics:false,engageRange:12});
  assert.equal(p.distance,12);
});
test('unarmed and melee never attempt magazine reload',()=>{
  const m=game('knife');const u=game('fists');
  for(const g of [m,u]){
    const s=manageResources(g,{slot:-1,fire:false},options,target(8),helpers);
    assert.notEqual(s.reload,true);
  }
});

test('ADS strategy changes with class, weapon range and optic',()=>{
  const close=target(5),mid=target(16);
  const smg=game('mp5sd');assert.equal(autoFireInput(smg,{slot:-1},close,helpers,options).aim,false);
  assert.equal(autoFireInput(smg,{slot:-1},mid,helpers,options).aim,true);
  const shotgun=game('benelli_m4');assert.equal(autoFireInput(shotgun,{slot:-1},close,helpers,options).aim,false);
  assert.equal(autoFireInput(shotgun,{slot:-1},mid,helpers,options).aim,true);
  const sniper=game('l115a3');assert.equal(autoFireInput(sniper,{slot:-1},target(55),helpers,options).aim,true);
});
test('long reload LMG requests cover instead of pushing objective',()=>{
  const g=game('m249');g.local.ws.reloading=true;g.local.ws.reloadT=3;
  assert.equal(planMovement(g,target(45),helpers,options,2)?.reason,'reload-retreat');
});
test('line-of-sight gating prevents auto fire behind cover',()=>{
  const g=game('m4a1');
  assert.equal(autoFireInput(g,{slot:-1},target(15),{...helpers,rayWorld:()=>1},options).fire,false);
});
