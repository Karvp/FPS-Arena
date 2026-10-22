import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {WEAPONS,spreadFor,damageAt} from '../lab/arena/source-main/shared/weapons.js';
import {PLAYER} from '../lab/arena/source-main/shared/constants.js';
import {mulberry32,hashSeq,spreadDir,rayAABB,raySphere} from '../lab/arena/source-main/shared/geometry.js';
import {estimateEngagementBallistics} from '../engagement-ballistics.mjs';
import {estimateMotionEngagement,publicTargetMotion} from '../engagement-motion.mjs';
import {tacticalCandidates} from '../tactical-director.mjs';
import {normaliseOptions} from '../aim-core.mjs';
const t=(vx,vz,d=70,delta=.1)=>({id:'T',point:{x:0,y:0,z:d},visible:false,
  remote:{buf:[{t:1,x:-vx*delta,y:0,z:d-vz*delta},{t:1+delta,x:0,y:0,z:d}]}});
const p={x:0,y:0,z:0};

test('C10 flags default off and are headless gated at callsite',()=>{
 assert.equal(normaliseOptions({}).tacticalDirectorMotionLab,false);
 assert.equal(normaliseOptions({tacticalDirectorMotionLab:true}).tacticalDirectorMotionLab,true);
 const entry=readFileSync(new URL('../agent-entry.js',import.meta.url),'utf8');
 assert.match(entry,/motionScoring:options\.tacticalDirectorMotionLab===true &&[\s\S]*?globalThis\.__FPSARENA_HEADLESS_LAB__===true/);
 const main=readFileSync(new URL('../lab/arena/train-main.mjs',import.meta.url),'utf8');
 assert.match(main,/director-motion-shadow-lab/);
 assert.match(main,/director-motion-recovery-lab/);
 assert.doesNotMatch(readFileSync(new URL('../lab/arena/train.mjs',import.meta.url),'utf8'),/director-motion-/);
});
test('malformed, missing, stale and teleport public motion all fail closed',()=>{
 assert.equal(publicTargetMotion({point:{x:1,z:2}}),null);
 assert.equal(publicTargetMotion(t(35,0)),null);
 assert.equal(publicTargetMotion(t(1,0,70,.5)),null);
 const x=t(2,0);x.point.x=50;assert.equal(publicTargetMotion(x),null);
 const y=t(3,0);y.remote.buf.at(-1).x=NaN;assert.equal(publicTargetMotion(y),null);
 assert.equal(estimateMotionEngagement(WEAPONS.mp5sd,p,y,70),null);
 assert.equal(estimateMotionEngagement(WEAPONS.mp5sd,p,t(2,0),70,{lagSeconds:100}),null);
});
test('standing target motion estimate equals C9 exactly, no probability claims',()=>{
 const current=t(0,0),stationary=estimateMotionEngagement(WEAPONS.mp5sd,p,current,70);
 const base=estimateEngagementBallistics(WEAPONS.mp5sd,70,{samples:32});
 assert.ok(stationary);
 assert.equal(stationary.robustQuality,base.quality);
 assert.ok(stationary.scenarios.every(s=>s.damage===base.expectedDamagePerTrigger));
 assert.equal(stationary.calibrated,false);
 assert.ok(stationary.assumptions.includes('hypothetical-motion-scenarios'));
});
test('lateral moving target causes bounded additional uncertainty at 100m',()=>{
 const w=WEAPONS.mp5sd,slow=estimateMotionEngagement(w,p,t(2,0,100),100);
 const fast=estimateMotionEngagement(w,p,t(8,0,100),100);
 assert.equal(slow.scenarios.length,3);
 assert.ok(slow.robustQuality>fast.robustQuality);
 assert.ok(fast.robustQuality>=0 && fast.robustQuality<=1);
 assert.ok(fast.horizonSeconds<=.45);
 assert.ok(Math.abs(Math.abs(fast.lateralSpeed)-8)<1e-7);
});
test('geometry offset corresponds to main engine shifted target hit boxes',()=>{
 const w=WEAPONS.mp5sd,dist=90,x=.3,z=-.25,origin=[0,1.6,0],centre=[0,PLAYER.bodyH[0]*.6-1.6,-dist];
 const dlen=Math.hypot(...centre),aim=centre.map(c=>c/dlen);
 let hits=0,damage=0;const shots=1536;
 for(let seq=1;seq<=shots;seq++){
  const dir=spreadDir(aim,0,spreadFor(w,true,true),mulberry32(hashSeq(seq,0)));
  const body=rayAABB(origin,dir,x-PLAYER.bodyHalf,0,-dist+z-PLAYER.bodyHalf,x+PLAYER.bodyHalf,PLAYER.bodyH[0],-dist+z+PLAYER.bodyHalf,w.maxRange);
  const head=raySphere(origin,dir,x,PLAYER.headYs[0],-dist+z,PLAYER.headRadius,w.maxRange);
  const isHead=head<Infinity && head<=body+.2,hit=isHead?head:body;
  if(hit<Infinity){hits++;damage+=damageAt(w,hit)*(isHead?w.headMul:1);}
 }
 const model=estimateEngagementBallistics(w,dist,{samples:96,targetOffsetX:x,targetOffsetZ:z});
 assert.ok(Math.abs(model.pelletHitFraction-hits/shots)<.11);
 assert.ok(Math.abs(model.expectedDamagePerTrigger-damage/shots)<Math.max(w.dmg[0]*.23,4));
 assert.equal(estimateEngagementBallistics(w,dist,{targetOffsetX:Infinity}),null);
 assert.equal(estimateEngagementBallistics(w,dist,{targetOffsetZ:99}),null);
});
test('integrated motion scoring is route-limited and preserves C9 without velocity',()=>{
 const game={local:{alive:true,mv:p,hp:100,armor:80,weapon:WEAPONS.mp5sd,ws:{}}};
 const target=t(3,0,65),audit=[];let routeCount=0;
 const policy={effectiveWeaponBand:true,ballisticScoring:true,motionScoring:true,
   engagementWindow:true,opportunityExpansion:true,shotProbeCoverage:true,
   maxRoutes:3,maxProbes:28,route:(_a,b)=>{routeCount++;return[b];},
   shotClear:()=>true,walkable:()=>true,canStep:()=>true,riskAt:()=>0,
   onCandidateAudit:a=>audit.push(a)};
 const result=tacticalCandidates(game,target,policy);
 assert.ok(result.length);
 assert.ok(routeCount<=3);
 assert.ok(result.every(r=>r.motion?.model==='public-motion-latency-sensitivity-v1'));
 assert.ok(audit[0].motionSites>0);
 const absent=tacticalCandidates(game,{...target,remote:{}},policy);
 assert.ok(absent.every(r=>r.motion===null));
 assert.equal(result.length,absent.length);
});
test('motion estimator bounded execution for sampled paths (fixed sample budget)',()=>{
 const w=WEAPONS.aa12,start=performance.now();let checksum=0;
 for(let i=0;i<120;i++)checksum+=estimateMotionEngagement(w,p,t(4,0,12),12)?.robustQuality??0;
 assert.ok(Number.isFinite(checksum));
 assert.ok(performance.now()-start<1000,'motion sensitivity must remain bounded');
});
test('higher observation latency can reduce robust quality without modifying the game RNG',()=>{
 const moving=t(8,0,100),w=WEAPONS.mp5sd;
 const near=estimateMotionEngagement(w,p,moving,100,{lagSeconds:0});
 const delayed=estimateMotionEngagement(w,p,moving,100,{lagSeconds:.18});
 assert.ok(delayed.horizonSeconds>near.horizonSeconds);
 assert.ok(delayed.robustQuality<=near.robustQuality);
 assert.equal(delayed.scenarios.length,3);
});
test('three-snapshot turn is observable but remains a hypothetical sensitivity model',()=>{
 const target={point:{x:0,y:0,z:100},remote:{buf:[
  {t:.9,x:-1,z:101},{t:1,x:-.8,z:100},{t:1.1,x:0,z:100}]}};
 const motion=publicTargetMotion(target);
 assert.ok(motion.turn>.1 && motion.turn<3);
 const value=estimateMotionEngagement(WEAPONS.mp5sd,p,target,100);
 assert.equal(value.model,'public-motion-latency-sensitivity-v1');
 assert.equal(value.calibrated,false);
 assert.ok(value.robustQuality<=value.qualityMean);
});
