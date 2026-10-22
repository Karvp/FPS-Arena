#!/usr/bin/env node
// Freeze synthetic train/validation/test splits BEFORE evaluating labels.
// Calibration reads ONLY C29 public diagnostics (no outcome labels), with seed jitter.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {counterfactualC30,C30_WEAPONS} from '../lab/arena/counterfactual-fire-c30.mjs';
import {mulberry32} from '../lab/arena/source-main/shared/geometry.js';
const R=path.resolve('.');const out=path.join(R,'reports/c30/encounters');mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const hist=[];
for(let i=0;i<48;i++){
 const d=JSON.parse(readFileSync(path.join(R,'reports/c29/long-study',`p${String(i).padStart(3,'0')}.neural.dataset.json`)));
 for(const offer of d.matches[0].offers){const c=offer.c29||{},x=c.publicDiagnostic||{};
  if(c.publicFeatureProxy){const p=c.publicFeatureProxy;
   hist.push([p[0]*85,p[3]*5,p[2]*3]);
  } else if([x.distance,x.offset,x.baseVelocity].every(Number.isFinite))hist.push([x.distance,x.offset,x.baseVelocity]);
 }
}
if(hist.length<200)throw Error('C29 public diagnostic sample missing');
const cases=[],perWeapon=180,splitCount={train:108,validation:36,test:36},tracking=['track','lead','lock','body','partial'];
for(let wi=0;wi<C30_WEAPONS.length;wi++)for(let i=0;i<perWeapon;i++){
 const seed=30000000+wi*200003+i*113,r=mulberry32(seed^0xced23f09);
 const h=hist[Math.floor(r()*hist.length)],d=Math.min(100,Math.max(24,h[0]+(r()-.5)*8));
 const offset=Math.max(-d*.995,Math.min(d*.995,h[1]+(r()-.5)*5));
 const baseVelocity=Math.max(-11.8,Math.min(11.8,h[2]+(r()-.5)*2));
 const lagSeconds=[.035,.065,.125,.200][Math.floor(r()*4)];
 const scenario={seed,weaponId:C30_WEAPONS[wi],distance:+d.toFixed(5),offset:+offset.toFixed(5),
  baseVelocity:+baseVelocity.toFixed(5),lagSeconds,tracking:tracking[Math.floor(r()*tracking.length)],aim:r()<.8};
 const split=i<splitCount.train?'train':i<splitCount.train+splitCount.validation?'validation':'test';
 cases.push({split,scenario});
}
const calibration={schema:'fpsarena-c30-public-kinematic-calibration-v1',sampleCount:hist.length,
 calibrationSource:'C29 safety-eligible PUBLIC diagnostics ONLY; no C29 outcome label',
 calibrationSHA256:hash(JSON.stringify(hist)),histogramSummary:{
 distance:[Math.min(...hist.map(x=>x[0])),Math.max(...hist.map(x=>x[0]))],
 offset:[Math.min(...hist.map(x=>x[1])),Math.max(...hist.map(x=>x[1]))],
 velocity:[Math.min(...hist.map(x=>x[2])),Math.max(...hist.map(x=>x[2]))]}};
const srcfiles=['lab/arena/counterfactual-fire-c30.mjs','scripts/generate-c30-encounters.mjs','lab/arena/source-main/server/combat.js'];
const p={schema:'fpsarena-c30-kinematic-training-plan-v1',calibration,
 sourceSHA256:hash(srcfiles.map(f=>hash(readFileSync(path.join(R,f)))).join('|')),
 actions:['baseline','micro-left','micro-right'],perWeapon,splitCount,
 unit:'one independently seeded 3-arm server fireWeapon encounter',cases};
p.registrationSHA256=hash(JSON.stringify(p));
function fixed(file,obj){const s=JSON.stringify(obj,null,2)+'\n',dest=path.join(out,file);
 if(existsSync(dest)&&readFileSync(dest,'utf8')!==s)throw Error('Existing C30 artifact changed '+file);
 if(!existsSync(dest))writeFileSync(dest,s);
}
fixed('PRE-REGISTERED-PLAN.json',p);
// Separated at write time. Model training command reads only DEVELOPMENT.json.
const develop=[],test=[];
for(const x of cases){const y={split:x.split,...counterfactualC30(x.scenario)}; (x.split==='test'?test:develop).push(y);}
fixed('DEVELOPMENT.json',{schema:'fpsarena-c30-development-v1',registrationSHA256:p.registrationSHA256,rows:develop});
fixed('SEALED-HOLDOUT.json',{schema:'fpsarena-c30-test-v1',registrationSHA256:p.registrationSHA256,rows:test});
const index={registrationSHA256:p.registrationSHA256,developmentSHA256:hash(readFileSync(path.join(out,'DEVELOPMENT.json'))),
 sealedHoldoutSHA256:hash(readFileSync(path.join(out,'SEALED-HOLDOUT.json'))),train:648,validation:216,test:216};
fixed('INDEX.json',index);
console.log(JSON.stringify({calibrationCount:hist.length,train:648,validation:216,test:216,sha:p.registrationSHA256}));
