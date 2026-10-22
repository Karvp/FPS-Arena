#!/usr/bin/env node
// Consolidate actual selected-command observations from independent matches.
// The output cannot be used as action-superiority/counterfactual labels.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {extractDirectorTrajectories,summarizeDirectorTrajectories} from '../lab/arena/export-director-trajectories.mjs';
export const C4_PROFILES=['release','director-engagement-recovery-lab','director-engagement-coverage-lab'];
export function scenarioKey(m){return `${m.map}|${m.primaryLoadout}|${m.seed}|${m.mode}`;}
export function verifyPairedRows(documents,profiles=C4_PROFILES){
 if(!Array.isArray(documents)||!documents.length)throw Error('Study must provide matches');
 const byKey=new Map();
 for(const doc of documents){
  if(!doc||!Array.isArray(doc.results))throw Error('Invalid simulation output');
  for(const m of doc.results){
   if(!profiles.includes(m.profile)||!['tdm','snd','hp','br','zm'].includes(m.mode)||
    !Number.isInteger(m.seed)||!m.map||!m.primaryLoadout||
    !Number.isFinite(m.duration)||m.duration<0||m.errors!==0||
    m.gameCode!=='authoritative-server')throw Error('Malformed/incomplete authoritative match');
   const key=scenarioKey(m);
   const bucket=byKey.get(key)||new Map();
   if(bucket.has(m.profile))throw Error('Duplicate profile in seed '+key);
   bucket.set(m.profile,m);byKey.set(key,bucket);
  }
 }
 for(const [key,bucket]of byKey){
  if(bucket.size!==profiles.length||profiles.some(p=>!bucket.has(p)))throw Error('Missing paired profile: '+key);
  const matches=[...bucket.values()];
  if(new Set(matches.map(m=>m.opponentPolicy)).size!==1)throw Error('Opponent mismatch: '+key);
  if(new Set(matches.map(m=>m.seconds)).size!==1)throw Error('Duration target mismatch: '+key);
 }
 return byKey;
}
// Stable study partition, grouped by scenario seed; never split versions of one
// encounter across train/evaluation. This partition is bookkeeping, not a fit.
export function splitForEvaluation(key){
 let h=2166136261;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619)>>>0;
 return h%10<6?'discovery':h%10<8?'validation':'holdout';
}
export function consolidateStudy(documents){
 const paired=verifyPairedRows(documents);
 const allMatches=[...paired.values()].flatMap(x=>[...x.values()]);
 const trajectory=extractDirectorTrajectories(allMatches);
 const signatures=new Map();
 const annotated=trajectory.map(row=>{
  const key=`${row.provenance.map}|${row.provenance.primaryLoadout}|${row.provenance.seed}|${row.provenance.mode}`;
  // Cross-profile changes are not independent interventions even if action
  // timing differs. Fingerprint by plan type + select time with 0.1s tolerance.
  const signature=`${key}|${row.option.type}|${Math.round(row.option.selectedAtSeconds*10)}`;
  const previous=signatures.get(signature);
  if(!previous)signatures.set(signature,row.provenance.profile);
  return {...row,study:{group:key,split:splitForEvaluation(key),
   potentialCrossProfileDuplicate:!!previous,duplicateFirstProfile:previous??null}};
 });
 const groupCount=new Map();
 for(const row of annotated)groupCount.set(row.study.group,(groupCount.get(row.study.group)||0)+1);
 for(const row of annotated)row.study.repeatedScenarioAcrossProfiles=(groupCount.get(row.study.group)||0)>1;
 const duplicateRows=annotated.filter(r=>r.study.potentialCrossProfileDuplicate).length;
 const uniqueContexts=new Set(annotated.map(r=>r.study.group)).size;
 const outcomeRows=annotated.filter(r=>r.schema.endsWith('-v2'));
 const complete=outcomeRows.filter(r=>r.trainingEligibility.independentObservation&&r.trainingEligibility.featureComplete);
 const plannedVsSelected=allMatches.reduce((sum,m)=>sum+(m.directorPlanWindows?.length||0),0);
 const comparison=[...paired].map(([key,v])=>{
  const baseline=v.get('release');
  return {group:key,split:splitForEvaluation(key),
   baseline:{kills:baseline.kills,deaths:baseline.deaths,shots:baseline.shots,damageTaken:baseline.damageTaken},
   variants:Object.fromEntries(C4_PROFILES.slice(1).map(p=>{const m=v.get(p);return [p,{
    kills:m.kills,deaths:m.deaths,shots:m.shots,damageTaken:m.damageTaken,
    killDelta:m.kills-baseline.kills,deathDelta:m.deaths-baseline.deaths,
    selectedPlans:m.directorPlanSelectionCount??0}];}))};
 });
 const adverse=comparison.filter(r=>Object.values(r.variants).some(v=>v.killDelta<0));
 return {trajectory:annotated,comparison,summary:{...summarizeDirectorTrajectories(annotated),
  matches:allMatches.length,matchedGroups:paired.size,plannedWindows:plannedVsSelected,
  uniqueExecutedScenarioContexts:uniqueContexts,potentialCrossProfileDuplicates:duplicateRows,
  completeNonoverlappingWithinMatchFeatureRows:complete.length,
  completeIndependentFeatureRows:complete.length,adverseScenarioGroups:adverse.map(r=>r.group),
  splits:comparison.reduce((a,x)=>(a[x.split]=(a[x.split]||0)+1,a),{}),
  dataUsePolicy:'Descriptive observational-only: no counterfactual labels, no neural training or promotion from this sample.',
  completeWindowsMayShareMatchDynamics:true,evaluationSplitsArePostHoc:true,
  caveat:'An independentObservation flag only means no overlap within one match; it does NOT establish statistical independence across profiles. Post-hoc split labels are not a blinded benchmark.'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const inDir=path.resolve(process.argv[2]||'reports/c4-study'),outDir=path.resolve(process.argv[3]||'reports/c4-dataset');
 const paired=JSON.parse(readFileSync(path.join(inDir,'paired-summary.json'),'utf8'));
 const documents=[];
 for(const c of paired.scenarios)for(const profile of paired.profiles){
  documents.push(JSON.parse(readFileSync(path.join(inDir,`${c.map}-${c.weapon}-${profile}.json`),'utf8')));
 }
 const data=consolidateStudy(documents);mkdirSync(outDir,{recursive:true});
 writeFileSync(path.join(outDir,'selected-observations.ndjson'),data.trajectory.map(r=>JSON.stringify(r)).join('\n')+(data.trajectory.length?'\n':''));
 writeFileSync(path.join(outDir,'observational-audit.json'),JSON.stringify({summary:data.summary,comparison:data.comparison},null,2)+'\n');
 console.log(JSON.stringify(data.summary,null,2));
}
