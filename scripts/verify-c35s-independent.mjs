#!/usr/bin/env node
// Read-only independent audit of BOTH C35S shadow arms; SHA locked prereg is separately audited in Python.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const root=path.resolve('reports/c35s/shotgun-gap-close-36-v2');
const design=JSON.parse(readFileSync(root+'/FROZEN-DESIGN.json','utf8'));
const stats={schema:'fpsarena-c35s-independent-c21-audit-v1',cases:0,offers:0,assignmentMismatches:0,
  fireSuppression:0,fireInjection:0,shotDisagreements:0,modifiedInputs:0,agentErrors:0,invalidProvenance:0};
for(const c of design.cases.filter(x=>x.arm!=='release')){
 const p=path.join(root,'matches',c.id);
 const data=JSON.parse(readFileSync(p+'.dataset.json')).matches[0];
 const g=JSON.parse(readFileSync(p+'.fire.json')).traces[0];
 const s=JSON.parse(readFileSync(p+'.approach.json')).traces[0];
 const res=JSON.parse(readFileSync(p+'.result.json')).aggregate;
 stats.cases++;stats.fireSuppression+=g.counts.fireSuppressionTicks;
 stats.fireInjection+=g.counts.fireInjectionTicks;
 stats.modifiedInputs+=s.counts.modifiedTicks;
 stats.agentErrors+=res.agentErrors;
 if(res.shots!==g.counts.serverShots||res.shots!==s.counts.fireTicks)stats.shotDisagreements++;
 if(s.events.length!==s.counts.episodes)stats.invalidProvenance++;
 for(const o of data.offers){
  stats.offers++;
  const n=Number(o.offerId.split(':').at(-1));
  if(!Number.isSafeInteger(n)||o.assignedAction!==assignedActionC21(c.seed,n))stats.assignmentMismatches++;
  if(o.validity?.preActionPublicFeaturesOnly!==true)stats.invalidProvenance++;
 }
}
stats.pass=stats.assignmentMismatches===0&&stats.fireSuppression===0&&stats.fireInjection===0&&stats.shotDisagreements===0&&stats.modifiedInputs===0&&stats.agentErrors===0&&stats.invalidProvenance===0;
writeFileSync(root+'/C35S-INDEPENDENT-AUDIT.json',JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify(stats));if(!stats.pass)process.exitCode=1;
