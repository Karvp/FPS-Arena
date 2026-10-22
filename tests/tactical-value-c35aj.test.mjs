import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {C35AJ_OFFLINE_ONLY,C35AJ_ARMS,vectorC35AJ,predictOfflineC35AJ,predictFactualOptionC35AJ} from '../lab/arena/tactical-value-inference-c35aj.mjs';
const R=path.resolve(import.meta.dirname,'..');const out=path.join(R,'reports/c35aj/neural');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));const W=read(path.join(out,'FROZEN-TACTICAL-MODELS.json'));
function inputs(i){const c=read(path.join(R,`reports/c35aj/prospective-108-v1/matches/c35aj-${i}-randomized.option.json`));
 return c.traces[0].rows.map(r=>({features:r.initialPublicFeatures,menu:r.menu,incumbent:r.initialCommand,
  lagMs:[85,175,65,135,215,245][+i%6]||65,gun:['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'][Math.floor(+i/6)],map:['foundry','neon','arena'][+i%3],opponents:['stress','mixed','official','stress','official','mixed'][+i%6]}));}
test('C35AJ artifacts remain offline only, no mutation to production',()=>{assert.equal(C35AJ_OFFLINE_ONLY,true);assert.equal(W.productionEnabled,false);assert.equal(W.status,'OFFLINE_ONLY');});
test('C35AJ chosen model is from validation, not prospective holdout',()=>{const E=read(path.join(out,'EVALUATION.json'));assert.deepEqual(E.validationSelected,{stateOnly:W.selectedStateOnly,actionConditioned:W.selectedAction});assert.equal(E.offPolicyHoldout.setupClusters,12);});
test('C35AJ vector dimensions and action conditioning',()=>{const r=inputs('24')[0];const a=vectorC35AJ(r,'incumbent'),b=vectorC35AJ(r,'option-a');assert.equal(a.length,W.stateFeatureNames.length+W.actionFeatureNames.length);assert.notDeepEqual(a,b);assert.equal(vectorC35AJ(r,'incumbent',{action:false}).length,W.stateFeatureNames.length);});
test('C35AJ rejects missing and poststep-only features',()=>{assert.throws(()=>vectorC35AJ({},'incumbent'));assert.throws(()=>vectorC35AJ(inputs('24')[0],'UNKNOWN'));});
test('C35AJ independently replays frozen Python forecasts',()=>{
 const csv=fs.readFileSync(path.join(out,'HOLDOUT-PREDICTIONS.csv'),'utf8').trim().split('\n');const headings=csv.shift().trim().split(',');
 const bySetup=new Map();for(const text of csv){const p=Object.fromEntries(text.trim().split(',').map((v,j)=>[headings[j],v]));if(!bySetup.has(p.setupId))bySetup.set(p.setupId,[]);bySetup.get(p.setupId).push(p);}
 let compared=0;for(let i=24;i<36;i++){
  const id=`c35aj-${String(i).padStart(2,'0')}`,all=read(path.join(R,`reports/c35aj/prospective-108-v1/matches/${id}-randomized.option.json`)).traces[0].rows;
  const expected=bySetup.get(id)||[];let j=0;
  for(const [k,row] of all.entries()){
   if(!row.factual.complete)continue;
   const item=expected[j++],r={features:row.initialPublicFeatures,menu:row.menu,incumbent:row.initialCommand,
    lagMs:[65,135,215,245,85,175][i%6],gun:['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'][Math.floor(i/6)],
    map:['foundry','neon','arena'][i%3],opponents:['stress','mixed','official','stress','official','mixed'][i%6]};
   assert.equal(row.assignedArm,item.assignedArm);
   for(const [arm,key] of [['incumbent','predIncumbent'],['option-a','predOptionA'],['option-b','predOptionB']])
    assert.ok(Math.abs(predictFactualOptionC35AJ(W,r,arm)-Number(item[key]))<1e-8,`${id}/${k} ${arm}`);
   compared++;
  }
  assert.equal(j,expected.length);
 }
 assert.equal(compared,77);
});
