#!/usr/bin/env node
// Independent server re-execution of all C33 map-counterfactual labels.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {encounterC33,sampleScenarioC33} from '../lab/arena/map-encounter-c33.mjs';
import {refinedEncounterC33,sampleRefinedC33} from '../lab/arena/map-encounter-refined-c33.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const root=path.resolve('.');
const audited=[],seen=new Set();
for(const [group,sample,enc] of [['map-cohort',sampleScenarioC33,encounterC33],
 ['refined-cohort',sampleRefinedC33,refinedEncounterC33]]){
 const dir=path.resolve('reports/c33',group),read=n=>JSON.parse(readFileSync(path.join(dir,n)));
 const plan=read('PRE-REGISTERED-PLAN.json'),idx=read('INDEX.json'),frozen=read('FROZEN-MODEL.json'),
 selection=read('MODEL-SELECTION-PLAN.json');
 if(idx.registrationSHA256!==plan.registrationSHA256||frozen.registrationSHA256!==plan.registrationSHA256||
 selection.registrationSHA256!==plan.registrationSHA256)throw Error('registration mismatches');
 const computedSHA=sha(plan.sourceFiles.map(f=>sha(readFileSync(path.join(root,f)))).join('|'));
 if(idx.sourceSHA256!==computedSHA||idx.sourceSHA256!==plan.sourceSHA256)throw Error('source checksum modified');
 for(const [part,file] of [['development','DEVELOPMENT.json'],['test','SEALED-HOLDOUT.json']]){
  if(sha(readFileSync(path.join(dir,file)))!==idx[part==='test'?'sealedTestSHA256':'developmentSHA256'])throw Error('dataset changed');
 }
 let matches=0,coll=0,changed=0,shots=0,armMatches=0;
 const planRows=plan.rows.map(x=>JSON.stringify(x));
 const recorded=[...read('DEVELOPMENT.json').rows,...read('SEALED-HOLDOUT.json').rows];
 const planMap=new Map(plan.rows.map(x=>[x.scenario.seed,x]));
 if(recorded.length!==plan.rows.length||recorded.length!==3240)throw Error('unexpected cohort size');
 for(const [i,r] of recorded.entries()){
  const s=r.scenario,expect=planMap.get(s.seed);
  if(!expect||expect.split!==r.split||JSON.stringify(expect.scenario)!==JSON.stringify(s)||seen.has(s.seed))throw Error('seed/split mutation');
  seen.add(s.seed);
  const recomputed=sample(s.seed,s.map,s.weaponId);
  if(JSON.stringify(recomputed)!==JSON.stringify(s))throw Error(`sampler changed ${s.seed}`);
  const independently=enc(recomputed);independently.split=r.split;
  if(JSON.stringify(independently)!==JSON.stringify(r))throw Error(`counterfactual label changed ${s.seed}`);
  matches++;armMatches+=3;coll+=r.arms.some(a=>a.blockedTicks>0);changed+=new Set(r.arms.map(a=>a.cappedLoss)).size>1;
  shots+=r.arms.reduce((a,b)=>a+b.shots,0);
  if(i%900===0)console.error(`${group}: replay ${i}/${recorded.length}`);
 }
 audited.push({group,scenarios:matches,arms:armMatches,collisionScenarios:coll,actionSensitiveScenarios:changed,
  serverShotEvents:shots,sourceSHA256:computedSHA,registrationSHA256:plan.registrationSHA256,zeroReplayDisagreements:true});
}
const output={schema:'fpsarena-c33-independent-replay-v1',crossCohortSeedOverlap:0,totalScenarios:audited.reduce((a,x)=>a+x.scenarios,0),
 totalArms:audited.reduce((a,x)=>a+x.arms,0),zeroReplayDisagreements:true,studies:audited};
writeFileSync('reports/c33/INDEPENDENT-REPLAY.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
