#!/usr/bin/env node
// Independent C35-R dataset replay of the immutable C21 assignment hash.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const root=path.resolve('reports/c35r/paired-24-v1');
const design=JSON.parse(readFileSync(root+'/FROZEN-DESIGN.json','utf8'));
let offers=0,errors=0,modifiedFire=0,shots=0,pellets=0,samples=0,missing=0;
for(const c of design.cases.filter(x=>x.policy==='shadow80')){
 const p=path.join(root,'matches',c.id);
 const data=JSON.parse(readFileSync(p+'.dataset.json')).matches[0];
 const ballistic=JSON.parse(readFileSync(p+'.ballistic.json')).traces[0];
 const decision=JSON.parse(readFileSync(p+'.decision.json')).traces[0];
 const result=JSON.parse(readFileSync(p+'.result.json')).aggregate;
 for(const offer of data.offers){
  offers++;const ordinal=Number(offer.offerId.split(':').at(-1));
  if(!Number.isSafeInteger(ordinal)||offer.assignedAction!==assignedActionC21(c.seed,ordinal))errors++;
  if(offer.validity?.preActionPublicFeaturesOnly!==true)missing++;
 }
 if(data.offers.length!==data.diagnostics.offers)missing++;
 if(ballistic.counts.confirmedShots!==decision.counts.confirmedShots||ballistic.counts.confirmedShots!==result.shots)missing++;
 if(ballistic.counts.fireModified||decision.counts.modifiedCommands)modifiedFire++;
 shots+=ballistic.counts.confirmedShots;pellets+=ballistic.counts.confirmedPellets;
 samples+=decision.counts.candidateSamples;
}
const out={schema:'fpsarena-c35r-independent-audit-v1',pairs:12,offers,assignmentMismatches:errors,
 missingProvenance:missing,fireModificationViolations:modifiedFire,confirmedShots:shots,
 confirmedPellets:pellets,decisionSamples:samples,pass:errors===0&&missing===0&&modifiedFire===0};
writeFileSync(root+'/C35R-INDEPENDENT-AUDIT.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out));
if(!out.pass)process.exit(1);
