import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS} from './fixtures/game-shared/weapons.js';
import {makeGunsState,stepWeapons} from './fixtures/game-shared/weaponstate.js';
import {weaponProfile,weaponCanEngage} from '../weapon-tactics.mjs';
import {evaluateWeapon,rankWeapons,WEAPON_SCENARIOS} from '../weapon-evaluation.mjs';
import {manageResources,autoFireInput} from '../combat-core.mjs';

const guns=Object.values(WEAPONS).filter(w=>!w.unarmed&&!w.melee&&!w.skillWeapon&&!w.noLoot);
const helpers={eyeHeightOf:()=>1.6,leanOffset:.35,rayWorld:(_o,_v,_b,d)=>d};
const settings={enabled:true,mode:'autopilot',autoReload:true,autoSwitch:true,autoArmor:false,
  weaponTactics:true,sidearmEmergencyRange:10,proactiveSecondaryReload:false};
const target=(d)=>({id:'enemy',point:{x:0,y:1.6,z:-d},yaw:0,pitch:0,visible:true});
const input=()=>({slot:-1,fire:false,aim:false,reload:false,plate:false});
const context=(mode,dist,now=8)=>({now,catalog:WEAPONS,resourceState:{},memory:{
  risk:{hot:Number.isFinite(dist),nearest:dist,visible:Number.isFinite(dist)?1:0,
    close:dist<42?1:0,aiming:0},lastFire:now,lastDamage:now,lastDanger:now}});
function game(w,mode='tdm') {
  const finite=mode!=='tdm',other=w.id==='g17'?'makarov':'g17';
  const ws=makeGunsState([{id:w.id,mag:w.magSize,reserve:2*w.magSize},
    {id:other,mag:WEAPONS[other].magSize,reserve:40}],finite);
  const local={alive:true,down:false,frozen:false,hp:100,armor:50,plates:0,maxArmor:50,
    ws,mv:{x:0,y:0,z:0,vx:0,vz:0,onGround:true}};
  Object.defineProperty(local,'weapon',{get:()=>WEAPONS[ws.guns[ws.slot].id]});
  return {running:true,phase:'match',modeState:{type:mode},input:{locked:true,enabled:true},
    map:{bound:300,boxes:[]},pos:{x:0,y:0,z:0},rig:{yaw:0,pitch:0},local,
    zremotes:{list:[]},remotes:{list:[]},bremotes:{list:[]}};
}
function decide(g,d){const ctx=context(g.modeState.type,d);return manageResources(g,input(),settings,target(d),helpers,ctx);}
const serverCtx={alive:true,frozen:false,armor:50,maxArmor:50,plates:0};

