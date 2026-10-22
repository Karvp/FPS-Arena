#!/usr/bin/env node
// Export *executed*, authoritative outcome observations for a future learned
// option policy. This is on-policy observational data, NOT counterfactual
// superiority labels; untouched shadow proposals are never included.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const finiteOrNull=x=>Number.isFinite(x)?x:null;
const nonnegative=x=>Number.isFinite(x)&&x>=0?x:0;
export function extractDirectorTrajectories(report){
 const matches=Array.isArray(report?.results)?report.results:Array.isArray(report?.rows)?report.rows:Array.isArray(report)?report:[];
 const rows=[];
 for(const match of matches){
  const duration=match?.duration;
  if(match?.errors>0||!Number.isFinite(duration))continue;
  // C4 has an independent fixed-horizon ledger driven by authoritative server
  // events and actual command selection. Prefer it to legacy during-plan counts.
  if(Array.isArray(match.directorOutcomeWindows)){
   for(const win of match.directorOutcomeWindows){
    if(!Number.isInteger(win.planId)||!Number.isFinite(win.selectedAt)||
       !Number.isFinite(win.observationEnd)||win.observationEnd<win.selectedAt||
       !Number.isFinite(win.horizonSeconds)||win.horizonSeconds<=0)continue;
    const isComplete=win.horizonComplete===true && !win.overlappingHorizon;
    rows.push({
     schema:'fpsarena-executed-engagement-observation-v2',
     provenance:{mode:match.mode,map:match.map,seed:match.seed,
       profile:match.profile,primaryLoadout:match.primaryLoadout??match.weapon??null,
       opponentPolicy:match.opponentPolicy??null,server:'authoritative-headless',
       observationalOnly:true,causalEffectEstimated:false},
     option:{planId:win.planId,type:win.type,targetId:String(win.targetId??''),
       plannedAtSeconds:finiteOrNull(win.plannedAt),selectedAtSeconds:win.selectedAt,
       ownershipEndedAtSeconds:finiteOrNull(win.ownershipEndedAt),
       terminationReason:win.terminationReason??null,ownershipCensored:win.ownershipCensored===true,
       utility:finiteOrNull(win.utility),risk:finiteOrNull(win.risk),
       plannedETA:finiteOrNull(win.plannedETA),terminalETA:finiteOrNull(win.terminalETA),
       routeLength:finiteOrNull(win.routeLength),uncertainty:finiteOrNull(win.uncertainty),
       earlyShotWindow:win.earlyShotWindow===true},
     observation:{seconds:finiteOrNull(win.observedSeconds),horizonSeconds:win.horizonSeconds,
       endSeconds:win.observationEnd,horizonComplete:win.horizonComplete===true,
       overlapsAnotherPlan:win.overlappingHorizon===true,
       duringOwnership:win.duringOwnership??null,afterOwnership:win.afterOwnership??null,
       total:win.observedTotal??null},
     trainingEligibility:{fullyObserved:win.horizonComplete===true,
       featureComplete:[win.utility,win.risk,win.plannedETA].every(Number.isFinite),
       independentObservation:isComplete,
       labelKind:'fixed-horizon-descriptive-only',counterfactualAvailable:false}
    });
   }
   continue;
  }
  for(const plan of match.directorPlanWindows||[]){
   if(plan.commandSelected!==true||!Number.isFinite(plan.start)||!Number.isFinite(plan.end)||
      plan.end<plan.start||!Number.isInteger(plan.planId))continue;
   const censored=plan.censored===true||plan.reason===null||plan.reason===undefined;
   const row={
    schema:'fpsarena-executed-engagement-observation-v1',
    provenance:{mode:match.mode,map:match.map,seed:match.seed,
      profile:match.profile,primaryLoadout:match.primaryLoadout??match.weapon??null,
      opponentPolicy:match.opponentPolicy??null,server:'authoritative-headless',
      observationalOnly:true,causalEffectEstimated:false},
    option:{planId:plan.planId,type:plan.type,targetId:String(plan.targetId??''),
      startSeconds:plan.start,selectedAtSeconds:finiteOrNull(plan.selectedAt),
      endSeconds:plan.end,terminationReason:plan.reason??null,censored,
      featureAvailability:{
       utility:Number.isFinite(plan.utility),risk:Number.isFinite(plan.risk),
       plannedETA:Number.isFinite(plan.plannedETA)},
      utility:finiteOrNull(plan.utility),risk:finiteOrNull(plan.risk),
      plannedETA:finiteOrNull(plan.plannedETA),terminalETA:finiteOrNull(plan.terminalTimeToFire),
      earlyShotWindow:plan.earlyShotWindow===true,
      routeLength:finiteOrNull(plan.routeLength),uncertainty:finiteOrNull(plan.uncertainty)},
    observedDuringSelection:{durationSeconds:+Math.max(0,plan.end-plan.start).toFixed(3),
      shots:nonnegative(plan.shotsDuring),hits:nonnegative(plan.hitsDuring),
      kills:nonnegative(plan.killsDuring),damageTaken:nonnegative(plan.damageTakenDuring),
      metersMoved:finiteOrNull(plan.metersMovedDuring),fireInputTicks:finiteOrNull(plan.fireInputTicks)},
    trainingEligibility:{fullyObserved:!censored,featureComplete:[plan.utility,plan.risk,plan.plannedETA].every(Number.isFinite),
      labelKind:'during-option-descriptive-only',counterfactualAvailable:false}
   };
   rows.push(row);
  }
 }
 return rows;
}
export function summarizeDirectorTrajectories(rows){
 const eligible=rows.filter(r=>r.trainingEligibility.fullyObserved&&r.trainingEligibility.featureComplete);
 const diverseKeys=new Set(rows.map(r=>`${r.provenance.map}|${r.provenance.primaryLoadout}|${r.provenance.seed}`));
 return {selectedPlans:rows.length,fullyObservedFeatureComplete:eligible.length,
  independentConditions:diverseKeys.size,completeNonoverlappingHorizon:rows.filter(r=>r.trainingEligibility.independentObservation===true).length,
  schemaCounts:rows.reduce((m,r)=>(m[r.schema]=(m[r.schema]||0)+1,m),{}),modeCounts:rows.reduce((m,r)=>(m[r.provenance.mode]=(m[r.provenance.mode]||0)+1,m),{}),
  readyForNeuralTraining:false,
  whyNot:'Observational executed actions alone do not reveal counterfactual outcomes; a meaningful model requires more diverse, executed trajectories and independent validation.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const input=process.argv[2],output=process.argv[3];
 if(!input||!output){console.error('Usage: node lab/arena/export-director-trajectories.mjs input.json output.ndjson');process.exit(2);}
 const rows=extractDirectorTrajectories(JSON.parse(readFileSync(input,'utf8')));
 mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 writeFileSync(output,rows.map(x=>JSON.stringify(x)).join('\n')+(rows.length?'\n':''));
 const summary=summarizeDirectorTrajectories(rows);
 writeFileSync(output+'.summary.json',JSON.stringify(summary,null,2)+'\n');
 console.log(summary);
}
