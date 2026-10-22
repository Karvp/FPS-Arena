import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {WEAPONS,damageAt,spreadFor} from '../lab/arena/source-main/shared/weapons.js';
import {gunStats} from '../lab/arena/source-main/shared/attachments.js';
import {mulberry32,hashSeq,spreadDir,rayAABB,raySphere} from '../lab/arena/source-main/shared/geometry.js';
import {PLAYER} from '../lab/arena/source-main/shared/constants.js';
import {estimateEngagementBallistics as estimate,validBallisticWeapon} from '../engagement-ballistics.mjs';
import {tacticalCandidates,tacticalDirectorDecision} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const curDir=(distance,stance=0)=>{const y=PLAYER.bodyH[stance]*.60;
 const d=[0,y-1.6,-distance];const n=Math.hypot(...d);return d.map(v=>v/n);};
const official=(w,distance,{aim=true,onGround=true,stance=0,shots=1536}={})=>{
 const eye=[0,1.6,0],dir=curDir(distance,stance),spread=spreadFor(w,aim,onGround);
 const bh=PLAYER.bodyH[stance],hw=stance===2?.55:PLAYER.bodyHalf,hy=PLAYER.headYs[stance];
 let hits=0,heads=0,total=0;
 for(let seq=1;seq<=shots;seq++)for(let j=0;j<w.pellets;j++){
   const d=spreadDir(dir,0,spread,mulberry32(hashSeq(seq,j)));
   const body=rayAABB(eye,d,-hw,0,-distance-hw,hw,bh,-distance+hw,w.maxRange);
   const head=raySphere(eye,d,0,hy,-distance,PLAYER.headRadius,w.maxRange);
   const isHead=head<Infinity&&head<=body+.2;
   const t=isHead?head:body;
   if(t<Infinity){hits++;if(isHead)heads++;total+=damageAt(w,t)*(isHead?w.headMul:1);}
 }
 return {hit:hits/(shots*w.pellets),head:heads/(shots*w.pellets),damage:total/shots};
};
const eps=(a,b,tol,label)=>assert.ok(Math.abs(a-b)<=tol,`${label}: ${a} vs ${b}, tolerance ${tol}`);
test('main live catalog: every hitscan loadout has finite bounded static envelope',()=>{
 let eligible=0;
 for(const w of Object.values(WEAPONS)){
  if(w.unarmed||w.skillWeapon||w.melee||w.laser)continue;
  assert.ok(validBallisticWeapon(w),`unexpected unsupported hitscan weapon ${w.id}`);
  eligible++;
  for(const d of [3,18,60,180,420]){
   const x=estimate(w,d);
   assert.ok(Number.isFinite(x.expectedDamagePerTrigger));
   assert.ok(x.pelletHitFraction>=0&&x.pelletHitFraction<=1);
   assert.ok(x.pelletHeadFraction<=x.pelletHitFraction);
   assert.ok(x.expectedDamagePerTrigger>=0);
   assert.ok(x.quality>=0&&x.quality<=1);
   if(d>w.maxRange+2)assert.equal(x.expectedDamagePerTrigger,0);
  }
 }
 assert.ok(eligible>=34);
});
test('spread and hit geometry agree with authoritative main shared math across weapon classes',()=>{
 const cases=[['m4a1',75,true],['mp5sd',95,true],['aa12',17,true],
  ['l115a3',220,true],['hk_sl8',140,true],['colt9mm',32,false]];
 for(const [id,d,aim] of cases){
  const w=WEAPONS[id],x=estimate(w,d,{aim,samples:96}),truth=official(w,d,{aim});
  eps(x.pelletHitFraction,truth.hit,.1,`${id} pellet hit`);
  eps(x.expectedDamagePerTrigger,truth.damage,Math.max(w.dmg[0]*w.pellets*.22,4),`${id} damage`);
 }
});
test('ADS and aerial spread accurately modify effective ballistic hit',()=>{
 const w=WEAPONS.mp5sd;
 const ads=estimate(w,80,{aim:true}),hip=estimate(w,80,{aim:false});
 assert.ok(ads.pelletHitFraction>hip.pelletHitFraction);
 assert.ok(ads.expectedDamagePerTrigger>hip.expectedDamagePerTrigger);
 assert.ok(estimate(w,80,{aim:false,onGround:true}).pelletHitFraction>
   estimate(w,80,{aim:false,onGround:false}).pelletHitFraction);
});
test('shotgun pellet spread is not misread as one bullet, and long-range sniper remains shootable',()=>{
 const s=WEAPONS.aa12,close=estimate(s,5),far=estimate(s,35);
 assert.equal(close.pellets,s.pellets);
 assert.ok(close.expectedDamagePerTrigger>s.dmg[0]*2);
 assert.ok(far.expectedDamagePerTrigger<close.expectedDamagePerTrigger*.5);
 const w=WEAPONS.l115a3;
 assert.ok(estimate(w,180,{aimPoint:'head'}).pelletHeadFraction>.95);
 assert.equal(estimate(w,180).pelletHitFraction,1);
 assert.ok(estimate(w,180).expectedDamagePerTrigger>=w.dmg[1]);
 assert.equal(estimate(w,401).pelletHitFraction,0);
});
test('attachment calculations read effective input weapon; no canonical stats mutation',()=>{
 const base=WEAPONS.m4a1,eff=gunStats('m4a1','suppressor|vgrip');
 assert.notDeepEqual(eff.range,base.range);
 assert.notEqual(estimate(base,54).expectedDamagePerTrigger,estimate(eff,54).expectedDamagePerTrigger);
 assert.ok(estimate(eff,400).expectedDamagePerTrigger===0);
 assert.deepEqual(WEAPONS.m4a1.range,base.range);
});
test('explicit static-geometry limitations and malformed data fail closed',()=>{
 assert.equal(estimate({dmg:[1,2]},20),null);
 assert.equal(estimate(WEAPONS.knife,2),null);
 assert.equal(estimate(WEAPONS.em2,25),null);
 assert.equal(estimate(WEAPONS.m4a1,NaN),null);
 assert.equal(estimate({...WEAPONS.m4a1,headMul:Infinity},20),null);
 const x=estimate(WEAPONS.m4a1,30,{samples:500});
 assert.equal(x.samples,96);assert.equal(x.calibrated,false);
 assert.ok(x.assumptions.includes('no-world-occlusion'));
});
test('standing/crouch sight height and head/torso aim points are explicit and stable',()=>{
 const w=WEAPONS.m4a1;
 const b=estimate(w,30,{aimPoint:'torso'}),h=estimate(w,30,{aimPoint:'head'});
 assert.equal(b.shooterStance,0);assert.equal(h.aimPoint,'head');
 assert.ok(h.pelletHeadFraction>b.pelletHeadFraction);
 const crouch=estimate(w,30,{stance:1,shooterStance:1});
 assert.equal(crouch.stance,1);assert.equal(crouch.shooterStance,1);
 assert.ok(crouch.expectedDamagePerTrigger>=0);
});
test('headless lab opt-in wiring; legacy train baseline pinned',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorBallisticLab,false);
 assert.equal(normaliseOptions({tacticalDirectorBallisticLab:true}).tacticalDirectorBallisticLab,true);
 const entry=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
 assert.match(entry,/ballisticScoring:options\.tacticalDirectorBallisticLab===true &&\s+options\.tacticalDirectorMainWeaponStatsLab===true &&\s+globalThis\.__FPSARENA_HEADLESS_LAB__===true/);
 const main=readFileSync(new URL('../lab/arena/train-main.mjs',import.meta.url),'utf8');
 assert.match(main,/director-ballistic-shadow-lab/);assert.match(main,/director-ballistic-recovery-lab/);
 const legacy=readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(legacy,/director-ballistic-/);
});
test('shadow candidate adds optional finite per-position ballistic metadata; route cap unchanged',()=>{
 const game={local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:80,weapon:WEAPONS.aa12,ws:{}}};
 const target={id:'enemy',point:{x:34,y:0,z:0},visible:false};
 const policy={effectiveWeaponBand:true,ballisticScoring:true,engagementWindow:true,
  opportunityExpansion:true,maxRoutes:2,maxProbes:28,route:(_,goal)=>[goal],walkable:()=>true,
  canStep:()=>true,shotClear:()=>true,riskAt:()=>0};
 let routed=0;const options=tacticalCandidates(game,target,{...policy,route:(a,b)=>{routed++;return[b];}});
 assert.ok(options.length>0);assert.ok(routed<=2);
 assert.ok(options.every(x=>x.ballistic?.model==='static-unoccluded-angular-envelope-v1'));
 assert.ok(options.every(x=>Number.isFinite(x.ballistic.expectedDamagePerTrigger)));
 const old=tacticalCandidates(game,target,{...policy,ballisticScoring:false});
 assert.ok(old.every(x=>x.ballistic===null));
});
test('priorities shield ballistic scorer from affecting already shootable contact',()=>{
 const game={local:{alive:true,mv:{x:0,y:0,z:0},hp:100,armor:80,weapon:WEAPONS.m4a1,ws:{}}};
 const target={id:'enemy',point:{x:10,y:0,z:0},visible:true};
 const baseline={x:0,z:1,reason:'pathfinding'};
 const out=tacticalDirectorDecision(game,target,baseline,10,{},
  {active:true,effectiveWeaponBand:true,ballisticScoring:true,engagementWindow:true,
   opportunityExpansion:true,shotClear:()=>true,riskAt:()=>0,canStep:()=>true,
   walkable:()=>true,route:(_,p)=>[p]});
 assert.strictEqual(out,baseline);
});
test('bounded-cost envelope performance under repeated near/far probes',()=>{
 const start=performance.now();let total=0;
 for(let i=0;i<280;i++){
  const w= i%2 ? WEAPONS.aa12 : WEAPONS.m4a1;
  const e=estimate(w,3+i*.6,{samples:32});total+=e.expectedDamagePerTrigger;
 }
 assert.ok(total>0);
 assert.ok(performance.now()-start<2000,'unbounded ballot probe evaluation');
});
