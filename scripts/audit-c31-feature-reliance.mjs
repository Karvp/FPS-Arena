#!/usr/bin/env node
// Post-hoc *diagnostic only*: perturb PUBLIC features of frozen model without
// changing any actual game actions. Not a causal evaluation nor deployed code.
import {readFileSync,writeFileSync} from 'node:fs';
import {readFrozenC30,neuralLossC30,C30_WEAPONS} from '../lab/arena/research-policy-c30.mjs';
import path from 'node:path';
const root=path.resolve('.'),dir=path.join(root,'reports/c31/study');
const model=readFrozenC30(path.join(root,'reports/c30/encounters/FROZEN-POLICY.json'));
const plan=JSON.parse(readFileSync(path.join(dir,'PRE-REGISTERED-PLAN.json')));
const offers=[];
for(const r of plan.pilot){
 const d=JSON.parse(readFileSync(path.join(dir,`${r.id}.neural.dataset.json`)));
 for(const o of d.matches[0].offers){
  const x=o.c30?.publicFeatureValues;
  if(x?.length===10)offers.push({weapon:r.enemyWeapon,seed:r.seed,x,chosen:o.c30.selected});
 }
}
const action=x=>['baseline','micro-left','micro-right'][neuralLossC30(model,x).indexOf(Math.min(...neuralLossC30(model,x)))];
let originalCorrect=0,withinMotionFlip=0,gunSwapFlip=0,weather=0,withinGunKinematicFlip=0,withinGunKinematicTrials=0;
const perGun={};
for(let i=0;i<offers.length;i++){
 const v=offers[i],a=action(v.x);if(a===v.chosen)originalCorrect++;
 let flips=0,comparisons=0,swaps=0,swapsN=0;
 // Borrow PUBLIC geometry and motion from 8 other pilot offers, preserve gun.
 for(let j=1;j<=8;j++){
  const t=offers[(i+j*31)%offers.length].x;
  const y=[...t.slice(0,4),...v.x.slice(4)];comparisons++;
  if(action(y)!==a)flips++;
 }
 // Replace only gun identity among all other five one-hot classes.
 for(let gun=0;gun<C30_WEAPONS.length;gun++){
  if(v.x[4+gun])continue;
  const y=[...v.x.slice(0,4),...C30_WEAPONS.map((_,k)=>+(k===gun))];swapsN++;
  if(action(y)!==a)swaps++;
 }
 // Swap measured kinematics ONLY among observed public states with same weapon.
 const same=offers.filter(o=>o.weapon===v.weapon);
 for(let j=1;j<=Math.min(8,same.length-1);j++){
  const other=same[(i+j*7)%same.length];
  if(other===v)continue;
  withinGunKinematicTrials++;
  if(action([...other.x.slice(0,4),...v.x.slice(4)])!==a)withinGunKinematicFlip++;
 }
 withinMotionFlip+=flips;gunSwapFlip+=swaps;weather+=comparisons;
 const w=perGun[v.weapon]??={offers:0,initialActions:{},kinematicPerturbFlip:0,weaponSwapFlip:0};
 w.offers++;w.initialActions[a]=(w.initialActions[a]||0)+1;
 w.kinematicPerturbFlip+=flips;w.weaponSwapFlip+=swaps;
}
for(const x of Object.values(perGun)){
 x.motionSwapActionChangeRate=x.kinematicPerturbFlip/(8*x.offers);
 x.weaponSwapActionChangeRate=x.weaponSwapFlip/(5*x.offers);
}
const result={schema:'fpsarena-c31-frozen-model-posthoc-feature-reliance-v1',
 modelSHA256:model.modelSourceSHA256,registrationSHA256:plan.registrationSHA256,
 samples:offers.length,recomputedMatchRate:originalCorrect/offers.length,
 kinematicPerturbChanges:withinMotionFlip,kinematicPerturbTrials:weather,
 kinematicPerturbChangeRate:withinMotionFlip/weather,
 weaponSwapChanges:gunSwapFlip,weaponSwapTrials:offers.length*5,
 weaponSwapChangeRate:gunSwapFlip/(offers.length*5),
 withinGunKinematicFlip,withinGunKinematicTrials,
 withinGunKinematicChangeRate:withinGunKinematicFlip/withinGunKinematicTrials,perGun,
 caveat:'synthetic feature perturbations are off-policy and may be off-manifold; diagnostic only; no action was changed'};
writeFileSync(path.join(dir,'FROZEN-MODEL-FEATURE-AUDIT.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
