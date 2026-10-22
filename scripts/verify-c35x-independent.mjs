#!/usr/bin/env node
/** Independent C35-X propensity, execution, data-integrity and legacy C21 audit. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {assignmentC35W,C35W_ARMS,C35W_P} from '../lab/arena/causal-action-teacher-c35w.mjs';
import {assignedActionC21} from '../lab/arena/encounter-randomization-c21.mjs';
const R=path.resolve(import.meta.dirname,'..'),O=path.join(R,'reports/c35x/expansion-54-v2');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const d=load(path.join(O,'FROZEN-DESIGN.json')),run=load(path.join(O,'EXECUTION-AUDIT.json'));
for(const [p,h] of Object.entries(d.sourceSHA256))if(sha(path.join(R,p))!==h)throw Error('source drift '+p);
if(run.registrationSHA256!==sha(path.join(O,'FROZEN-DESIGN.json')))throw Error('design drift');
if(d.cases.length!==54||run.cases.length!==54)throw Error('cohort incomplete');
let offers=0,executed=0,completed=0,censored=0,c21=0,shots=0,pellets=0;let byArm=Object.fromEntries(C35W_ARMS.map(k=>[k,0]));
const setups=new Set(),guns=new Set(),maps=new Set();
for(const c of d.cases){
 setups.add(c.setupId);guns.add(c.gun);maps.add(c.map);
 const rec=run.cases.find(x=>x.id===c.id);if(!rec)throw Error('missing '+c.id);
 const pref=path.join(O,'matches',c.id);const read=k=>load(pref+'.'+k+'.json');
 for(const [key,hash]of Object.entries(rec.sha256))if(sha(pref+'.'+key+'.json')!==hash)throw Error('wrong sha '+c.id+' '+key);
 const result=read('result');if(result.aggregate.agentErrors!==0||result.results.length!==1)throw Error('agent error '+c.id);
 shots+=result.aggregate.shots;
 if(c.arm==='release')continue;
 const ds=read('dataset').matches[0],w=read('random').traces[0],g=read('fire');
 if(ds.metadata.registrationSHA256!==run.registrationSHA256)throw Error('wrong registration '+c.id);
 for(let i=0;i<ds.offers.length;i++){if(ds.offers[i].selectedAction!==assignedActionC21(c.seed,i+1))throw Error('C21 assignment '+c.id);c21++;}
 if(w.setupId!==c.setupId||w.seed!==c.seed||w.policy!==c.arm||w.counts.fireChanges!==0)throw Error('boundary '+c.id);
 if(w.counts.offers!==w.rows.length)throw Error('offers count '+c.id);
 if(c.arm==='observe'&&w.rows.length)throw Error('observe allocated '+c.id);
 for(let i=0;i<w.rows.length;i++){
  const x=w.rows[i],name=assignmentC35W(c.seed,i+1),slot=C35W_ARMS.indexOf(name);
  if(x.offerIndex!==i+1||x.assignedArm!==name||x.propensity!==C35W_P[slot]||
     x.assignmentDistribution.control!==.8||x.actionSet.length!==3||x.actionSet[slot].arm!==name||
     !x.actionSet.every(a=>a.safe)||!x.compliant||x.executedArm!==name||x.unselectedOutcomes!==null||
     JSON.stringify(x.executedAction)!==JSON.stringify(x.requestedAction))throw Error('assignment mismatch '+c.id+' '+i);
  if(x.censored){if(x.outcome!==null)throw Error('censored with label '+c.id);censored++;}
  else{if(!x.outcome||x.outcome.source!=='SERVER_AFTER_STEP_FACTUAL_INTENT_TO_TREAT_ONLY'||
    ['shotDelta','hitDelta','killDelta','damageTakenDelta'].some(k=>x.outcome[k]<0))throw Error('bad factual '+c.id);completed++;}
  offers++;byArm[name]++;if(slot)executed++;
 }
 if(w.counts.offers!==w.rows.length||w.counts.modifiedTicks!==w.counts.executedAlternatives||
    w.counts.completed+w.counts.censored!==w.rows.length||w.counts.modifiedTicks!==w.rows.filter(x=>x.assignedArm!=='control').length)throw Error('counter mismatch '+c.id);
}
if(offers!==completed+censored||executed!==byArm['alternative-a']+byArm['alternative-b']||setups.size!==18||guns.size!==6||maps.size!==3)throw Error('global invariant');
const o={schema:'fpsarena-c35x-independent-audit-v1',status:'PASS',setupCount:setups.size,matchCount:d.cases.length,
 sourceHashVerified:true,matchFileHashVerified:true,propensityVerified:true,c21AssignmentsRecomputed:c21,c21Mismatch:0,
 c35wAssignmentsRecomputed:offers,c35wMismatch:0,byArm,executedAlternatives:executed,completed,censored,
 fireMutation:0,agentErrors:0,actionUnchosenOutcomesUnlabelled:true,
 interpretation:'one-tick randomized ITT, not known per-action counterfactual returns'};
fs.writeFileSync(path.join(O,'INDEPENDENT-AUDIT.json'),JSON.stringify(o,null,2)+'\n');console.log(JSON.stringify(o,null,2));
