#!/usr/bin/env node
// Precommitted three-way microencounter dataset for C28. No production actuation.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {counterfactualC28} from './counterfactual-fire-c28.mjs';
import {WEAPONS} from './source-main/shared/weapons.js';
import {mulberry32} from './source-main/shared/geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dest=path.resolve(process.argv[2]||'reports/c28/micro-v1');
const sha=x=>createHash('sha256').update(x).digest('hex');
const srcPaths=['lab/arena/counterfactual-fire-c28.mjs','lab/arena/run-counterfactual-c28.mjs','scripts/train-encounter-value-c28.py','lab/arena/source-main/server/combat.js',
 'lab/arena/source-main/shared/geometry.js','lab/arena/source-main/shared/constants.js','lab/arena/source-main/shared/weapons.js'];
const sourceSHA256=sha(srcPaths.map(p=>sha(readFileSync(path.join(root,p)))).join('|'));
const weapons=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'];
const train=72,validation=24,test=24,cohort=train+validation+test;
const scenarios=[];
for(let wi=0;wi<weapons.length;wi++)for(let i=0;i<cohort;i++){
 const weaponId=weapons[wi],seed=28000000+wi*100000+i;
 const r=mulberry32(seed^0x8bce7295), w=WEAPONS[weaponId];
 const rangeFactor=.16+.68*r(),distance=Math.max(8,Math.min(75,w.maxRange*.90)*rangeFactor);
 const lagSeconds=[.035,.065,.125,.20][Math.floor(r()*4)];
 scenarios.push({seed,weaponId,distance:+distance.toFixed(5),lagSeconds,
  tracking:['track','lead','lock'][Math.floor(r()*3)],baseVelocity:+((r()-.5)*5.6).toFixed(5),
  offset:+((r()-.5)*6).toFixed(5),aim:r()<.8,
  split:i<train?'train':i<train+validation?'validation':'test'});
}
const plan={schema:'fpsarena-c28-microencounter-plan-v1',design:'same initial conditions and predeclared shared shot seeds; headless server fireWeapon',
 sourceSHA256,sourceFiles:srcPaths,actors:{targetActions:['baseline','micro-left','micro-right'],shotSeed:'same per action',
 opponents:['track','lead','lock'],targetMovement:'0.16s cap at engine MOVE.speed',worldBoxes:'empty'},
 train,validation,test,perWeapon:cohort,weaponIds:weapons,scenarios};
plan.registrationSHA256=sha(JSON.stringify(plan));
mkdirSync(dest,{recursive:true});const planFile=path.join(dest,'PRE-REGISTERED-PLAN.json');
if(existsSync(planFile)){
 const stored=JSON.parse(readFileSync(planFile,'utf8'));
 if(stored.registrationSHA256!==plan.registrationSHA256)throw Error('C28 plan/source differs; use new directory');
}else writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');
const datasetPath=path.join(dest,'ALL-COUNTERFACTUAL-OUTCOMES.json');
if(!existsSync(datasetPath)){
 const rows=scenarios.map((x,i)=>{
  const {split,...s}=x;const trial=counterfactualC28(s);
  if(i%120===0)console.error(`C28 generating ${i}/${scenarios.length}`);
  return {...trial,split};
 });
 writeFileSync(datasetPath,JSON.stringify({schema:'fpsarena-c28-3arm-comparisons-v1',registrationSHA256:plan.registrationSHA256,
  sourceSHA256,rows},null,2)+'\n');
}
const data=JSON.parse(readFileSync(datasetPath,'utf8'));
if(data.registrationSHA256!==plan.registrationSHA256||data.rows.length!==scenarios.length)throw Error('invalid C28 dataset registration');
const seen=new Set();
for(let i=0;i<data.rows.length;i++){
 const x=data.rows[i],s=scenarios[i];
 if(x.scenario.seed!==s.seed||x.scenario.weaponId!==s.weaponId||x.split!==s.split||
  seen.has(x.scenario.seed)||x.arms.length!==3||x.arms.some((a,j)=>a.action!==plan.actors.targetActions[j]||a.shots<=0))throw Error('C28 mismatched or corrupt row '+i);
 seen.add(x.scenario.seed);
}

// Materialize mutually-exclusive source files. The learner's freeze command
// reads ONLY development labels, never parses a holdout outcome until evaluate.
for(const [file,selected] of [['DEVELOPMENT.json',data.rows.filter(r=>r.split!=='test')],
 ['SEALED-HOLDOUT.json',data.rows.filter(r=>r.split==='test')]]){
 const p=path.join(dest,file),payload=JSON.stringify({schema:'fpsarena-c28-split-v1',registrationSHA256:plan.registrationSHA256,rows:selected},null,2)+'\n';
 if(existsSync(p)&&readFileSync(p,'utf8')!==payload)throw Error('existing split was modified '+file);
 if(!existsSync(p))writeFileSync(p,payload);
}
const index={schema:'fpsarena-c28-split-index-v1',registrationSHA256:plan.registrationSHA256,
 developmentSHA256:sha(readFileSync(path.join(dest,'DEVELOPMENT.json'))),
 sealedHoldoutSHA256:sha(readFileSync(path.join(dest,'SEALED-HOLDOUT.json'))),
 allSHA256:sha(readFileSync(datasetPath)),train,validation,test,weaponIds:weapons};
const indexPath=path.join(dest,'DATASET-INDEX.json'),payload=JSON.stringify(index,null,2)+'\n';
if(existsSync(indexPath)&&readFileSync(indexPath,'utf8')!==payload)throw Error('split index changed');
if(!existsSync(indexPath))writeFileSync(indexPath,payload);

console.log(JSON.stringify({plan:planFile,data:datasetPath,sha256:sha(readFileSync(datasetPath)),
 trials:data.rows.length,arms:data.rows.length*3,splits:{train:weapons.length*train,validation:weapons.length*validation,test:weapons.length*test}},null,2));
