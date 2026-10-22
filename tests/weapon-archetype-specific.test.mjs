import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {weaponProfile} from '../weapon-tactics.mjs';
import {autoFireInput,planMovement} from '../combat-core.mjs';
const firearms=Object.values(WEAPONS).filter(w=>!w.unarmed&&!w.melee&&!w.skillWeapon&&!w.noLoot);
const opts={mode:'autopilot',enabled:true,weaponTactics:true,autoArmor:false,autoReload:true};
const helpers={eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_a,_b,_boxes,d)=>d};
const ctx={alive:true,frozen:false,hp:100,armor:50,maxArmor:50,plates:0};
function makeGame(w){
  const ws=makeGunsState([{id:w.id,mag:w.magSize,reserve:500},{id:'makarov',mag:8,reserve:50}],false);
  const local={alive:true,frozen:false,hp:100,armor:50,maxArmor:50,plates:0,ws,
    mv:{x:0,y:0,z:0,onGround:true,vx:0,vz:0}};
  Object.defineProperty(local,'weapon',{get(){return WEAPONS[ws.guns[ws.slot].id];}});
  return {local,running:true,phase:'match',rig:{yaw:0,pitch:0},ads:{e:1},
    pos:{x:0,y:0,z:0},input:{locked:true,enabled:true},map:{bound:350,boxes:[]}};
}
const t=d=>({id:'test',point:{x:0,y:1.6,z:-d},yaw:0,pitch:0});
for(const w of firearms){
  test(`individual ${w.cat}/${w.id}: handling, ADS, firing cadence and authoritative rounds`,()=>{
    const g=makeGame(w),p=weaponProfile(w,opts);
    const engagement=Math.max(2,Math.min(p.fire*.65, w.cat==='Sniper'?65:
      w.cat==='Marksman'?45:w.cat==='Shotgun'?6:w.cat==='Pistol'?6:w.cat==='SMG'?10:20));
    let shots=0;const startMag=g.local.ws.guns[0].mag;
    for(let i=0;i<240;i++){
      const command=autoFireInput(g,{slot:-1,fire:false,aim:false,reload:false},t(engagement),helpers,opts);
      assert.equal(command.slot,-1);
      const event=stepWeapons(g.local.ws,command,1/60,ctx);
      if(event.fired)shots++;
    }
    assert.ok(shots>=1,`${w.id} failed to fire at ${engagement.toFixed(1)}m`);
    if(w.infinite)assert.equal(g.local.ws.guns[0].mag,startMag,`${w.id} used infinite ammo`);
    else assert.equal(g.local.ws.guns[0].mag,startMag-shots,`${w.id} round counting mismatch`);
    const nearPlan=planMovement(makeGame(w),t(6),helpers,opts,5);
    if(w.cat==='Sniper')assert.equal(nearPlan?.reason,'retreat',`${w.id} should preserve standoff`);
    if(w.cat==='Shotgun')assert.equal(p.style,'rush');
    if(w.cat==='SMG')assert.equal(p.style,'flank');
    if(w.cat==='LMG')assert.equal(p.style,'suppress');
    if(w.cat==='Marksman')assert.equal(p.style,'marksman');
    if(w.cat==='Pistol')assert.equal(p.style,'sidearm');
    if(w.burst>0)assert.ok(shots>=Math.min(w.burst,w.magSize),`${w.id} burst stalled`);
  });
}
