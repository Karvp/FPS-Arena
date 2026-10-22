// C24 audit: public shot cues BEFORE assignment vs authoritative server threat
// labels AFTER assignment. Descriptive associations; not a causal dodge policy.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateC22} from './evaluate-risk-aware-c22.mjs';
import {C21_ACTIONS} from './encounter-randomization-c21.mjs';
const assert=(ok,msg)=>{if(!ok)throw Error('C24 invalid dataset: '+msg);};
const finite=Number.isFinite;
const rounded=v=>finite(v)?+v.toFixed(5):null;
const sha=s=>createHash('sha256').update(s).digest('hex');
const id=m=>`${m.metadata.map}/${m.metadata.loadout}/${m.metadata.seed}`;
export const C24_FIXED_ENDPOINT=Object.freeze({horizonSeconds:1.8,unit:'match',
 primary:'server-confirmed hostile weapon hits (count) within nonoverlapping 1.8s assigned windows',
 secondary:['server-confirmed hostile trigger count','displayed hostile tracer proximity <=2.5m','actual hostile weapon HP/armor damage'],
 publicCueSeconds:1.5,actions:C21_ACTIONS});
function validatePlan(plan,data,{excludedSeeds=[]}={}){
 assert(plan?.schema==='fpsarena-c24-threat-study-plan-v1'&&plan.version===1,'registered plan schema');
 assert(JSON.stringify(plan.endpoint)===JSON.stringify(C24_FIXED_ENDPOINT),'endpoint changed');
 const {registrationSHA256,...unsigned}=plan;
 assert(registrationSHA256===sha(JSON.stringify(unsigned)),'registration hash mismatch');
 assert(/^[0-9a-f]{64}$/.test(plan.sourceSHA256||''),'missing source hash');
 assert(plan.profile==='release'&&plan.seconds>=20&&plan.seconds<=600&&plan.bots===5&&plan.snapshotLagMs===65&&plan.opponents==='stress','conditions changed');
 assert(plan.jobs.length===data.matches.length,'missing/extra jobs');
 const excluded=new Set(excludedSeeds),seenSeeds=new Set(),seenJobs=new Set(),planned=new Map();
 for(const j of plan.jobs){assert(Number.isSafeInteger(j.seed)&&j.seed>=0&&j.seed<=0xffffffff&&
  !excluded.has(j.seed)&&!seenSeeds.has(j.seed),'duplicate/reused seed');seenSeeds.add(j.seed);
  assert(typeof j.id==='string'&&!seenJobs.has(j.id)&&/^[a-z0-9_-]+$/.test(j.id),'duplicate/invalid job');seenJobs.add(j.id);
  assert(['arena','foundry','neon'].includes(j.map)&&['mp5sd','hk_sl8','m4a1','aa12'].includes(j.weapon),'invalid stratum');
  planned.set(`${j.map}/${j.weapon}/${j.seed}`,j);}
 for(const m of data.matches)assert(planned.has(id(m)),'unregistered match '+id(m));
}
export function validateC24(data,plan=null,options={}){
 assert(data?.schema==='fpsarena-c24-threat-dataset-v1'&&data.engine==='uploaded-main'&&Array.isArray(data.matches)&&data.matches.length>0,'root');
 const prior={...data,schema:'fpsarena-c22-risk-aware-dataset-v1',matches:data.matches.map(m=>({...m,schema:'fpsarena-c22-risk-aware-match-v1',
  offers:m.offers.map(o=>({...o}))}))};
 const validated=validateC22(prior);if(plan)validatePlan(plan,data,options);
 for(const m of data.matches){
  assert(m.schema==='fpsarena-c24-threat-match-v1'&&m.metadata?.productionActuation===false&&
   m.metadata?.threatLabelsAfterAssignmentOnly===true,'match provenance');
  const d=m.diagnostics?.threatTrace;
  assert(d?.schema==='fpsarena-c24-threat-trace-audit-v1','threat audit missing');
  for(const k of ['hostileServerShots','hostileNearTracers','hostileWeaponHits','hostileWeaponDamage',
   'publicNearbyShotsDelivered','publicNearTracersDelivered'])assert(finite(d[k])&&d[k]>=0,'bad threat audit '+k);
  assert(d.hostileNearTracers<=d.hostileServerShots&&d.publicNearTracersDelivered<=d.publicNearbyShotsDelivered,
   'tracer and shot count inconsistency');
  for(const o of m.offers){
   const c=o.publicCueBeforeAction,t=o.threatOutcome;
   assert(c&&t&&c.lookbackSeconds===1.5&&c.cueDefinition.includes('delivered')&&
    t.validity.includes('AFTER action'),'cue/label provenance');
   for(const k of ['receivedShotCount','receivedNearTracerCount'])assert(Number.isInteger(c[k])&&c[k]>=0,'noninteger public cue');
   assert(c.receivedNearTracerCount<=c.receivedShotCount,'public near > shots');
   for(const k of ['hostileShotEvents','hostileNearTracerEvents','hostileWeaponHitEvents'])assert(Number.isInteger(t[k])&&t[k]>=0,'invalid threat label '+k);
   assert(t.hostileNearTracerEvents<=t.hostileShotEvents,'near > hostile shots');
   assert(finite(t.hostileWeaponDamage)&&t.hostileWeaponDamage>=0,'weapon damage');
   assert(t.hostileWeaponHitEvents===0? t.hostileWeaponDamage===0:t.hostileWeaponDamage>0,'weapon hit/damage mismatch');
   for(const [key,v] of [['nearestReceivedTracerMeters',c.nearestReceivedTracerMeters],['closestServerTracerMeters',t.closestServerTracerMeters]])
    assert(v===null||(finite(v)&&v>=0),key);
  }
 }
 return validated;
}
const summarize=(rows)=>{
 const matches=new Set(rows.map(r=>r.matchId)).size;
 const sum=key=>rows.reduce((acc,r)=>acc+r.threatOutcome[key],0);
 const withCue=rows.filter(r=>r.publicCueBeforeAction.receivedShotCount>0).length;
 const near=rows.filter(r=>r.threatOutcome.hostileNearTracerEvents>0).length;
 const hits=rows.filter(r=>r.threatOutcome.hostileWeaponHitEvents>0).length;
 return {windows:rows.length,matches,preActionCueWindows:withCue,serverHostileShots:sum('hostileShotEvents'),
  serverNearbyTracerWindows:near,serverWeaponHitWindows:hits,serverWeaponHitEvents:sum('hostileWeaponHitEvents'),
  serverWeaponDamage:rounded(sum('hostileWeaponDamage')),
  observedHitWindowRate:rounded(rows.length?hits/rows.length:null),
  observedTracerProximityWindowRate:rounded(rows.length?near/rows.length:null)};
};
export function evaluateC24(data,plan=null,options={}){
 const checked=validateC24(data,plan,options);
 const rows=data.matches.flatMap(m=>m.offers.filter(o=>!o.horizons['1.8'].censored).map(o=>({...o,matchId:id(m)})));
 const byAction=Object.fromEntries(C21_ACTIONS.map(a=>[a,summarize(rows.filter(r=>r.selectedAction===a))]));
 const byCue={recentShotCuePresent:summarize(rows.filter(r=>r.publicCueBeforeAction.receivedShotCount>0)),
  noRecentShotCue:summarize(rows.filter(r=>r.publicCueBeforeAction.receivedShotCount===0))};
 const total=summarize(rows), all={hostileShots:0,nearTracers:0,weaponHits:0,weaponDamage:0,publicShotsDelivered:0};
 for(const m of data.matches){const d=m.diagnostics.threatTrace;
  all.hostileShots+=d.hostileServerShots;all.nearTracers+=d.hostileNearTracers;all.weaponHits+=d.hostileWeaponHits;
  all.weaponDamage+=d.hostileWeaponDamage;all.publicShotsDelivered+=d.publicNearbyShotsDelivered;
 }
 all.weaponDamage=rounded(all.weaponDamage);
 const gate=checked.matches>=30&&C21_ACTIONS.every(a=>byAction[a].windows>=120&&byAction[a].matches>=20)&&
  total.serverNearbyTracerWindows>=60&&total.serverWeaponHitWindows>=30&&
  C21_ACTIONS.every(a=>byAction[a].serverWeaponHitWindows>=8);
 return {schema:'fpsarena-c24-threat-cue-evaluation-v1',matches:checked.matches,assignedOffers:checked.rows.length,
  complete:rows.length,censored:checked.rows.length-rows.length,horizonSeconds:1.8,
  fixedEndpoint:C24_FIXED_ENDPOINT,matchWideAuthoritativeThreats:all,
  assignedWindowLabels:total,byAction,preActionCueAssociation:byCue,
  studyDesign:'observational cue vs later server labels conditional on randomized eligibility; action arms not selected by cue',
  trainingGate:{passes:gate,minMatches:30,minCompleteWindowsPerArm:120,minMatchesPerArm:20,minTracerPositiveWindows:60,
   minHostileWeaponHitWindows:30,minWeaponHitWindowsPerArm:8},
  decision:gate?'DATA VOLUME GATE ONLY; independent calibration and randomized benefit still unproven':'BLOCKED — insufficient independent defensive-threat labels for neural actuation',
  limitations:['FPS Arena is hitscan: packet delivery occurs after the relevant shot has resolved',
   'Server labels never enter current or past public cues; future shots and hits cannot be used to choose action',
   'Near tracer uses at most three displayed segments, not the entire pellet population, hit probability or confirmed near miss',
   'Delivered shots can include teammates; they are historical cues, not a validated incoming-hit probability',
   'Shot exposure and micro-actions can jointly affect later outcomes; comparisons are descriptive, not causal',
   'Within-match windows are correlated; do not use per-window iid statistical significance or train an unsafe Q-policy']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [datasetPath,planPath,outPath]=process.argv.slice(2);
 if(!datasetPath||!outPath)throw Error('usage: evaluate-threat-cues-c24.mjs DATA PLAN_OR_DASH OUT');
 const output=evaluateC24(JSON.parse(readFileSync(datasetPath,'utf8')),
  planPath==='-'?null:JSON.parse(readFileSync(planPath,'utf8')));
 mkdirSync(path.dirname(path.resolve(outPath)),{recursive:true});writeFileSync(outPath,JSON.stringify(output,null,2)+'\n');
 console.log(`C24 ${output.matches} matches ${output.complete} complete; incoming=${output.assignedWindowLabels.serverWeaponHitWindows} gate=${output.trainingGate.passes}`);
}
