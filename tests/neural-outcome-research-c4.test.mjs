import test from 'node:test';
import assert from 'node:assert/strict';
import {featuresFromObservation,supervisedRows,trainNeuralShotPredictor,predictShotProbability} from '../lab/arena/neural-outcome-research.mjs';
function make(i,{shot=i%2,uncensored=true,overlap=false}={}){
 return {schema:'fpsarena-executed-engagement-observation-v2',provenance:{mode:'tdm',map:i%2?'arena':'foundry',primaryLoadout:i%2?'mp5sd':'benelli_m4',seed:i},
  option:{utility:shot?4:-4,risk:shot?.3:2,plannedETA:shot?1:6,terminalETA:shot?3:9,
    routeLength:20,uncertainty:2,earlyShotWindow:shot===1},
  observation:{horizonSeconds:5,horizonComplete:uncensored,total:{shots:shot?4:0}},
  trainingEligibility:{fullyObserved:uncensored,independentObservation:!overlap}};
}
test('C3 trajectories have no training labels and cannot trigger neural training',()=>{
 const rows=[make(1),make(2),make(3),make(4)].map(x=>({...x,schema:'fpsarena-executed-engagement-observation-v1'}));
 const result=trainNeuralShotPredictor(rows);assert.equal(result.status,'insufficient-data');assert.equal(result.model,null);
});
test('only selected, complete and non-overlapping five-second windows are eligible',()=>{
 const rows=[make(1),make(2,{uncensored:false}),make(3,{overlap:true}),make(4)];
 assert.equal(supervisedRows(rows).length,2);
 assert.equal(featuresFromObservation(make(1)).length,7);
 assert.equal(featuresFromObservation({...make(1),option:{...make(1).option,risk:NaN}}),null);
});
test('neural predictor really learns from diverse observational examples with grouped holdout',()=>{
 const rows=Array.from({length:240},(_,i)=>make(i,{shot:i%3===0?1:0}));
 const r=trainNeuralShotPredictor(rows,{epochs:65});
 assert.equal(r.status,'research-only');assert.equal(r.productionEligible,false);
 assert.ok(r.split.trainGroups>0&&r.split.validGroups>0);
 assert.ok(r.evaluation.modelValidationBrier<r.evaluation.constantRateBaselineBrier,
  `model ${r.evaluation.modelValidationBrier} baseline ${r.evaluation.constantRateBaselineBrier}`);
 assert.ok(predictShotProbability(r.model,featuresFromObservation(make(12,{shot:1})))>
  predictShotProbability(r.model,featuresFromObservation(make(14,{shot:0}))));
});
test('no early-shot / feature complete leakage via post-outcome statistics',()=>{
 const a=make(10);const b=structuredClone(a);b.observation.total.shots=99;
 assert.deepEqual(featuresFromObservation(a),featuresFromObservation(b));
});
