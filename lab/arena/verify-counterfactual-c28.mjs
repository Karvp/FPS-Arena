#!/usr/bin/env node
// Independent replay/provenance audit, including every action's authoritative
// fireWeapon output; intentionally reads test only AFTER frozen policy exists.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {counterfactualC28,C28_ACTIONS} from './counterfactual-fire-c28.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dir=path.resolve(process.argv[2]||'reports/c28/micro-v1');
const read=n=>JSON.parse(readFileSync(path.join(dir,n),'utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const plan=read('PRE-REGISTERED-PLAN.json'),idx=read('DATASET-INDEX.json'),frozen=read('FROZEN-POLICY.json');
const sourceSHA256=digest(plan.sourceFiles.map(p=>digest(readFileSync(path.join(root,p)))).join('|'));
const {registrationSHA256,...body}=plan;
if(digest(JSON.stringify(body))!==registrationSHA256||plan.sourceSHA256!==sourceSHA256||
 idx.registrationSHA256!==registrationSHA256||frozen.planSHA256!==registrationSHA256||!frozen.researchOnly||frozen.promotion!==false)
 throw Error('C28 plan/source/frozen-policy provenance mismatch');
for(const [filename,key] of [['DEVELOPMENT.json','developmentSHA256'],['SEALED-HOLDOUT.json','sealedHoldoutSHA256'],
 ['ALL-COUNTERFACTUAL-OUTCOMES.json','allSHA256']])if(digest(readFileSync(path.join(dir,filename)))!==idx[key])throw Error('C28 raw dataset mutated: '+filename);
const combined=read('ALL-COUNTERFACTUAL-OUTCOMES.json');
if(combined.rows.length!==plan.scenarios.length)throw Error('C28 incomplete dataset');
const splitCounts={train:0,validation:0,test:0},used=new Set();
for(let i=0;i<combined.rows.length;i++){
 const row=combined.rows[i],p=plan.scenarios[i];
 if(row.split!==p.split||used.has(p.seed)||Object.keys(splitCounts).every(k=>k!==p.split))throw Error('C28 split duplicate/mismatch');
 used.add(p.seed);splitCounts[p.split]++;
 const {split,...s}=p;
 const replay=counterfactualC28(s);
 if(JSON.stringify(replay)!==JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>k!=='split'))))
  throw Error('C28 authoritative arm replay differs: '+p.seed);
 if(replay.arms.some((a,j)=>a.action!==C28_ACTIONS[j]||a.cappedLoss<0||a.cappedLoss>150||!Number.isFinite(a.uncappedDamage)))
  throw Error('C28 damage/arm fields corrupted');
}
const dev=read('DEVELOPMENT.json'),test=read('SEALED-HOLDOUT.json');
const expected=combined.rows;
if(JSON.stringify(dev.rows)!==JSON.stringify(expected.filter(r=>r.split!=='test'))||
 JSON.stringify(test.rows)!==JSON.stringify(expected.filter(r=>r.split==='test'))||
 JSON.stringify(splitCounts)!==JSON.stringify({train:432,validation:144,test:144}))throw Error('C28 split files invalid');
const report={schema:'fpsarena-c28-audited-replay-v1',sourceSHA256,registrationSHA256,
  replayedScenarios:combined.rows.length,replayedArms:combined.rows.length*3,
  splitCounts,holdoutNotUsedForTraining:frozen.holdoutLabelsOpenedDuringFreeze===false,
  productionActuation:false,integrity:'PASS'};
writeFileSync(path.join(dir,'REPLAY-AUDIT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
