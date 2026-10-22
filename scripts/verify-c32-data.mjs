#!/usr/bin/env node
// Independently replay each complete three-arm experiment against the official
// server functions. Strict source fingerprint, provenance and label matching.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {counterfactualC32} from '../lab/arena/counterfactual-fire-c32.mjs';
const root=path.resolve('.'),sha=b=>createHash('sha256').update(b).digest('hex');
const summary={schema:'fpsarena-c32-independent-label-replay-v1',groups:{},allTrials:0,allBranches:0,allMismatches:0};
const allSeeds=new Set();
for(const group of ['encounters','balanced']){
 const dir=path.join(root,'reports/c32',group),plan=JSON.parse(readFileSync(path.join(dir,'PRE-REGISTERED-PLAN.json'))),
  index=JSON.parse(readFileSync(path.join(dir,'INDEX.json')));
 const computedSource=sha(plan.sourceFiles.map(f=>sha(readFileSync(path.join(root,f)))).join('|'));
 if(computedSource!==plan.sourceSHA256)throw Error(group+' source checksum changed');
 if(plan.registrationSHA256!==index.registrationSHA256)throw Error(group+' registration mismatch');
 const rows=[],splits=[['DEVELOPMENT.json','developmentSHA256'],['SEALED-HOLDOUT.json','sealedTestSHA256']];
 for(const [f,key] of splits){const text=readFileSync(path.join(dir,f));
  if(sha(text)!==index[key])throw Error(group+' corruption '+f);
  const d=JSON.parse(text);if(d.registrationSHA256!==plan.registrationSHA256)throw Error('wrong study');
  rows.push(...d.rows);
 }
 const planned=new Map(plan.scenarios.map(x=>[x.scenario.seed,x]));let n=0,collided=0;
 if(rows.length!==planned.size)throw Error('C32 wrong trial count');
 for(const row of rows){
  const s=row.scenario,z=planned.get(s.seed);if(!z||z.split!==row.split||JSON.stringify(z.scenario)!==JSON.stringify(s))throw Error('wrong seed/provenance '+s.seed);
  if(allSeeds.has(s.seed))throw Error('overlapping studies seed '+s.seed);allSeeds.add(s.seed);
  const recomputed=counterfactualC32(s);
  if(JSON.stringify(row.arms)!==JSON.stringify(recomputed.arms)||JSON.stringify(row.publicFeatures)!==JSON.stringify(recomputed.publicFeatures)||
    JSON.stringify(row.worldBoxes)!==JSON.stringify(recomputed.worldBoxes))throw Error('label or geometry tampering at '+s.seed);
  n++;collided+=row.arms.filter(a=>a.blockedTicks>0).length;
 }
 summary.groups[group]={trials:n,branches:n*3,engineMoveCollisionBranches:collided,
  registrationSHA256:plan.registrationSHA256,sourceSHA256:computedSource};
 summary.allTrials+=n;summary.allBranches+=n*3;
 console.error('C32 independently replayed',group,n,'trials');
}
writeFileSync(path.join(root,'reports/c32/INDEPENDENT-REPLAY.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