test('catalog coverage is exhaustive and excludes only protected/special entries',()=>{
  assert.equal(Object.keys(WEAPONS).length,79);
  assert.equal(guns.length,75);
  for(const w of Object.values(WEAPONS))
    assert.equal(guns.includes(w),!w.unarmed&&!w.melee&&!w.skillWeapon&&!w.noLoot,w.id);
});
test('scenario catalog contains every supported game mode and every requested priority axis',()=>{
  assert.equal(WEAPON_SCENARIOS.length,32);
  assert.deepEqual(new Set(WEAPON_SCENARIOS.map(x=>x.mode)),new Set(['tdm','zm','br']));
  assert.ok(WEAPON_SCENARIOS.some(x=>x.magazine===0&&x.reserve===0));
  assert.ok(WEAPON_SCENARIOS.some(x=>x.magazine===0&&x.reserve>0));
  assert.ok(WEAPON_SCENARIOS.some(x=>x.ringUrgent));
  assert.ok(WEAPON_SCENARIOS.some(x=>x.enemies>=8));
  assert.ok(WEAPON_SCENARIOS.some(x=>x.visible===false));
});
for(const w of guns){
  test(`weapon ${w.id}: full scenario matrix and real combat/loadout decisions`,()=>{
    const seen=new Set();
    for(const scenario of WEAPON_SCENARIOS){
      const result=evaluateWeapon(w,scenario);
      assert.equal(result.weaponId,w.id);
      assert.equal(result.scenarioId,scenario.id);
      assert.equal(result.eligible,true);
      assert.ok(Number.isFinite(result.score)&&result.score>=0&&result.score<=100,
        `${w.id}/${scenario.id} score=${result.score}`);
      if(scenario.magazine===0&&!w.infinite){
        assert.equal(result.score,0);
        assert.equal(result.action,scenario.reserve===0?'resupply':'reload');
      }
      if(scenario.visible===false)assert.equal(result.action,'seek-sightline');
      if(scenario.distance>w.maxRange&&scenario.magazine!==0)assert.equal(result.action,'reposition');
      seen.add(scenario.id);
    }
    assert.equal(seen.size,32);
    const prof=weaponProfile(w,settings);
    assert.ok(prof.fire>0&&prof.distance>0,`${w.id}: profile must be finite and positive`);
    for(const mode of ['tdm','zm','br']) {
      // A loaded primary must never be downgraded to the sidearm, even at 3m.
      for(const dist of [3,11,35,100]) {
        const g=game(w,mode);const out=decide(g,dist);
        assert.notEqual(out.slot,1,`${w.id}/${mode}/${dist}m: primary unexpectedly swapped`);
        assert.notEqual(out.plate,true,`${w.id}/${mode}/${dist}m: unexpected armor`);
      }
      // Empty primary: reload instead of changing to pistol at any non-close distance.
      for(const dist of [15,45,100]){
        const g=game(w,mode);g.local.ws.guns[0].mag=0;
        const out=decide(g,dist);
        assert.notEqual(out.slot,1,`${w.id}/${mode}/${dist}m: sidearm used at range`);
        if(!w.infinite){
          assert.equal(out.reload,true,`${w.id}/${mode}/${dist}m: reload not commanded`);
          assert.equal(out.fire,false);
          assert.equal(stepWeapons(g.local.ws,out,1/60,serverCtx).reloadStarted,true,
            `${w.id}/${mode}/${dist}m: game did not begin reload`);
        }
      }
      // Emergency backup is allowed only with close threat and empty main.
      const close=game(w,mode);close.local.ws.guns[0].mag=0;
      const backup=decide(close,6);
      if(!w.infinite){
        assert.equal(backup.slot,1,`${w.id}/${mode}: close empty primary did not swap to sidearm`);
        assert.equal(stepWeapons(close.local.ws,backup,1/60,serverCtx).switched,true);
      }
      const recovered=game(w,mode);recovered.local.ws.slot=1;
      const resume=decide(recovered,6);
      assert.equal(resume.slot,0,`${w.id}/${mode}: loaded primary not restored`);
      const noAmmo=game(w,mode);noAmmo.local.ws.guns[0].mag=0;noAmmo.local.ws.guns[0].reserve=0;
      const empty=decide(noAmmo,45);
      if(mode!=='tdm')assert.notEqual(empty.reload,true,`${w.id}/${mode}: impossible reload`);
      assert.notEqual(empty.slot,1,`${w.id}/${mode}: shouldn't engage at range with pistol`);
      // Even if an opponent is detected behind a wall, do not fire through it.
      const sight=game(w,mode);
      const occluded=autoFireInput(sight,input(),target(5),{...helpers,rayWorld:()=>0},settings);
      assert.equal(occluded.fire,false,`${w.id}/${mode}: ignored opaque cover`);
      const beyond=game(w,mode);
      assert.equal(weaponCanEngage(beyond,target(prof.fire+1),prof),false);
    }
  });
}
test('ranking uses full catalog, respects no-ammo/occlusion and excludes skill weapons',()=>{
  for(const s of WEAPON_SCENARIOS){
    const ranked=rankWeapons(WEAPONS,s,{limit:75});
    assert.equal(ranked.length,75,s.id);
    for(let i=1;i<ranked.length;i++)assert.ok(ranked[i-1].score>=ranked[i].score,s.id);
    assert.ok(ranked.every(r=>!['annihilator','m134','fists','knife'].includes(r.weaponId)));
  }
});
test('shotgun close-range preference falls with distance; sniper is inefficient point-blank',()=>{
 const shotgun=WEAPONS.benelli_m4,sniper=WEAPONS.l115a3;
 assert.ok(evaluateWeapon(shotgun,WEAPON_SCENARIOS[0]).score>
           evaluateWeapon(shotgun,WEAPON_SCENARIOS.find(s=>s.id==='classic_long_90m')).score);
 assert.ok(evaluateWeapon(sniper,WEAPON_SCENARIOS.find(s=>s.id==='classic_long_90m')).score>
           evaluateWeapon(sniper,WEAPON_SCENARIOS[0]).score);
});
