#!/usr/bin/env node
/** Fixed-match, episode-randomized headless research. Not a causal-effect estimator.
 * Run with --seconds 65 --episodes 2 (default), all studies preregistered below.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractEpisodeArms} from './c6-episode-export.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scenarios=[
 {map:'arena',weapon:'mp5sd',seed:1181101},
 {map:'foundry',weapon:'benelli_m4',seed:1183101},
 {map:'neon',weapon:'akm',seed:1185101}];
const profiles=['release','director-engagement-episode-lab'];
async function main(){
 const arg=(s,d)=>{const k=process.argv.indexOf('--'+s);return k>=0?process.argv[k+1]:d;};
 const ep=Number(arg('episodes','2')),seconds=Number(arg('seconds','65'));
 if(!Number.isInteger(ep)||ep<1||ep>20||!Number.isFinite(seconds)||seconds<5||seconds>1200)throw Error('Invalid study settings');
 const dir=path.resolve(arg('out-dir',path.join(root,'reports','c6-episode-study')));
 mkdirSync(dir,{recursive:true});const rows=[],armDocs=[];
 for(const scenario of scenarios){
   const docs={};
   for(const profile of profiles){
     const dest=path.join(dir,`${scenario.map}-${profile}.json`);
     const args=['lab/arena/train.mjs','--profile',profile,'--modes','tdm','--seed',String(scenario.seed),
       '--episodes',String(ep),'--seconds',String(seconds),'--classic-maps',scenario.map,
       '--trainee-primary',scenario.weapon,'--bots','5','--opponents','stress','--lag-ms','65','--out',dest];
     const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
     if(result.status!==0)throw Error(`${scenario.map}/${profile}: ${result.stderr}\n${result.stdout}`);
     const doc=JSON.parse(readFileSync(dest,'utf8'));
     if(doc.results.length!==ep||doc.seed!==scenario.seed||doc.profile!==profile)throw Error('Incomplete episode');
     docs[profile]=doc;
     if(profile!== 'release')armDocs.push(doc);
   }
   for(let i=0;i<ep;i++){
     const baseline=docs.release.results[i],trial=docs['director-engagement-episode-lab'].results[i];
     if(trial.seed!==baseline.seed||trial.map!==baseline.map||trial.primaryLoadout!==baseline.primaryLoadout)throw Error('Pair mismatch');
     rows.push({map:scenario.map,weapon:scenario.weapon,seed:trial.seed,
       arm:trial.directorEpisodeAssignment?.arm,assigned:trial.directorEpisodeAssignment,
       baseline:{kills:baseline.kills,deaths:baseline.deaths,shots:baseline.shots,damageTaken:baseline.damageTaken,errors:baseline.errors},
       assignedEpisode:{kills:trial.kills,deaths:trial.deaths,shots:trial.shots,damageTaken:trial.damageTaken,errors:trial.errors,
         selectedPlans:trial.directorPlanSelectionCount,eligibleOffers:trial.directorExplorationOffers},
       diagnosticDeltaKills:trial.kills-baseline.kills});
   }
 }
 const {rows:records,audit}=extractEpisodeArms(armDocs);
 const summary={format:'fpsarena-c6-episode-randomized-paired-v1',base:'2.9.11-C5',
  mainRepositorySync:'UNVERIFIED; cannot access private or missing GitHub repository forgothtp/fps-arena',
  samplingUnit:'whole episode',assignment:'deterministic Bernoulli p=0.5 from episode seed, not game RNG',
  comparison:'release is diagnostic paired benchmark; no individual plan counterfactual',
  eligibility:['Each offer is still shielded by unchanged C5 geometry, route, combat, reload and risk vetoes',
    'Treatment uses C5 already-safe offer gate with exploration p=1 for the entire episode'],
  limitations:['Small, nonrepresentative deterministic seed sample','Paired runs share seed but arm assigned only in experimental profile',
    'Safety-qualified offers are rare','Zero eligible offers implies no treatment exposure',
    'No human/browser/GPU testing','Do not train neural policy or claim uplift from this sample'],
  scenarios,profiles,seconds,episodes:ep,rows,episodeAudit:audit,executedEpisodeCount:records.length};
 writeFileSync(path.join(dir,'paired-summary.json'),JSON.stringify(summary,null,2)+'\n');
 writeFileSync(path.join(dir,'episodes.ndjson'),records.map(x=>JSON.stringify(x)).join('\n')+'\n');
 console.log(JSON.stringify({runs:rows.length*2,seedGroups:rows.length,armCount:audit,paired:rows.map(x=>({seed:x.seed,arm:x.arm,deltaKills:x.diagnosticDeltaKills,offers:x.assignedEpisode.eligibleOffers}))},null,2));
}
if(fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
