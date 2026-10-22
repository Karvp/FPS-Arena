import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS,damageAt} from '../lab/arena/source/shared/weapons.js';
import {gunShotEnvelope,gunDuelPlan,gunThreatScale} from '../weapon-duel.mjs';
import {visibleFireThreats} from '../evasion-core.mjs';
import {projectedExposure} from '../tactical-nav.mjs';
import {acquireCombatTarget} from '../aim-core.mjs';
import {autoFireInput} from '../combat-core.mjs';
const arsenal=Object.values(WEAPONS).filter(w=>!w.unarmed&&!w.skillWeapon&&!w.melee&&!w.noLoot);
test('all 75 published firearm stats yield bounded decisions against eight opponent archetypes',()=>{
 assert.equal(arsenal.length,75);
 const representatives=['m4a1','mpx','l115a3','svt40','m249','benelli_m4','makarov','laser_rifle'];
 for(const own of arsenal)for(const name of representatives)for(const d of [5,12,25,45,70,100,150,200,275,375]){
   const p=gunDuelPlan(own,WEAPONS[name],d,{ownArmor:50});
   assert.ok(p && Number.isFinite(p.score) && Number.isFinite(p.desiredDistance),`${own.id}/${name}/${d}`);
   assert.ok(['approach','approach-covered','extend','hold','cover'].includes(p.action));
 }
});
test('weapon model uses actual server maxRange and exact falloff endpoints',()=>{
 for(const w of arsenal){
  const a=gunShotEnvelope(w,w.maxRange),b=gunShotEnvelope(w,w.maxRange+0.1);
  assert.equal(a.usable,true,w.id);assert.equal(b.usable,false,w.id);
  assert.equal(damageAt(w,w.range[0]),w.dmg[0]);assert.equal(damageAt(w,w.range[1]),w.dmg[1]);
 }
 assert.equal(WEAPONS.l115a3.maxRange,400);
 assert.equal(WEAPONS.svt40.maxRange,300);
 assert.equal(WEAPONS.m4a1.maxRange,200);
 assert.equal(WEAPONS.benelli_m4.maxRange,32);
});
test('sniper 220m away is a tracked aimed threat despite 65m local-dodge radius',()=>{
 const map={boxes:[],bound:300},local={x:0,y:0,z:-220};
 const sniper={id:'e',x:0,y:0,z:0,yaw:0,pitch:0,aim:true,
   maxRange:400,weaponStats:WEAPONS.l115a3};
 const shotgun={...sniper,maxRange:32,weaponStats:WEAPONS.benelli_m4};
 assert.equal(visibleFireThreats(map,local,[sniper],0,65).length,1);
 assert.equal(visibleFireThreats(map,local,[shotgun],0,65).length,0);
 const sniperExposure=projectedExposure(map,local,[sniper],[],0).risk;
 const shotgunExposure=projectedExposure(map,local,[shotgun],[],0).risk;
 assert.ok(sniperExposure>shotgunExposure,`${sniperExposure} vs ${shotgunExposure}`);
});
test('actual hitscan reach can fire beyond preferred engagement distance',()=>{
 const w=WEAPONS.m4a1;
 const g={running:true,phase:'match',pos:{x:0,y:0,z:0},map:{boxes:[],bound:250},rig:{yaw:0,pitch:0},
   local:{alive:true,mv:{x:0,y:0,z:0},weapon:w,ws:{slot:0,guns:[{id:'m4a1',mag:30}],reloading:false,prevFire:false}},
   input:{enabled:true,locked:true}};
 const t={id:'target',point:{x:0,y:1,z:-175},visible:true,hitboxVisible:true,yaw:0,pitch:0};
 const helper={rayWorld:(_o,_d,_boxes,limit)=>limit,eyeHeightOf:()=>1.6};
 assert.equal(autoFireInput(g,{slot:-1,fire:false},t,helper,{}).fire,true);
 assert.equal(autoFireInput(g,{slot:-1,fire:false},{...t,point:{...t.point,z:-201}},helper,{}).fire,false);
});
test('personal weapon reach respects sniper vs SMG and distant geometry',()=>{
 const own=gunDuelPlan(WEAPONS.mp5sd,WEAPONS.l115a3,180);
 assert.equal(own.outranged,true);
 assert.equal(own.action,'approach-covered');
 const reversed=gunDuelPlan(WEAPONS.l115a3,WEAPONS.mp5sd,180);
 assert.equal(reversed.outranged,false);
 assert.ok(gunThreatScale(WEAPONS.l115a3,180)>gunThreatScale(WEAPONS.benelli_m4,180));
});
