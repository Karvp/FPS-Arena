#!/usr/bin/env node
// Independent C21 hash audit on frozen C35U three-arm experiments.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const root='reports/c35u/weapon-balance-36-v1';
const d=JSON.parse(readFileSync(root+'/FROZEN-DESIGN.json','utf8'));
const o={schema:'fpsarena-c35u-c21-independent-v1',researchMatches:0,offers:0,assignmentMismatches:0,
 fireSuppression:0,fireInjection:0,shotDisagreements:0,illegalMotionChanges:0,agentErrors:0,invalidProvenance:0};
for(const c of d.cases.filter(x=>x.arm!=='release')){
 const pref=path.join(root,'matches',c.id),parse=s=>JSON.parse(readFileSync(pref+'.'+s+'.json','utf8'));
 const ds=parse('dataset').matches[0],t=parse('motion').traces[0],g=parse('fire').traces[0],r=parse('result').aggregate;
 o.researchMatches++;o.fireSuppression+=g.counts.fireSuppressionTicks;o.fireInjection+=g.counts.fireInjectionTicks;
 o.illegalMotionChanges+=t.counts.illegalFire;o.agentErrors+=r.agentErrors;
 if(r.shots!==g.counts.serverShots||t.counts.fireTicks!==g.counts.incumbentFireTicks)o.shotDisagreements++;
 if(t.events.length!==t.counts.offers||t.events.some(e=>e.ticks<0||e.ticks>2))o.invalidProvenance++;
 for(const offer of ds.offers){
  o.offers++;const n=Number(offer.offerId.split(':').at(-1));
  if(!Number.isSafeInteger(n)||offer.assignedAction!==assignedActionC21(c.seed,n))o.assignmentMismatches++;
  if(offer.validity?.preActionPublicFeaturesOnly!==true)o.invalidProvenance++;
 }
}
o.pass=!Object.entries(o).some(([k,v])=>['assignmentMismatches','fireSuppression','fireInjection','shotDisagreements','illegalMotionChanges','agentErrors','invalidProvenance'].includes(k)&&v!==0);
writeFileSync(root+'/C35U-INDEPENDENT-AUDIT.json',JSON.stringify(o,null,2)+'\n');
console.log(JSON.stringify(o));if(!o.pass)process.exitCode=1;
