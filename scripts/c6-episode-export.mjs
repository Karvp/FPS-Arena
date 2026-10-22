#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
/** One record per assigned episode, even for matches with zero eligible offers.
 * Deliberately excludes per-offer treatment labels and causal effect estimates.
 */
export function extractEpisodeArms(documents){
 const rows=[],seen=new Set(),audit={episodes:0,randomized:0,forced:0,treatment:0,control:0,
  duplicateContexts:0,zeroOfferEpisodes:0,plansSelected:0,invalid:0,
  fullMatches:0,censoredMatches:0};
 for(const doc of documents){
  if(!Array.isArray(doc?.results))throw Error('Missing results');
  for(const m of doc.results){
   const a=m.directorEpisodeAssignment;
   if(!a)continue;
   const p=a.actionProbability;
   const randomized=Number.isFinite(p)&&p>0&&p<1;
   if(!Number.isSafeInteger(a.seed)||!Number.isFinite(a.draw)||a.draw<0||a.draw>=1||
      !Number.isFinite(p)||p<0||p>1||
      !Number.isFinite(a.controlProbability)||Math.abs(a.controlProbability-(1-p))>1e-12||
      a.actuate!==(a.draw<p)||a.arm!==(a.actuate?'treatment':'control')||
      a.unit!=='episode'||a.algorithm!=='episode-hash-bernoulli-v1'||
      a.design!==(randomized?'randomized-episode':'forced-arm-diagnostic')||
      a.assignmentId!==`episode-${a.seed}`||m.seed!==a.seed||
      !m.mode||!m.map||!m.primaryLoadout){audit.invalid++;continue;}
   const key=`${m.mode}/${m.map}/${m.seed}/${m.primaryLoadout}`;
   if(seen.has(key))audit.duplicateContexts++;else seen.add(key);
   audit.episodes++;audit[a.design==='randomized-episode'?'randomized':'forced']++;
   audit[a.actuate?'treatment':'control']++;
   if(!m.directorExplorationOffers)audit.zeroOfferEpisodes++;
   const plans=(m.directorPlanWindows||[]).filter(p=>p.commandSelected).length;
   audit.plansSelected+=plans;
   if(m.finishedNaturally)audit.fullMatches++;else audit.censoredMatches++;
   rows.push({format:'fpsarena-c6-episode-exploration-v1',unit:'episode',context:key,
    provenance:{mode:m.mode,map:m.map,seed:m.seed,weapon:m.primaryLoadout,
      profile:m.profile??doc.profile,game:'authoritative-headless-Game.step'},
    assignment:{arm:a.arm,probability:a.actionProbability,draw:a.draw,
      assignmentId:a.assignmentId,design:a.design},
    treatmentExposure:{eligibleOffers:m.directorExplorationOffers??0,
      selectedCommands:plans},
    outcome:{kills:m.kills,deaths:m.deaths,shots:m.shots,hits:m.hits,
      damageDealt:m.damageDealt,damageTaken:m.damageTaken,
      matchFinishedNaturally:!!m.finishedNaturally,duration:m.duration},
    limitations:{counterfactualObserved:false,
      validRandomizedStudy:a.design==='randomized-episode'&&a.actionProbability>0&&a.actionProbability<1,
      causalClaimMade:false,neuralTrainingReady:false}});
  }
 }
 audit.independentContextCount=seen.size;
 audit.readyForCausalInference=false;
 audit.reason='Safety eligibility is rare; inspect arm balance, independent matches, opponent effects and uncertainty before causal inference';
 return {rows,audit};
}
async function main(){
 if(process.argv.length<4)throw Error('Usage: node scripts/c6-episode-export.mjs <dir> <train-output.json> ...');
 const dir=path.resolve(process.argv[2]);mkdirSync(dir,{recursive:true});
 const docs=process.argv.slice(3).map(f=>JSON.parse(readFileSync(f,'utf8')));
 const {rows,audit}=extractEpisodeArms(docs);
 writeFileSync(path.join(dir,'episodes.ndjson'),rows.map(x=>JSON.stringify(x)).join('\n')+(rows.length?'\n':''));
 writeFileSync(path.join(dir,'audit.json'),JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify(audit,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
