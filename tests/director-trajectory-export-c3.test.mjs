import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDirectorTrajectories,summarizeDirectorTrajectories} from '../lab/arena/export-director-trajectories.mjs';
const match={mode:'tdm',map:'arena',seed:5,profile:'director-engagement-coverage-lab',duration:65,errors:0,
  directorPlanWindows:[
   {planId:1,type:'FLANK',targetId:'a',start:2,end:3,commandSelected:true,
    shotsDuring:1,hitsDuring:1,killsDuring:0,damageTakenDuring:4,
    utility:1,risk:.3,plannedETA:1.2,reason:'reached-goal'},
   {planId:2,type:'APPROACH',targetId:'b',start:5,end:8,commandSelected:false,
    shotsDuring:0,hitsDuring:0,killsDuring:0,reason:'not-selected'},
   {planId:3,type:'FLANK',targetId:'b',start:9,end:11,commandSelected:true,
    shotsDuring:0,hitsDuring:0,killsDuring:0,reason:null}]};
test('training export excludes plans never selected and marks censored outcomes',()=>{
 const rows=extractDirectorTrajectories({results:[match]});
 assert.equal(rows.length,2);
 assert.equal(rows[0].option.planId,1);assert.equal(rows[0].observedDuringSelection.shots,1);
 assert.equal(rows[1].option.planId,3);assert.equal(rows[1].option.censored,true);
 assert.equal(rows[1].trainingEligibility.fullyObserved,false);
 assert.equal(rows[0].provenance.causalEffectEstimated,false);
});
test('export excludes broken or nonauthoritative outcome windows',()=>{
 assert.deepEqual(extractDirectorTrajectories({results:[{...match,errors:1}]}),[]);
 assert.deepEqual(extractDirectorTrajectories({results:[{...match,duration:NaN}]}),[]);
 assert.deepEqual(extractDirectorTrajectories({rows:[]}),[]);
});
test('export never converts proxy labels to counterfactual superiority',()=>{
 const summary=summarizeDirectorTrajectories(extractDirectorTrajectories({results:[match]}));
 assert.equal(summary.selectedPlans,2);
 assert.equal(summary.readyForNeuralTraining,false);
 assert.match(summary.whyNot,/counterfactual/i);
});
