#!/usr/bin/env node
// Additional new-seed natural-end study: full matches are reported even when
// the configured cap truncates the match; never silently call capped a finish.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {C4_PROFILES,verifyPairedRows} from './c4-observation-study.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scenarios=[{map:'arena',weapon:'mp5sd',seed:991301},{map:'neon',weapon:'akm',seed:991401}];
const dest=path.resolve(process.argv[2]||path.join(root,'reports','c4-natural'));
mkdirSync(dest,{recursive:true});
const docs=[];
for(const c of scenarios)for(const profile of C4_PROFILES){
 const out=path.join(dest,`${c.map}-${c.weapon}-${profile}.json`);
 const args=['lab/arena/train.mjs','--full-match','--profile',profile,'--modes','tdm',
  '--seconds','480','--episodes','1','--seed',String(c.seed),'--classic-maps',c.map,
  '--bots','5','--opponents','stress','--trainee-primary',c.weapon,'--lag-ms','65','--out',out];
 const p=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:5*1024*1024});
 if(p.status!==0)throw Error(`Natural study ${c.map}/${profile}: ${p.stdout}\n${p.stderr}`);
 const doc=JSON.parse(readFileSync(out,'utf8'));
 if(doc.results.length!==1||doc.results[0].errors)throw Error('Incomplete natural match');
 docs.push(doc);
 const m=doc.results[0];console.log(`${c.map}/${profile}: ${m.kills}K ${m.deaths}D ${m.duration}s naturally=${m.finishedNaturally}`);
}
verifyPairedRows(docs);
const rows=docs.flatMap(x=>x.results).map(m=>({seed:m.seed,map:m.map,weapon:m.primaryLoadout,profile:m.profile,
 kills:m.kills,deaths:m.deaths,shots:m.shots,hits:m.hits,damageTaken:m.damageTaken,
 damageDealt:m.damageDealt,duration:m.duration,finishedNaturally:m.finishedNaturally,
 firstShotAt:m.firstShotAt,directorPlanSelectionCount:m.directorPlanSelectionCount,
 complete5s:(m.directorOutcomeWindows||[]).filter(w=>w.horizonComplete).length}));
writeFileSync(path.join(dest,'natural-summary.json'),JSON.stringify({format:'fpsarena-v2911-c4-natural-v1',
 sameSeedAndLoadout:true,newSeeds:true,naturalEndRequirements:'Only rows with finishedNaturally===true qualify',
 crossMatchCaveat:'Different match end times confound raw cumulative kills; not option-level causal labels.',rows},null,2)+'\n');
