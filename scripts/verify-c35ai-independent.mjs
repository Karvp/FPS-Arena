#!/usr/bin/env node
/* C35AH independent replication of randomized option assignment and artifacts.
 * Does not import controller; mix32 recreated here from design equation.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const R=path.resolve(import.meta.dirname,'..'),O=path.join(R,'reports/c35ai/frozen-72-v5');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function assigned(seed,i){let x=(seed^Math.imul(i,0x6b11350f)^0xc35aaffe)>>>0;
 x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);x=(x^(x>>>16))>>>0;
 const u=x/4294967296;return u<.5?'incumbent':u<.75?'option-a':'option-b';}
const d=read(path.join(O,'FROZEN-DESIGN.json')),run=read(path.join(O,'EXECUTION-AUDIT.json'));
if(d.cases.length!==72||run.cases.length!==72||run.registrationSHA256!==sha(path.join(O,'FROZEN-DESIGN.json')))throw Error('missing/bad frozen experiment');
for(const [file,h] of Object.entries(d.sourceSHA256))if(sha(path.join(R,file))!==h)throw Error('source drift '+file);
function expectedC21(seed,i){let x=(seed^Math.imul(i,0x517cc1b7)^0xc21f7a39)>>>0;
 x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);x=(x^(x>>>16))>>>0;return ['baseline','micro-left','micro-right'][Math.min(2,Math.floor(3*x/4294967296))];}
const byArm={incumbent:0,'option-a':0,'option-b':0};let assignedCount=0,completed=0,censored=0,changedTicks=0,interruptions=0,shots=0,pellets=0,c21=0,realizedChangedTicks=0,observedTravel=0,momentumTravel=0,teleportTicks=0,stalledMotorTicks=0;const byWeapon={};
for(const c of d.cases){
 const caseAudit=run.cases.find(r=>r.id===c.id);if(!caseAudit)throw Error('missing case '+c.id);
 const base=path.join(O,'matches',c.id),get=k=>read(base+'.'+k+'.json');
 for(const [key,digest] of Object.entries(caseAudit.sha256))if(sha(base+'.'+key+'.json')!==digest)throw Error('case hash mismatch '+c.id+':'+key);
 const match=get('result');if(match.aggregate.agentErrors!==0||match.results.length!==1)throw Error('agent errors '+c.id);
 if(c.arm==='release')continue;
 const dataset=get('dataset');if(dataset.registrationSHA256!==run.registrationSHA256)throw Error('registration mismatch '+c.id);
 for(const [i,a] of dataset.matches[0].offers.entries()){if(a.selectedAction!==expectedC21(c.seed,i+1))throw Error('C21 assignment mismatch '+c.id);c21++;}
 const aim=get('aim').traces[0],opt=get('option').traces[0],phy=get('physical').traces[0];
 if(phy.rows.length!==opt.rows.length||phy.schema!=='fpsarena-c35ai-physical-option-audit-v1')throw Error('physical trace mismatch '+c.id);
 // Server total distance also counts discontinuous respawn/teleport jumps; the physical
 // observer deliberately excludes them from locomotion. Compare exact parity only if
 // no discontinuities occurred, and never mistake respawns for actual locomotion.
 const distanceDiff=match.results[0].distance-phy.summary.travelMeters;
 if(phy.summary.teleportTicks===0&&Math.abs(distanceDiff)>1)throw Error('physical server distance mismatch '+c.id);
 if(phy.summary.teleportTicks>0&&distanceDiff < -1)throw Error('negative teleport discrepancy '+c.id);
 if(aim.counts.shots!==match.results[0].shots)throw Error('shot parity '+c.id);
 shots+=aim.counts.shots;pellets+=aim.counts.pellets;
 if(opt.counts.fireMutations!==0||opt.rows.length!==opt.counts.offers||opt.policy!==c.arm||opt.setupId!==c.setupId||opt.weapon!==c.gun)throw Error('opt metadata '+c.id);
 if(c.arm==='observe'&&(opt.rows.length!==0||opt.counts.modifiedTicks!==0))throw Error('observe had interventions');
 if(c.arm==='randomized'){
  byWeapon[c.gun]??={offers:0,modifiedTicks:0,completed:0,censored:0};
  byWeapon[c.gun].modifiedTicks+=opt.counts.modifiedTicks;
  if(opt.counts.completed+opt.counts.censored!==opt.rows.length)throw Error('lost outcome');
  changedTicks+=opt.counts.modifiedTicks;interruptions+=opt.counts.interruptions;
  momentumTravel+=phy.summary.momentumTravelMeters;teleportTicks+=phy.summary.teleportTicks;
  for(const [i,q] of opt.rows.entries()){
   const arm=assigned(c.seed,i+1),p=arm==='incumbent'?.5:.25;
   const tr=phy.rows[i];if(tr.index!==q.index||tr.assignedArm!==arm||tr.propensity!==p||tr.allPotentialOutcomes!==null||tr.completeFactual!==!!q.factual.complete||tr.measure.modifiedCommandTicks!==q.modifiedTicks)throw Error('physical row mismatch '+c.id+' '+i);
   if(tr.measure.realizedMovingTicks>tr.measure.ticks||tr.measure.modifiedRealizedMovingTicks>tr.measure.modifiedCommandTicks||tr.measure.stalledMotorTicks>tr.measure.motorCommandTicks||tr.measure.travelMeters<0||tr.measure.teleportTicks<0)throw Error('physical bounds '+c.id+' '+i);
   realizedChangedTicks+=tr.measure.modifiedRealizedMovingTicks;observedTravel+=tr.measure.modifiedTravelMeters;stalledMotorTicks+=tr.measure.stalledMotorTicks;
   if(q.index!==i+1||q.assignedArm!==arm||q.propensity!==p||q.unselectedOutcomes!==null||!q.initialPublicFeatures||q.menu.length!==2||q.optionTicks>76||q.optionTicks<q.modifiedTicks||q.factual===null)throw Error('invalid assignment/option '+c.id+' '+i);
   if(q.modifiedTicks>0&&arm==='incumbent')throw Error('incumbent modified '+c.id);
   if(q.interruptedAt!==null&&q.interruptions<1)throw Error('cancel count');
   assignedCount++;byArm[arm]++;byWeapon[c.gun].offers++;
   if(q.factual.complete){
    for(const k of ['shots','hits','damageDealt','damageTaken','ownKills','deathCount'])if(!Number.isFinite(q.factual[k])||q.factual[k]<0)throw Error('bad factual '+c.id);
    if(q.factual.source!=='AUTHORITATIVE_AFTER_GAME_STEP_INTENT_TO_TREAT')throw Error('not factual '+c.id);
    completed++;byWeapon[c.gun].completed++;
   }else{
    if(!q.factual.censored||'damageDealt' in q.factual)throw Error('filled censored '+c.id);
    censored++;byWeapon[c.gun].censored++;
   }
  }
 }
}
if(assignedCount!==completed+censored||Object.values(byArm).reduce((a,b)=>a+b,0)!==assignedCount)throw Error('global accounting');
const out={schema:'fpsarena-c35ai-independent-verification-v1',matches:d.cases.length,setupClusters:24,
 designHash:run.registrationSHA256,sourceAndArtifactHashesVerified:true,randomizedAssignments:assignedCount,byArm,complete:completed,censored,
 totalChangedMotorTicks:changedTicks,actualMovingTicksWithChangedCommand:realizedChangedTicks,actualTravelWithChangedCommandMeters:+observedTravel.toFixed(4),momentumTravelMeters:+momentumTravel.toFixed(4),teleportTicks,stalledMotorTicksWithinOffers:stalledMotorTicks,interruptions,byWeapon,c21AssignmentsIndependentlyVerified:c21,
 verifiedBallistics:{shots,pellets},agentErrors:0,unselectedOutcomesNull:true,fireMutations:0,
 status:'PASS; respawn/teleport discontinuities separately excluded from locomotion; distinct motor commands vs authoritative physical movement; intent-to-treat preserved; no counterfactual returns'};
fs.writeFileSync(path.join(O,'INDEPENDENT-VERIFICATION.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
