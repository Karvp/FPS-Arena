import test from 'node:test';import assert from 'node:assert/strict';
import {extractOffers} from '../scripts/c5-offer-export.mjs';
const doc=()=>({profile:'director-engagement-exploration-lab',results:[{
 mode:'tdm',map:'arena',seed:9,primaryLoadout:'mp5sd',profile:'director-engagement-exploration-lab',
 directorExplorationOffers:2,directorExplorationAssignments:[
 {t:4,targetId:'a',attempt:1,draw:.1,actionProbability:.5,controlProbability:.5,actuate:true,eligibleCount:1},
 {t:7,targetId:'a',attempt:2,draw:.8,actionProbability:.5,controlProbability:.5,actuate:false,eligibleCount:1}],
 directorPlanWindows:[{planId:1,commandSelected:true,explorationAttempt:1,actionProbability:.5}],
 directorOutcomeWindows:[{planId:1,horizonComplete:true,observedTotal:{shots:2}}]}]});
test('export links treatment to confirmed selection and never forges control outcome',()=>{
 const {rows,audit}=extractOffers([doc()]);
 assert.equal(audit.assigned,1);assert.equal(audit.controls,1);
 assert.equal(audit.confirmedSelections,1);assert.equal(audit.uniqueContexts,1);
 assert.equal(rows[0].execution.observedOutcomeWindow.observedTotal.shots,2);
 assert.equal(rows[1].execution.observedOutcomeWindow,null);
 assert.equal(rows[1].execution.counterfactualAvailable,false);
 assert.ok(rows.every(r=>r.eligibility.suitableForNeuralTraining===false));
});
test('reject malformed randomization rather than making a supervised label',()=>{
 const d=doc();d.results[0].directorExplorationAssignments[0].actuate=false;
 const {rows,audit}=extractOffers([d]);assert.equal(audit.invalid,1);assert.equal(rows.length,1);
});
