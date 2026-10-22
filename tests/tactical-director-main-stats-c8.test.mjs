import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEAPONS} from '../lab/arena/source-main/shared/weapons.js';
import {gunStats} from '../lab/arena/source-main/shared/attachments.js';
import {makeWeaponState,curWeapon} from '../lab/arena/source-main/shared/weaponstate.js';
import {tacticalWeaponBand,tacticalCandidates,tacticalIntent,tacticalDirectorDecision} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';

const local=(weapon)=>({alive:true,mv:{x:0,y:0,z:0},hp:100,armor:80,weapon,ws:{reloading:false,plateT:0}});
const target=(distance)=>({id:'target',point:{x:distance,y:0,z:0},visible:false});
const routePolicy={effectiveWeaponBand:true,engagementWindow:true,opportunityExpansion:true,
  maxRoutes:3,maxProbes:28,route:(_start,end)=>[end],canStep:()=>true,
  walkable:()=>true,shotClear:()=>true,riskAt:()=>0};

test('disabled by default; original category proxy remains byte-for-byte behavior',()=>{
  for(const [cat,ideal] of [['Marksman',28],['Shotgun',10.5],['SMG',18],['Sniper',55],['DMR',42]])
    assert.equal(tacticalWeaponBand({cat}).ideal,ideal);
  assert.equal(normaliseOptions({}).tacticalDirectorMainWeaponStatsLab,false);
  assert.equal(normaliseOptions({tacticalDirectorMainWeaponStatsLab:true}).tacticalDirectorMainWeaponStatsLab,true);
  const entry=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
  assert.match(entry,/effectiveWeaponBand:options\.tacticalDirectorMainWeaponStatsLab===true &&\s+globalThis\.__FPSARENA_HEADLESS_LAB__===true/);
  const original=readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(original,/director-main-stats-/);
});

test('all uploaded-main playable weapons receive finite and physically bounded band',()=>{
  const all=Object.values(WEAPONS).filter(w=>!w.unarmed&&!w.skillWeapon);
  assert.ok(all.length>=35);
  for(const w of all){
    const b=tacticalWeaponBand(w,true);
    assert.equal(b.source,'effective',w.id);
    assert.ok(b.min>=0&&b.ideal>=b.min&&b.max>=b.ideal,w.id);
    assert.ok(b.max<=w.maxRange+1e-8&&b.physicalMax===w.maxRange,w.id);
    assert.ok(Number.isFinite(b.speed)&&b.speed>0,w.id);
  }
});

test('effective weapon state accounts for compatible suppressor and increased ADS timing from grips',()=>{
  const ws=makeWeaponState('m4a1','makarov','suppressor|vgrip','');
  const eff=curWeapon(ws),base=WEAPONS.m4a1;
  assert.deepEqual(eff.range,base.range.map(v=>v*.88));
  const band=tacticalWeaponBand(eff,true),plain=tacticalWeaponBand(base,true);
  assert.ok(band.ideal<plain.ideal&&band.max<plain.max);
  assert.equal(band.physicalMax,plain.physicalMax);
  assert.equal(eff.adsTime>base.adsTime,true);
  assert.equal(tacticalWeaponBand(eff).ideal,tacticalWeaponBand(base).ideal);
});

test('zero-spread sniper can have a useful engagement band well beyond damage falloff',()=>{
 const w=WEAPONS.l115a3;
 assert.equal(w.spreadAds,0);
 const b=tacticalWeaponBand(w,true);
 assert.ok(b.max>120,'damage falloff ends at 45m but physical hit can reach 400m');
 assert.ok(b.ideal>tacticalWeaponBand(w,false).ideal);
 assert.ok(b.max<=w.maxRange);
});

test('custom near/far falloff and movement speed change tactical estimates without class-only assumptions',()=>{
  const smg=WEAPONS.mp5sd;
  const narrow=tacticalWeaponBand({...smg,range:[7,19],move:.8},true);
  const wide=tacticalWeaponBand({...smg,range:[17,47],move:1.1},true);
  assert.ok(wide.max>narrow.max);
  assert.ok(wide.ideal>narrow.ideal);
  assert.ok(wide.speed>narrow.speed);
});

test('visible long-range physical shot is protected even beyond the useful engagement band',()=>{
  const game={local:local(WEAPONS.m4a1)};
  const t={...target(130),visible:true};
  const old=tacticalIntent(game,t,{reason:'pathfinding'},{effectiveWeaponBand:false});
  const next=tacticalIntent(game,t,{reason:'pathfinding'},{effectiveWeaponBand:true});
  assert.equal(old.protected,false);
  assert.equal(next.protected,true);
  assert.equal(next.why,'shootable-range');
  const baseline={x:1,z:0,reason:'pathfinding'};
  const out=tacticalDirectorDecision(game,t,baseline,3,{},
    {...routePolicy,active:true,shotClear:()=>true});
  assert.strictEqual(out,baseline);
});

test('effective main SMG engagement endpoints shift with range while keeping route budgets',()=>{
  const g={local:local(WEAPONS.mp5sd)};
  const seen=[];
  let routeCount=0;
  const p={...routePolicy,maxRoutes:2,
    route:(start,end)=>{routeCount++;seen.push(end);return[end]}};
  const options=tacticalCandidates(g,target(48),p);
  assert.ok(options.length);
  assert.ok(routeCount<=2);
  const b=tacticalWeaponBand(g.local.weapon,true);
  assert.ok(Math.abs(Math.hypot(seen[0].x-48,seen[0].z)-b.ideal)<1e-6);
  assert.ok(options.every(x=>x.waypoints.every(w=>Number.isFinite(w.x)&&Number.isFinite(w.z))));
});

test('malformed untrusted weapon fields fall back without throwing or deriving NaN bounds',()=>{
 const bad=[{cat:'SMG',range:[NaN,100],dmg:[30,10],maxRange:120},
  {cat:'SMG',range:[8,80],dmg:[30,10],maxRange:Infinity},
  {cat:'SMG',range:[20,10],dmg:[30,10],maxRange:120},
  {cat:'SMG',range:[8,80],dmg:[-5,10],maxRange:120},
  {cat:'SMG',range:'8,80',dmg:[30,10],maxRange:120}];
 for(const w of bad)assert.deepEqual(tacticalWeaponBand(w,true),tacticalWeaponBand(w,false));
});

test('main simulator explicitly exposes two new research profiles; pinned simulator unchanged',()=>{
  const main=readFileSync(new URL('../lab/arena/train-main.mjs',import.meta.url),'utf8');
  assert.match(main,/director-main-stats-shadow-lab/);
  assert.match(main,/director-main-stats-recovery-lab/);
  assert.match(main,/tacticalDirectorMainWeaponStatsLab:true/);
});
