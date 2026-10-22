#!/usr/bin/env node
/** Independent source/match hash, assignment, propensity and shot outcome audit. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {assignmentC35Y,C35W_ARMS,C35Y_P} from '../lab/arena/causal-action-teacher-c35w.mjs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const R=path.resolve(import.meta.dirname,'..'),O=path.join(R,'reports/c35aa/matched-36');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const d=read(path.join(O,'FROZEN-DESIGN.json')),run=read(path.join(O,'EXECUTION-AUDIT.json'));
for(const [file,h]of Object.entries(d.sourceSHA256))if(sha(path.join(R,file))!==h)throw Error('source changed '+file);
if(run.registrationSHA256!==sha(path.join(O,'FROZEN-DESIGN.json')))throw Error('registration changed');
if(d.cases.length!==36||run.cases.length!==36)throw Error('missing matches');
let shots=0,pellets=0,matches=0,assignments=0,c21=0,modified=0,errors=0;
const byWeapon={},byArm={},byAssignment={control:0,'alternative-a':0,'alternative-b':0};
for(const c of d.cases){
 const rec=run.cases.find(x=>x.id===c.id);if(!rec)throw Error('not found '+c.id);
 const prefix=path.join(O,'matches',c.id);
 for(const [k,h]of Object.entries(rec.sha256))if(sha(prefix+'.'+k+'.json')!==h)throw Error('file hash '+c.id+' '+k);
 const result=read(prefix+'.result.json'),aim=read(prefix+'.aim.json')?.traces?.[0];
 if(result.results.length!==1||result.results[0].seed!==c.seed||result.results[0].map!==c.map||result.aggregate.agentErrors!==0||!aim)throw Error('result identity '+c.id);
 if(aim.setupId!==c.setupId||aim.weapon!==c.gun||aim.counts.fireModified||aim.counts.serverShotMismatches||aim.counts.droppedRows)throw Error('aim boundary '+c.id);
 if(aim.counts.shots!==result.aggregate.shots||aim.counts.shots!==aim.rows.length)throw Error('shot count '+c.id);
 if(aim.rows.reduce((a,r)=>a+r.serverLabelsAfterStep.pelletCount,0)!==aim.counts.pellets)throw Error('pellet count '+c.id);
 const hitPellets=aim.rows.reduce((a,r)=>a+r.serverLabelsAfterStep.playerHitPellets,0);
 if(hitPellets!==aim.counts.playerHitPellets)throw Error('hit-pellet count '+c.id);
 for(const row of aim.rows){
  const f=row.publicBeforeStep,y=row.serverLabelsAfterStep;
  if(!row.outcomesOnlyAfterStep||!f||!f.fireIntent||f.provenance!=='PUBLIC_BEFORE_GAME_STEP_ONLY'||
    !Number.isFinite(f.speed)||!['still','slow','fast'].includes(f.movementClass)||
    !Number.isFinite(y.spreadDegrees)||!Number.isInteger(y.pelletCount)||
    y.playerHitPellets>y.pelletCount||!Number.isInteger(row.tick))throw Error('bad shot row '+c.id);
 }
 if(c.arm!=='release'){
  const ds=read(prefix+'.dataset.json').matches[0],w=read(prefix+'.random.json').traces[0];
  if(ds.metadata.registrationSHA256!==run.registrationSHA256||w.counts.fireChanges!==0||w.setupId!==c.setupId)throw Error('research boundary '+c.id);
  for(let i=0;i<ds.offers.length;i++){if(ds.offers[i].selectedAction!==assignedActionC21(c.seed,i+1))throw Error('C21 wrong '+c.id);c21++;}
  if(c.arm==='observe'&&w.rows.length)throw Error('observe allocated '+c.id);
  if(w.rows.length!==w.counts.offers||w.counts.completed+w.counts.censored!==w.counts.offers||
   w.counts.modifiedTicks!==w.counts.executedAlternatives)throw Error('research counts '+c.id);
  for(let i=0;i<w.rows.length;i++){
   const row=w.rows[i],name=assignmentC35Y(c.seed,i+1),slot=C35W_ARMS.indexOf(name);
   if(row.assignedArm!==name||row.propensity!==C35Y_P[slot]||!row.compliant||
    row.executedArm!==name||row.unselectedOutcomes!==null||row.actionSet.length!==3||
    !row.actionSet.every(a=>a.safe)||row.offerIndex!==i+1)throw Error('research assignment '+c.id);
   if(row.censored?row.outcome!==null:row.outcome?.source!=='SERVER_AFTER_STEP_FACTUAL_INTENT_TO_TREAT_ONLY')throw Error('research factual '+c.id);
   assignments++;byAssignment[name]++;if(slot)modified++;
  }
 }
 matches++;shots+=aim.counts.shots;pellets+=aim.counts.pellets;
 byArm[c.arm]??={matches:0,kills:0,deaths:0,shots:0,pellets:0};
 const b=byArm[c.arm];b.matches++;b.kills+=result.aggregate.kills;b.deaths+=result.aggregate.deaths;b.shots+=aim.counts.shots;b.pellets+=aim.counts.pellets;
 byWeapon[c.gun]??={shots:0,pellets:0,playerHitPellets:0};byWeapon[c.gun].shots+=aim.counts.shots;
 byWeapon[c.gun].pellets+=aim.counts.pellets;byWeapon[c.gun].playerHitPellets+=hitPellets;
}
if(matches!==36||shots<1||pellets<shots||modified!==byAssignment['alternative-a']+byAssignment['alternative-b'])throw Error('global invariant');
const output={schema:'fpsarena-c35aa-independent-audit-v1',status:'PASS',registrationSHA256:run.registrationSHA256,
 sourceHashVerified:true,matchHashVerified:true,shotsReconciled:shots,pelletsReconciled:pellets,
 matchCount:matches,setupCount:new Set(d.cases.map(x=>x.setupId)).size,
 c21AssignmentsRecomputed:c21,c35ExplorationAssignmentsRecomputed:assignments,executedAlternatives:modified,
 byAssignment,byArm,byWeapon,agentErrors:errors,fireChanges:0,unselectedOutcomesNeverLabelled:true,
 limitations:'Only authoritative after-step shot outcomes. No counterfactual shooting or ADS assignment.'};
fs.writeFileSync(path.join(O,'INDEPENDENT-AUDIT.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
