#!/usr/bin/env node
// C33 preregistered map-geometry controlled counterfactual cohort.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {encounterC33,sampleScenarioC33,MAPS_C33} from '../lab/arena/map-encounter-c33.mjs';
import {C30_WEAPONS} from '../lab/arena/counterfactual-fire-c30.mjs';
const root=path.resolve('.'),out=path.resolve(process.argv[2]||'reports/c33/map-cohort');mkdirSync(out,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixed(name,value){const file=path.join(out,name),data=JSON.stringify(value,null,2)+'\n';
 if(existsSync(file)&&readFileSync(file,'utf8')!==data)throw Error(`C33 refuses overwrite ${name}`);
 if(!existsSync(file))writeFileSync(file,data);return sha(data);}
const sourceFiles=['lab/arena/map-encounter-c33.mjs','scripts/generate-c33-map-encounters.mjs',
 'lab/arena/source-main/server/combat.js','lab/arena/source-main/shared/movement.js','lab/arena/source-main/shared/geometry.js',
 ...MAPS_C33.map(m=>`lab/arena/source-main/maps/${m}.js`)];
const sourceSHA256=sha(sourceFiles.map(p=>sha(readFileSync(path.join(root,p)))).join('|'));
const rows=[],perMapWeapon=180,sections={train:108,validation:36,test:36};
for(let mi=0;mi<MAPS_C33.length;mi++)for(let wi=0;wi<C30_WEAPONS.length;wi++)for(let i=0;i<perMapWeapon;i++){
 const seed=331000017+mi*199991+wi*29003+i*149;
 const scenario=sampleScenarioC33(seed,MAPS_C33[mi],C30_WEAPONS[wi]);
 const split=i<sections.train?'train':i<sections.train+sections.validation?'validation':'test';
 rows.push({split,scenario});
}
if(new Set(rows.map(x=>x.scenario.seed)).size!==rows.length)throw Error('duplicate seed');
const plan={schema:'fpsarena-c33-map-cohort-plan-v1',sourceFiles,sourceSHA256,perMapWeapon,
 maps:[...MAPS_C33],weapons:[...C30_WEAPONS],splitPerMapWeapon:sections,rows,
 sampling:'static map AABB, near x faces of eligible covers, ~80% pre-action LOS visible; no future labels; all three arms share seed',
 predeclaredGates:{minMovingCollisionScenarioFraction:.35,minActionSensitiveScenarioFraction:.10,
 minNeuralValGainOverBestSimple:2.0,minNeuralWithinWeaponDiversity:3,
 minHoldoutNeuralGainOverBestSimple:0.0,requirePositiveBootstrapLowerBound:true,
 productionMustRemainIdentical:true},
 causalCaveat:'controlled 1v1 labels only, not a full Game.step() replay and no production policy promotion'};
plan.registrationSHA256=sha(JSON.stringify(plan));fixed('PRE-REGISTERED-PLAN.json',plan);
const datasets={train:[],validation:[],test:[]};
for(let i=0;i<rows.length;i++){
 const {split,scenario}=rows[i];datasets[split].push({...encounterC33(scenario),split});
 if(i%750===0)console.error(`C33 map labels ${i}/${rows.length}`);
}
const development={schema:'fpsarena-c33-map-development-v1',registrationSHA256:plan.registrationSHA256,
 rows:[...datasets.train,...datasets.validation]};
const test={schema:'fpsarena-c33-map-sealed-holdout-v1',registrationSHA256:plan.registrationSHA256,rows:datasets.test};
const developmentSHA256=fixed('DEVELOPMENT.json',development),sealedTestSHA256=fixed('SEALED-HOLDOUT.json',test);
const measure=xs=>({scenarios:xs.length,actionSensitive:xs.filter(r=>new Set(r.arms.map(a=>a.cappedLoss)).size>1).length,
 anyHits:xs.filter(r=>r.arms.some(a=>a.hits>0)).length,collision:xs.filter(r=>r.arms.some(a=>a.blockedTicks>0)).length});
fixed('INDEX.json',{registrationSHA256:plan.registrationSHA256,sourceSHA256,developmentSHA256,sealedTestSHA256,
 counts:Object.fromEntries(Object.entries(datasets).map(([s,rs])=>[s,measure(rs)])),armCount:rows.length*3});
console.log(JSON.stringify({registrationSHA256:plan.registrationSHA256,sourceSHA256,developmentSHA256,sealedTestSHA256,
 counts:Object.fromEntries(Object.entries(datasets).map(([s,rs])=>[s,measure(rs)]))},null,2));
