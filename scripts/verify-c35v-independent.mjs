#!/usr/bin/env node
/** Independent C21 + causal-time and unlabeled-action integrity check. */
import {readFileSync,writeFileSync} from 'node:fs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const base='reports/c35v/factual-value-24-v1';
const design=JSON.parse(readFileSync(base+'/FROZEN-DESIGN.json','utf8'));
const sums={schema:'fpsarena-c35v-independent-audit-v1',matches:0,offers:0,c21Mismatches:0,
 observerRows:0,completeRows:0,censoredRows:0,unlabeledAlternatives:0,
 fireSuppression:0,fireInjection:0,illegalControllerFire:0,shotMismatch:0,
 upstreamActionMutation:0,agentErrors:0,invalidRows:0};
for(const c of design.cases){
 const prefix=base+'/matches/'+c.id;
 const read=ext=>JSON.parse(readFileSync(prefix+'.'+ext+'.json','utf8'));
 const ds=read('dataset'),r=read('result').aggregate,t=read('motion').traces[0],
   v=read('value').traces[0],g=read('fire').traces[0],h=read('macro').traces[0];
 sums.matches++;sums.agentErrors+=r.agentErrors;
 sums.fireSuppression+=g.counts.fireSuppressionTicks;sums.fireInjection+=g.counts.fireInjectionTicks;
 sums.illegalControllerFire+=t.counts.illegalFire;
 sums.upstreamActionMutation+=h.counts.otherControlsModified;
 if(r.shots!==g.counts.serverShots||t.counts.fireTicks!==g.counts.incumbentFireTicks)sums.shotMismatch++;
 if(v.arm!==c.arm||v.setupId!==c.setupId||v.weapon!==c.gun||v.counts.changedFire!==0||
    v.counts.eligible!==v.rows.length||v.counts.completed+v.counts.censored!==v.rows.length)sums.invalidRows++;
 if(t.counts.modifiedTicks!==t.events.reduce((a,b)=>a+b.ticks,0))sums.invalidRows++;
 if(c.arm==='observe'&&t.counts.modifiedTicks!==0)sums.invalidRows++;
 for(const offer of ds.matches[0].offers){
  sums.offers++;const n=Number(offer.offerId.split(':').at(-1));
  if(!Number.isSafeInteger(n)||offer.assignedAction!==assignedActionC21(c.seed,n))sums.c21Mismatches++;
  if(offer.validity?.preActionPublicFeaturesOnly!==true)sums.invalidRows++;
 }
 for(const row of v.rows){
  sums.observerRows++;if(row.factual)sums.completeRows++;else if(row.censored)sums.censoredRows++;else sums.invalidRows++;
  sums.unlabeledAlternatives+=row.actions.length;
  if(row.actions.length!==8||row.actions.some(q=>q.factualOutcome!==null)||
     row.factual&&row.factual.source!=='SERVER_AFTER_STEP_OBSERVED_ACTION_ONLY'||
     row.setupId!==c.setupId||row.arm!==c.arm||!Number.isFinite(row.features?.ageMs)||
     row.features.ageMs<0||row.features.ageMs>275.01)sums.invalidRows++;
 }
}
sums.pass=['c21Mismatches','fireSuppression','fireInjection','illegalControllerFire','shotMismatch',
'upstreamActionMutation','agentErrors','invalidRows'].every(k=>sums[k]===0);
writeFileSync(base+'/C35V-INDEPENDENT-AUDIT.json',JSON.stringify(sums,null,2)+'\n');
console.log(JSON.stringify(sums));if(!sums.pass)process.exitCode=1;
