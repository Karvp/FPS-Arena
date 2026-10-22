#!/usr/bin/env node
// C5 preregistered seed-paired observational study. Exploratory profile
// randomizes *eligible offers*; matched whole matches are not per-offer counterfactuals.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const profiles=['release','director-engagement-coverage-lab','director-engagement-exploration-lab'];
export const scenarios=[{map:'arena',weapon:'mp5sd',seed:963101},
 {map:'foundry',weapon:'benelli_m4',seed:974201},
 {map:'neon',weapon:'akm',seed:985301}];
export function auditExploration(report){
 if(!report?.rows||!Array.isArray(report.rows))throw Error('Invalid study');
 const tallies={};
 for(const p of profiles){tallies[p]={kills:0,deaths:0,shots:0,errors:0,plans:0,offers:0,assigned:0,
  controls:0,completeWindows:0,improved:0,worsened:0,tied:0};}
 for(const row of report.rows){
  if(!scenarios.some(s=>s.map===row.map&&s.weapon===row.weapon))throw Error('Bad scenario');
  if(Object.keys(row.profiles).length!==profiles.length)throw Error('Incomplete profile group');
  const base=row.profiles.release;
  for(const profile of profiles){
   const d=row.profiles[profile],x=tallies[profile];
   if(!d||d.seed!==row.seed||d.map!==row.map||d.weapon!==row.weapon||d.errors)throw Error('Malformed paired row');
   if(d.offers!==d.assigned+d.controls)throw Error('Incorrect randomized assignments');
   if(d.plans>d.assigned&&profile==='director-engagement-exploration-lab')throw Error('Plan without treatment offer');
   x.kills+=d.kills;x.deaths+=d.deaths;x.shots+=d.shots;x.errors+=d.errors;
   x.plans+=d.plans;x.offers+=d.offers;x.assigned+=d.assigned;x.controls+=d.controls;
   x.completeWindows+=d.completeWindows;
   const delta=d.kills-base.kills;
   if(delta>0)x.improved++;else if(delta<0)x.worsened++;else x.tied++;
  }
 }
 return tallies;
}
async function main(){
 const arg=(key,fallback)=>{let i=process.argv.indexOf('--'+key);return i>=0?process.argv[i+1]:fallback;};
 const episodes=Number(arg('episodes','4')),seconds=Number(arg('seconds','65'));
 if(!Number.isInteger(episodes)||episodes<1||episodes>40||!Number.isFinite(seconds)||seconds<5||seconds>1200)throw Error('Invalid C5 study settings');
 const dir=path.resolve(arg('out-dir',path.join(root,'reports','c5-preregistered')));
 mkdirSync(dir,{recursive:true});const rows=[];
 const documents=new Map();
 for(const s of scenarios)for(const p of profiles){
  const file=path.join(dir,`${s.map}-${s.weapon}-${p}.json`);
  if(!process.argv.includes('--resume')||!existsSync(file)){
   const args=['lab/arena/train.mjs','--profile',p,'--modes','tdm','--seconds',String(seconds),
     '--episodes',String(episodes),'--seed',String(s.seed),'--classic-maps',s.map,
     '--bots','5','--opponents','stress','--trainee-primary',s.weapon,
     '--lag-ms','65','--out',file];
   const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
   if(run.status!==0)throw Error(`Simulation failed ${s.map}/${p}: ${run.stderr}\n${run.stdout}`);
  }
  const doc=JSON.parse(readFileSync(file,'utf8'));
  if(doc.results.length!==episodes||doc.seed!==s.seed||doc.seconds!==seconds||doc.profile!==p||doc.traineePrimary!==s.weapon)throw Error('Study mismatch '+file);
  documents.set(`${s.map}|${p}`,doc);
  console.log(`${s.map}/${p}: ${doc.aggregate.kills} kills`);
 }
 for(const s of scenarios)for(let i=0;i<episodes;i++){
  const seed=s.seed+i*101;
  const row={map:s.map,weapon:s.weapon,seed,profiles:{}};
  for(const profile of profiles){
   const doc=documents.get(`${s.map}|${profile}`);
   const m=doc.results[i];
   const assignments=m.directorExplorationAssignments||[];
   row.profiles[profile]={map:m.map,seed:m.seed,weapon:m.primaryLoadout,
     kills:m.kills,deaths:m.deaths,shots:m.shots,errors:m.errors,
     damageDealt:m.damageDealt,damageTaken:m.damageTaken,
     plans:m.directorPlanSelectionCount,offers:assignments.length,
     assigned:assignments.filter(a=>a.actuate).length,
     controls:assignments.filter(a=>!a.actuate).length,
     completeWindows:(m.directorOutcomeWindows||[]).filter(w=>w.horizonComplete).length,
     assignments,selectedPlans:(m.directorPlanWindows||[]).filter(x=>x.commandSelected),
     selectedOutcomes:m.directorOutcomeWindows||[]};
  }
  rows.push(row);
 }
 const report={format:'fpsarena-v2911-c5-preregistered-paired-v1',
  sourceVersion:'2.9.11-C5',studyMode:'headless authoritative TDM, fixed duration',
  caveats:['Eligibility conditional randomization only; no episode-level random treatment assignment',
    'No counterfactual per plan','Server outcomes after ownership do not imply plan causality',
    'No human opponents or browser-rendered play'],
  assignmentPolicy:{arm:'exploration',probability:.5,method:'hash-bernoulli-v1',
    sampling:'per safety-qualified offer, not per episode',independentOfGameRng:true},
  seedPlan:'Fixed before evaluation; unused by prior C4 study',profiles,scenarios,
  episodesPerScenario:episodes,secondsPerMatch:seconds,rows};
 report.summary=auditExploration(report);
 const out=path.join(dir,'paired-summary.json');writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.summary,null,2));console.log('Saved '+out);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
