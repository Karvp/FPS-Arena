import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioKey,splitForEvaluation,verifyPairedRows,consolidateStudy,C4_PROFILES} from '../scripts/c4-observation-study.mjs';
const make=(profile,seed=7,selected=false)=>({mode:'tdm',map:'arena',seed,profile,primaryLoadout:'mp5sd',
  opponentPolicy:'stress',seconds:65,duration:65,errors:0,gameCode:'authoritative-server',
  kills:1,deaths:0,shots:5,damageTaken:12,directorPlanSelectionCount:selected?1:0,
  directorPlanWindows:selected?[{planId:1,commandSelected:true}]:[],
  directorOutcomeWindows:selected?[{planId:1,selectedAt:12,plannedAt:11.9,observationEnd:17,
    horizonSeconds:5,observedSeconds:5,horizonComplete:true,overlappingHorizon:false,
    utility:-1.26,risk:0.59,plannedETA:4.7,type:'FLANK',observedTotal:{shots:1}}]:[]});
test('paired audit requires every profile, same seed/map/loadout and no runtime errors',()=>{
 const docs=C4_PROFILES.map(p=>({results:[make(p)]}));
 assert.equal(verifyPairedRows(docs).size,1);
 assert.throws(()=>verifyPairedRows(docs.slice(1)),/Missing paired/);
 assert.throws(()=>verifyPairedRows([...docs,{results:[make('release')]}]),/Duplicate/);
 assert.throws(()=>verifyPairedRows(docs.map((d,i)=>i===1?{results:[{...d.results[0],errors:1}]}:d)),/Malformed/);
 assert.throws(()=>verifyPairedRows(docs.map((d,i)=>i===2?{results:[{...d.results[0],opponentPolicy:'official'}]}:d)),/Opponent mismatch/);
});
test('all profile variants from one seed stay in same split',()=>{
 const m=make('release');assert.equal(splitForEvaluation(scenarioKey(m)),splitForEvaluation(scenarioKey({...m,profile:'other'})));
});
test('cross-profile near-duplicate execution is marked; observations are never causal labels',()=>{
 const docs=C4_PROFILES.map((p,i)=>({results:[make(p,7,i!==0)]}));
 const {trajectory,summary}=consolidateStudy(docs);
 assert.equal(summary.matches,3);assert.equal(summary.matchedGroups,1);
 assert.equal(summary.uniqueExecutedScenarioContexts,1);
 assert.equal(summary.potentialCrossProfileDuplicates,1);
 assert.equal(summary.completeIndependentFeatureRows,2);
 assert.equal(trajectory[1].study.potentialCrossProfileDuplicate,true);
 assert.ok(trajectory.every(x=>x.trainingEligibility.counterfactualAvailable===false));
 assert.equal(summary.readyForNeuralTraining,false);
});
test('unselected proposed plans cannot create synthetic training labels',()=>{
 const docs=C4_PROFILES.map(p=>({results:[make(p)]}));
 const {trajectory,summary}=consolidateStudy(docs);
 assert.equal(trajectory.length,0);assert.equal(summary.selectedPlans,0);
});
