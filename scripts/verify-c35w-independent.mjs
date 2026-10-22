#!/usr/bin/env node
/** Independent source/result audit; all labels come from completed engine datasets. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {assignmentC35W,C35W_ARMS,C35W_P} from '../lab/arena/causal-action-teacher-c35w.mjs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const R=path.resolve(import.meta.dirname,'..'),O=path.join(R,'reports/c35w/randomized-motor-36-v1');
const read=x=>JSON.parse(fs.readFileSync(x,'utf8'));
const sha=x=>crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex');
const d=read(path.join(O,'FROZEN-DESIGN.json')),run=read(path.join(O,'EXECUTION-AUDIT.json'));
for(const [p,h] of Object.entries(d.sourceSHA256))if(sha(path.join(R,p))!==h)throw Error('source drift: '+p);
if(run.registrationSHA256!==sha(path.join(O,'FROZEN-DESIGN.json')))throw Error('registration drift');
if(d.cases.length!==36||run.cases.length!==36)throw Error('incomplete cohort');
let offers=0,modified=0,completed=0,censored=0,old=0,changes=0;const byArm=Object.fromEntries(C35W_ARMS.map(x=>[x,0]));
for(const c of d.cases){
 const rec=run.cases.find(x=>x.id===c.id);if(!rec)throw Error('missing '+c.id);
 const prefix=path.join(O,'matches',c.id),get=(name)=>read(prefix+'.'+name+'.json');
 for(const [key,hash] of Object.entries(rec.sha256)){if(sha(prefix+'.'+key+'.json')!==hash)throw Error('bad SHA '+c.id+' '+key);}
 const result=get('result');if(result.aggregate.agentErrors!==0||result.results.length!==1)throw Error('agent error '+c.id);
 if(c.arm==='release')continue;
 const c35c=get('dataset').matches[0],w=get('random').traces[0],g=get('fire');
 if(c35c.metadata.registrationSHA256!==run.registrationSHA256)throw Error('C21 SHA '+c.id);
 for(let i=0;i<c35c.offers.length;i++){
  const row=c35c.offers[i];if(row.selectedAction!==assignedActionC21(c.seed,i+1))throw Error('C21 bad assignment '+c.id);old++;
 }
 if(w.setupId!==c.setupId||w.seed!==c.seed||w.policy!==c.arm)throw Error('wrong metadata '+c.id);
 if(w.counts.fireChanges!==0)throw Error('fire mutation '+c.id);
 if(w.counts.offers!==w.rows.length)throw Error('offers '+c.id);
 for(const [name,n] of Object.entries(w.counts.assigned))if(n!==w.rows.filter(x=>x.assignedArm===name).length)throw Error('arm count '+c.id);
 for(let i=0;i<w.rows.length;i++){
  const q=w.rows[i],arm=assignmentC35W(c.seed,i+1),slot=C35W_ARMS.indexOf(arm);
  if(q.offerIndex!==i+1||q.assignedArm!==arm||q.propensity!==C35W_P[slot]||
     q.actionSet.length!==3||q.unselectedOutcomes!==null||!q.compliant||q.executedArm!==arm||
     q.actionSet.some(x=>x.safe!==true)||q.actionSet[slot].arm!==arm)throw Error('invalid randomization '+c.id+' '+i);
  if(JSON.stringify(q.requestedAction)!==JSON.stringify(q.executedAction))throw Error('noncompliance '+c.id);
  if(q.censored){if(q.outcome!==null)throw Error('filled censored '+c.id);censored++;}
  else{if(!q.outcome||q.outcome.source!=='SERVER_AFTER_STEP_FACTUAL_INTENT_TO_TREAT_ONLY'||
   q.outcome.hitDelta<0||q.outcome.shotDelta<0||q.outcome.killDelta<0)throw Error('invalid outcome '+c.id);completed++;}
  if(c.arm==='observe')throw Error('observe unexpectedly assigned '+c.id);
  offers++;byArm[arm]++;if(slot)modified++;
 }
 if(c.arm==='observe'&&w.counts.modifiedTicks!==0)throw Error('observer applied motor');
 if(c.arm==='randomized'&&w.counts.modifiedTicks!==w.counts.executedAlternatives)throw Error('exposure accounting');
}
if(offers!==completed+censored||modified!==byArm['alternative-a']+byArm['alternative-b'])throw Error('global totals');
const audit={schema:'fpsarena-c35w-independent-audit-v1',cohort:d.cases.length,registeredHash:run.registrationSHA256,
 sourceSHA256Verified:true,filesVerified:true,C21AssignmentsRecomputed:old,C21Mismatch:0,
 C35WAssignmentsRecomputed:offers,C35WMismatch:0,byArm,executedAlternatives:modified,
 completed,censored,unselectedActionsHaveNoFactualReturn:true,fireModifications:changes,agentErrors:0,
 status:'PASS; registered intent-to-treat assignments, no causal reward for unselected actions'};
fs.writeFileSync(path.join(O,'INDEPENDENT-AUDIT.json'),JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit,null,2));
