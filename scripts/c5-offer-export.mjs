#!/usr/bin/env node
// Export C5 decisions with safety/provenance and observability caveats.
// Never convert post-action outcome to treatment effect or assume control outcome.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function extractOffers(docs){
 const rows=[],seen=new Set(),offeredScenarios=new Set(),offerFingerprints=new Set(),audit={matches:0,offers:0,assigned:0,controls:0,
  confirmedSelections:0,completeOutcomeWindows:0,censoredWindows:0,
  potentialCrossProfileDuplicates:0,invalid:0,truncatedMatches:0,uniqueContexts:0,
  uniqueOfferContexts:0,uniqueOfferedScenarios:0};
 for(const doc of docs){
  if(!Array.isArray(doc?.results))throw Error('Missing match results');
  for(const match of doc.results){
   audit.matches++;
   if(match.directorExplorationDropped>0)audit.truncatedMatches++;
   const context=`${match.mode}/${match.map}/${match.primaryLoadout}/${match.seed}`;
   seen.add(context);
   const plans=(match.directorPlanWindows||[]).filter(x=>x.commandSelected);
   const outcomes=match.directorOutcomeWindows||[];
   const assignments=match.directorExplorationAssignments||[];
   if(assignments.length>(match.directorExplorationOffers??assignments.length))throw Error('Invalid offer count');
   for(const a of assignments){
     if(!Number.isInteger(a.attempt)||a.attempt<1||!Number.isFinite(a.t)||
        !Number.isFinite(a.draw)||a.draw<0||a.draw>=1||
        !Number.isFinite(a.actionProbability)||a.actionProbability<0||a.actionProbability>1||
        a.actuate !== (a.draw<a.actionProbability)){
       audit.invalid++;continue;
     }
     audit.offers++;offeredScenarios.add(context);
     // Same world seed, target, near-identical moment and candidate inventory
     // across profile variations are NOT independent training contexts.
     const fingerprint=`${context}|${a.targetId}|${Math.round(a.t*10)}|${(a.eligibleOptions||[]).map(x=>x.type+':'+x.timeToFire).join(';')}`;
     if(offerFingerprints.has(fingerprint))audit.potentialCrossProfileDuplicates++;
     else offerFingerprints.add(fingerprint);
     audit[a.actuate?'assigned':'controls']++;
     const matchPlan=plans.find(p=>p.explorationAttempt===a.attempt &&
       (p.actionProbability===a.actionProbability));
     const outcome=matchPlan?outcomes.find(w=>w.planId===matchPlan.planId):null;
     if(matchPlan)audit.confirmedSelections++;
     if(outcome){if(outcome.horizonComplete)audit.completeOutcomeWindows++;else audit.censoredWindows++;}
     rows.push({format:'fpsarena-c5-randomized-offer-v1',
       provenance:{mode:match.mode,map:match.map,seed:match.seed,
         weapon:match.primaryLoadout,profile:match.profile||doc.profile,context,
         source:'authoritative-headless-game',sampleStatus:'experimental-not-independent-counterfactual'},
       assignment:{timeSeconds:a.t,targetId:a.targetId,attempt:a.attempt,
         draw:a.draw,actionProbability:a.actionProbability,
         controlProbability:a.controlProbability,assignedAction:a.actuate?'director':'baseline',
         eligibleCount:a.eligibleCount,eligibleOptions:a.eligibleOptions,
         conditionalOn:'passing all existing priority, route risk and step shields'},
       execution:{commandSelected:!!matchPlan,planId:matchPlan?.planId??null,
         observedOutcomeWindow:outcome??null,counterfactualAvailable:false,
         temporalCarryoverPossible:true},
       eligibility:{randomizationUnit:'safe decision offer, not episode',
         suitableAsCausalLabel:false,suitableForNeuralTraining:false}});
   }
  }
 }
 audit.uniqueContexts=seen.size;
 audit.uniqueOfferContexts=offerFingerprints.size;
 audit.uniqueOfferedScenarios=offeredScenarios.size;
 return {rows,audit};
}
async function main(){
 if(process.argv.length<4)throw Error('Usage: node scripts/c5-offer-export.mjs output-folder match-file.json ...');
 const dir=path.resolve(process.argv[2]);mkdirSync(dir,{recursive:true});
 const docs=process.argv.slice(3).map(f=>JSON.parse(readFileSync(f,'utf8')));
 const {rows,audit}=extractOffers(docs);
 writeFileSync(path.join(dir,'randomized-offers.ndjson'),rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':''));
 writeFileSync(path.join(dir,'audit.json'),JSON.stringify({...audit,neuralReady:false,
   reason:'No per-offer counterfactual; number of independent, assigned interventions too small'},null,2)+'\n');
 console.log(JSON.stringify(audit,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
