#!/usr/bin/env node
// Lock all scenarios, source fingerprints, splits and selection criteria prior
// to calculating any counterfactual outcome. Uses C31 PUBLIC diagnostics only;
// neither C31 kills/damage nor future server state enters the sampling design.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {counterfactualC32,COVER_C32} from '../lab/arena/counterfactual-fire-c32.mjs';
import {C30_WEAPONS} from '../lab/arena/counterfactual-fire-c30.mjs';
import {mulberry32} from '../lab/arena/source-main/shared/geometry.js';
const root=path.resolve('.'),out=path.resolve(process.argv[2]||'reports/c32/encounters');mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixed=(f,obj)=>{let p=path.join(out,f),txt=JSON.stringify(obj,null,2)+'\n';
 if(existsSync(p)&&readFileSync(p,'utf8')!==txt)throw Error(`C32 refuses to replace ${f}`);
 if(!existsSync(p))writeFileSync(p,txt);};
const sourceFiles=['lab/arena/counterfactual-fire-c32.mjs','scripts/generate-c32-encounters.mjs',
 'lab/arena/source-main/server/combat.js','lab/arena/source-main/shared/movement.js',
 'lab/arena/source-main/shared/geometry.js'];
const sourceSHA256=sha(sourceFiles.map(f=>sha(readFileSync(path.join(root,f)))).join('|'));
const pool=Object.fromEntries(C30_WEAPONS.map(w=>[w,[]]));
for(let i=0;i<36;i++){
 const d=JSON.parse(readFileSync(path.join(root,'reports/c31/study',`p${String(i).padStart(3,'0')}.neural.dataset.json`)));
 for(const o of d.matches[0].offers){const c=o.c30||{},w=o.c31?.publicWeapon;
  if(!pool[w]||!Array.isArray(c.publicFeatureValues)||c.publicFeatureValues.length!==10)continue;
  const f=c.publicFeatureValues;pool[w].push([f[0]*100,f[2]*12,f[3]*f[0]*100]);
 }
}
if(C30_WEAPONS.some(w=>pool[w].length<25))throw Error('C31 public coverage insufficient');
const scenarios=[],perWeapon=180,splitCount={train:108,validation:36,test:36};
for(let wi=0;wi<C30_WEAPONS.length;wi++)for(let i=0;i<perWeapon;i++){
 const seed=32000001+wi*100019+i*173,r=mulberry32(seed^0xc32bfe12),obs=pool[C30_WEAPONS[wi]];
 const x=obs[Math.floor(r()*obs.length)];
 const distance=Math.max(24,Math.min(100,x[0]+(r()-.5)*12)),
 offset=Math.max(-Math.min(distance*.89,60),Math.min(Math.min(distance*.89,60),x[2]+(r()-.5)*13)),
 baseVelocity=Math.max(-8.5,Math.min(8.5,x[1]+(r()-.5)*4));
 const cover=COVER_C32[(i+Math.floor(r()*7))%COVER_C32.length];
 const scenario={seed,weaponId:C30_WEAPONS[wi],distance:+distance.toFixed(5),offset:+offset.toFixed(5),
 baseVelocity:+baseVelocity.toFixed(5),lagSeconds:[.035,.065,.125,.20][Math.floor(r()*4)],
 // Public body-yaw bearing (NOT authoritative shooter aim).
 bodyYawRelative:+Math.max(-1.1,Math.min(1.1,Math.asin(offset/distance)+(r()-.5)*.45)).toFixed(6),
 // Hidden nuisance, withheld from learner.
 aimError:+((r()-.5)*.18).toFixed(6),coverShift:+((r()-.5)*8).toFixed(6),
 cover,tracking:['track','lead','lock','partial'][Math.floor(r()*4)],aim:r()<.7};
 const split=i<splitCount.train?'train':i<splitCount.train+splitCount.validation?'validation':'test';
 scenarios.push({split,scenario});
}
const plan={schema:'fpsarena-c32-controlled-cover-study-plan-v1',sourceFiles,sourceSHA256,
 calibration:'C31 pilot delayed PUBLIC features only, labels excluded',publicSampleCounts:Object.fromEntries(C30_WEAPONS.map(w=>[w,pool[w].length])),
 publicCalibrationSHA256:sha(JSON.stringify(pool)),perWeapon,splitCount,scenarios,
 requirements:{minWithinWeaponDiverseCategories:3,holdoutRegretMarginVsAlwaysLeft:0,
   minActionUtilityRangeFraction:.08,noFutureServerLabels:true,noProductionActuation:true},
 primary:'validation-selected learned policy vs validation-selected simple baseline on untouched holdout',
 limitations:['micro 1v1 simplified firing policy','fixed static cover','no multiple target routing','headless','simulation not human gameplay']};
 plan.registrationSHA256=sha(JSON.stringify(plan));fixed('PRE-REGISTERED-PLAN.json',plan);
const paths=['DEVELOPMENT.json','SEALED-HOLDOUT.json'];const records={train:[],validation:[],test:[]};
for(let k=0;k<scenarios.length;k++){
 const {split,scenario}=scenarios[k];records[split].push({...counterfactualC32(scenario),split});
 if(k%180===0)console.error(`C32 server truth ${k}/${scenarios.length}`);
}
fixed(paths[0],{schema:'fpsarena-c32-development-v1',registrationSHA256:plan.registrationSHA256,rows:[...records.train,...records.validation]});
fixed(paths[1],{schema:'fpsarena-c32-sealed-test-v1',registrationSHA256:plan.registrationSHA256,rows:records.test});
fixed('INDEX.json',{registrationSHA256:plan.registrationSHA256,
 developmentSHA256:sha(readFileSync(path.join(out,paths[0]))),
 sealedTestSHA256:sha(readFileSync(path.join(out,paths[1]))),
 counts:{train:records.train.length,validation:records.validation.length,test:records.test.length},
 samples:scenarios.length,arms:scenarios.length*3});
console.log(JSON.stringify({registrationSHA256:plan.registrationSHA256,count:scenarios.length,arms:scenarios.length*3,
 publicCalibration:plan.publicSampleCounts,sourceSHA256},null,2));
