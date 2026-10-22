import test from 'node:test';
import assert from 'node:assert/strict';
import {tacticalEpisodeExplorationAssignment,tacticalExplorationAssignment} from '../tactical-director.mjs';
import {extractEpisodeArms} from '../scripts/c6-episode-export.mjs';

test('episode assignment is deterministic and independent of target-specific offers',()=>{
 const a=tacticalEpisodeExplorationAssignment(893201,.5);
 assert.deepEqual(a,tacticalEpisodeExplorationAssignment(893201,.5));
 assert.equal(a.unit,'episode');assert.equal(a.assignmentId,'episode-893201');
 const b=tacticalExplorationAssignment(893201,2,'different-target',.5);
 assert.equal(typeof b.actuate,'boolean');
 assert.equal(a.draw>=0&&a.draw<1,true);
});
test('episode-level assignment validates seed and probability',()=>{
 for(const p of [-.1,1.1,NaN])assert.throws(()=>tacticalEpisodeExplorationAssignment(9,p));
 assert.throws(()=>tacticalEpisodeExplorationAssignment(1.2,.5));
});
test('seeded 50% episode arm draws are nondegenerate across 200 seeds',()=>{
 const result=Array.from({length:200},(_,i)=>tacticalEpisodeExplorationAssignment(10101+i,.5));
 const n=result.filter(x=>x.actuate).length;
 assert.ok(n>55&&n<145,`arm balance: ${n}/200`);
});
test('C6 exports randomized episodes with no opportunity rather than silently dropping them',()=>{
 const a=tacticalEpisodeExplorationAssignment(23,.5), m={mode:'tdm',map:'neon',seed:23,
 primaryLoadout:'akm',profile:'director-engagement-episode-lab',
 directorEpisodeAssignment:{...a,seed:23,arm:a.actuate?'treatment':'control',design:'randomized-episode'},
 directorExplorationOffers:0,directorPlanWindows:[],finishedNaturally:true,duration:87,
 kills:2,deaths:1,shots:14,hits:8,damageDealt:198,damageTaken:70};
 const {rows,audit}=extractEpisodeArms([{results:[m]}]);
 assert.equal(rows.length,1);assert.equal(audit.zeroOfferEpisodes,1);
 assert.equal(rows[0].treatmentExposure.selectedCommands,0);
 assert.equal(rows[0].limitations.neuralTrainingReady,false);
});
test('duplicate seed/world context across arms is flagged, not counted as independent',()=>{
 const a=tacticalEpisodeExplorationAssignment(24,.5),m={mode:'tdm',map:'arena',seed:24,
 primaryLoadout:'mp5sd',directorEpisodeAssignment:{...a,seed:24,arm:a.actuate?'treatment':'control',design:'randomized-episode'},
 directorExplorationOffers:1,directorPlanWindows:[],duration:65};
 const {audit}=extractEpisodeArms([{results:[m]},{results:[{...m}]}]);
 assert.equal(audit.episodes,2);assert.equal(audit.duplicateContexts,1);
});
test('invalid or malformed episode assignment is rejected',()=>{
 const a=tacticalEpisodeExplorationAssignment(32,.5),m={mode:'tdm',map:'arena',seed:32,
 primaryLoadout:'akm',directorEpisodeAssignment:{...a,actuate:!a.actuate,
 arm:a.actuate?'control':'treatment',design:'randomized-episode'}};
 const {rows,audit}=extractEpisodeArms([{results:[m]}]);
 assert.equal(rows.length,0);assert.equal(audit.invalid,1);
});

test('C6 rejects inconsistent arm labels and design metadata',()=>{
 const a=tacticalEpisodeExplorationAssignment(42,.5),m={mode:'tdm',map:'arena',seed:42,
  primaryLoadout:'mp5sd',directorEpisodeAssignment:{...a,arm:a.actuate?'treatment':'control',design:'randomized-episode'}};
 const mutations=[
  {arm:a.actuate?'control':'treatment'},
  {controlProbability:0.9},
  {algorithm:'unknown'},
  {design:'forced-arm-diagnostic'}
 ];
 for(const mutation of mutations){
  const {rows,audit}=extractEpisodeArms([{results:[{...m,directorEpisodeAssignment:{...m.directorEpisodeAssignment,...mutation}}]}]);
  assert.equal(rows.length,0);assert.equal(audit.invalid,1);
 }
});
test('C6 explicitly separates deterministic forced arms from randomized arms',()=>{
 for(const p of [0,1]){
  const a=tacticalEpisodeExplorationAssignment(131,p);
  const row={mode:'tdm',map:'arena',seed:131,primaryLoadout:'akm',
   directorEpisodeAssignment:{...a,arm:a.actuate?'treatment':'control',design:'forced-arm-diagnostic'},
   directorExplorationOffers:0,duration:50};
  const {rows,audit}=extractEpisodeArms([{results:[row]}]);
  assert.equal(rows.length,1);assert.equal(audit.forced,1);
  assert.equal(rows[0].limitations.validRandomizedStudy,false);
 }
});
