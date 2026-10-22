import test from 'node:test';
import assert from 'node:assert/strict';
import {macroCombatPhase,macroCombatArbitrate} from '../macro-combat-v2.mjs';
import {WEAPONS} from '../lab/arena/source/shared/weapons.js';
import {normaliseOptions} from '../aim-core.mjs';
const game=(weapon='benelli_m4',d=60)=>({local:{alive:true,hp:100,armor:100,mv:{x:0,y:0,z:0},weapon:WEAPONS[weapon],ws:{guns:[{id:weapon,mag:5}],slot:0,reloading:false,plateT:0}}});
const target=(d=60)=>({id:'enemy1',visible:true,point:{x:d,y:1.5,z:0}});
const toward={x:1,z:0,reason:'pro-rotate'};
const retreat={x:-1,z:0,reason:'camera-peek-hide'};
const policy={canStep:()=>true,exposureAllowed:()=>true};
test('shotgun approach while out of range; engage at close range with hysteresis',()=>{
  const m={},g=game(),a=macroCombatPhase(g,target(60),g.local.weapon,10,m);
  assert.equal(a.phase,'approach');
  assert.equal(macroCombatArbitrate(g,target(60),a,toward,retreat,policy).reason,'macro-range-approach');
  const near=macroCombatPhase(g,target(10),g.local.weapon,10.1,m);
  assert.equal(near.phase,'engage');
  assert.equal(macroCombatArbitrate(g,target(10),near,toward,retreat,policy),retreat);
});
test('macro never overrides objectives, reload, ring, explosion, evade or low health',()=>{
  const g=game(),t=target(),p=macroCombatPhase(g,t,g.local.weapon,10,{});
  for(const k of ['emergency','ring','loot','objective','recovery','dodge'])
    assert.equal(macroCombatArbitrate(g,t,p,toward,retreat,{...policy,[k]:true}),retreat,k);
  g.local.hp=50;
  assert.equal(macroCombatArbitrate(g,t,p,toward,retreat,policy),retreat);
  g.local.hp=100;g.local.ws.plateT=2;
  assert.equal(macroCombatArbitrate(g,t,p,toward,retreat,policy),retreat);
  assert.equal(macroCombatPhase(g,t,g.local.weapon,10,{}).phase,'recover');
});
test('macro refuses collision, firing-lane exposure and non-progressing headings',()=>{
  const g=game(),t=target(),phase=macroCombatPhase(g,t,g.local.weapon,10,{});
  assert.equal(macroCombatArbitrate(g,t,phase,toward,retreat,{...policy,canStep:()=>false}),retreat);
  assert.equal(macroCombatArbitrate(g,t,phase,toward,retreat,{...policy,exposureAllowed:()=>false}),retreat);
  assert.equal(macroCombatArbitrate(g,t,phase,{x:0,z:1,reason:'pro-rotate'},retreat,policy),retreat);
  assert.equal(macroCombatArbitrate(g,t,phase,{...toward,reason:'br-ring-path'},retreat,policy),retreat);
});
test('only resolves actual cover conflict, not ordinary engagement strafes',()=>{
  const g=game(),t=target(),p=macroCombatPhase(g,t,g.local.weapon,10,{});
  const strafe={x:0,z:1,reason:'pro-combat-strafe'};
  assert.equal(macroCombatArbitrate(g,t,p,toward,strafe,policy),strafe);
});
test('SMG remains reactive within its effective 60m mobility corridor',()=>{
  const g=game('mp5sd'),t=target(45),p=macroCombatPhase(g,t,g.local.weapon,10,{});
  assert.equal(macroCombatArbitrate(g,t,p,toward,retreat,policy),retreat);
  const farther=target(70),phase=macroCombatPhase(g,farther,g.local.weapon,10.2,{});
  assert.equal(macroCombatArbitrate(g,farther,phase,toward,retreat,policy).reason,'macro-range-approach');
});
test('watchdog prevents endless oscillating advance with no distance improvement',()=>{
  const g=game(),t=target(),m={};
  macroCombatPhase(g,t,g.local.weapon,0,m);
  assert.equal(macroCombatPhase(g,t,g.local.weapon,1.5,m).suspended,true);
  assert.equal(macroCombatArbitrate(g,t,{phase:'approach',suspended:true,engageAt:11,distance:60},toward,retreat,policy),retreat);
});
test('new opponent resets the macro; non-close weapons do not change movement',()=>{
  const g=game(),m={};macroCombatPhase(g,target(),g.local.weapon,10,m);
  assert.equal(macroCombatPhase(g,{...target(),id:'enemy2'},g.local.weapon,11,m).targetId,'enemy2');
  const rifle=game('m4a1');assert.equal(macroCombatPhase(rifle,target(),rifle.local.weapon,10,{}).phase,'idle');
});
test('bundle includes the actual macro implementation and popup config defaults to off',async()=>{
  const {readFileSync}=await import('node:fs');
  const root=new URL('../',import.meta.url);
  const bundle=readFileSync(new URL('page-agent.js',root),'utf8');
  assert.ok(bundle.includes('function macroCombatArbitrate('));
  assert.ok(bundle.includes('macroCombatArbitrate(game,currentTarget'));
  assert.equal(normaliseOptions({}).macroCombat2,false);
  assert.equal(normaliseOptions({macroCombat2:true}).macroCombat2,true);
  assert.ok(readFileSync(new URL('popup.html',root),'utf8').includes('id="macroCombat2"'));
});
