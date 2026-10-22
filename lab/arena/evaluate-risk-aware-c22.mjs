// C22 strict provenance, no-overlap and horizon-specific clustered descriptive analysis.
// Cumulative 0.9/1.8 outcomes are not independent; never train on duplicated rows.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assignedActionC21,C21_ACTIONS} from './encounter-randomization-c21.mjs';
import {C13_FEATURES} from './encounter-policy-recorder-c13.mjs';
import {pressureBandC22,C22_HORIZONS} from './risk-aware-encounters-c22.mjs';
const finite=Number.isFinite;
const assert=(x,why)=>{if(!x)throw Error('C22 invalid dataset: '+why);};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const rnd=x=>finite(x)?+x.toFixed(5):null;
function checkOutcome(o){return o&&typeof o.censored==='boolean'&&['shots','hits','kills','deaths','damageDealt','damageTaken'].every(k=>finite(o[k])&&o[k]>=0);}
export function validateC22(data){
 assert(data?.schema==='fpsarena-c22-risk-aware-dataset-v1'&&data.engine==='uploaded-main'&&Array.isArray(data.matches)&&data.matches.length>0,'root');
 const seen=new Set(),rows=[];
 for(const match of data.matches){
  const m=match.metadata;
  assert(match.schema==='fpsarena-c22-risk-aware-match-v1'&&m?.producer==='headless-simulator'&&m.productionActuation===false&&m.assignmentBeforeOutcome===true,'research provenance');
  assert(m.windowSeconds===1.8&&m.perArmProbability===1/3&&m.mode==='tdm','study design');
  assert(Number.isSafeInteger(m.seed)&&m.seed>=0&&m.seed<=0xffffffff&&['arena','foundry','neon'].includes(m.map)&&typeof m.loadout==='string','match identity');
  const id=`${m.map}/${m.loadout}/${m.seed}`;assert(!seen.has(id),'duplicate match');seen.add(id);
  assert(Array.isArray(match.offers),'offers');let prevEnd=-Infinity;const counts=Object.fromEntries(C21_ACTIONS.map(a=>[a,0]));
  for(const [i,r] of match.offers.entries()){
   assert(r.schema==='fpsarena-c22-risk-aware-opportunity-v1'&&r.offerId===`c21-${m.map}-${m.loadout}-${m.seed}-${i+1}`,'offer identity');
   assert(r.seed===m.seed&&r.map===m.map&&r.loadout===m.loadout,'row identity');
   assert(r.selectedAction===assignedActionC21(m.seed,i+1)&&r.assignment?.probability===1/3&&r.assignment?.eligibleBeforeAssignment===true,'randomization/probability');
   assert(r.validity?.preActionPublicFeaturesOnly===true&&r.validity?.serverLabelsOnlyAfterAssignment===true&&r.validity?.safetyGateUnchanged===true&&r.validity?.horizonEventsAfterActionOnly===true,'features/actuation');
   assert(C13_FEATURES.every(k=>finite(r.publicFeatures?.[k])),'public features');
   assert(r.pressureBand===pressureBandC22(r.publicFeatures),'pre-action pressure band');
   assert(C21_ACTIONS.every(a=>r.candidateSet?.includes(a)),'all three safe candidates');
   assert(finite(r.time)&&finite(r.windowEnd)&&Math.abs((r.windowEnd-r.time)-1.8)<.00015&&r.time>=prevEnd-.00011,'nonoverlapping offers');prevEnd=r.windowEnd;
   assert(Array.isArray(r.horizonSeconds)&&JSON.stringify(r.horizonSeconds)===JSON.stringify(C22_HORIZONS),'horizons');
   assert(checkOutcome(r.outcome),'primary label');
   for(const h of C22_HORIZONS){const o=r.horizons?.[String(h)];assert(checkOutcome(o),`missing horizon ${h}`);
    for(const k of ['shots','hits','kills','deaths','damageDealt','damageTaken'])assert(o[k]<=r.outcome[k]+1e-6,'non-cumulative server outcome');
    if(h===1.8)for(const k of ['shots','hits','kills','deaths','damageDealt','damageTaken'])assert(Math.abs(o[k]-r.outcome[k])<1e-6,'1.8 server parity');
   }
   assert(Number.isInteger(r.executedTicks)&&r.executedTicks>=0&&r.selectedAction!=='baseline'||r.executedTicks===0,'baseline execution');
   counts[r.selectedAction]++;rows.push({...r,matchId:id});
  }
  assert(match.diagnostics?.offers===match.offers.length,'offer tally');
  for(const a of C21_ACTIONS)assert(match.diagnostics.actionCounts?.[a]===counts[a],'action count');
  const p=match.diagnostics.publicPressureAudit;
  assert(p?.sampled===p.eligible+p.ineligible&&Object.values(p.byPressure).reduce((a,b)=>a+b,0)===p.sampled,'pressure audit counts');
 }
 return {matches:seen.size,rows,matchIds:[...seen]};
}
function hash(x){x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return (x^(x>>>16))>>>0;}
export function evaluateC22(data,{bootstraps=1000,seed=220022}={}){
 assert(Number.isInteger(bootstraps)&&bootstraps>=20&&bootstraps<=20000,'bootstraps');
 const {matches,rows,matchIds}=validateC22(data);const byMatch=matchIds.map(id=>rows.filter(r=>r.matchId===id));
 const summaries={};const pressureAudit={sampled:0,eligible:0,ineligible:0,byPressure:{low:0,moderate:0,elevated:0,unobserved:0},byPressureEligible:{low:0,moderate:0,elevated:0,unobserved:0},reasons:{}};
 for(const m of data.matches){const a=m.diagnostics.publicPressureAudit;for(const k of ['sampled','eligible','ineligible'])pressureAudit[k]+=a[k];
  for(const k of Object.keys(pressureAudit.byPressure)){pressureAudit.byPressure[k]+=a.byPressure[k];pressureAudit.byPressureEligible[k]+=a.byPressureEligible[k];}
  for(const [k,v] of Object.entries(a.reasons))pressureAudit.reasons[k]=(pressureAudit.reasons[k]||0)+v;}
 let rngState=seed>>>0;const random=()=>{rngState=hash(rngState);return rngState/4294967296;};
 for(const h of C22_HORIZONS){const full=rows.filter(r=>!r.horizons[String(h)].censored);
  const stats=rr=>Object.fromEntries(C21_ACTIONS.map(arm=>{const xs=rr.filter(r=>r.selectedAction===arm);
   const balances=xs.map(r=>r.horizons[String(h)].damageDealt-r.horizons[String(h)].damageTaken);
   return [arm,{n:xs.length,meanBalance:rnd(mean(balances)),meanDealt:rnd(mean(xs.map(r=>r.horizons[String(h)].damageDealt))),
    meanTaken:rnd(mean(xs.map(r=>r.horizons[String(h)].damageTaken))),nonzero:xs.filter(r=>r.horizons[String(h)].damageDealt+r.horizons[String(h)].damageTaken>0).length}];}));
  const s=stats(full),contrasts={};
  for(const a of C21_ACTIONS.slice(1)){
   const deltas=[];for(let i=0;i<bootstraps;i++){
    const rr=[];for(let j=0;j<byMatch.length;j++)rr.push(...byMatch[Math.floor(random()*byMatch.length)].filter(r=>!r.horizons[String(h)].censored));
    const b=stats(rr);if(finite(b[a].meanBalance)&&finite(b.baseline.meanBalance))deltas.push(b[a].meanBalance-b.baseline.meanBalance);
   }deltas.sort((x,y)=>x-y);
   contrasts[a]={observedDifference:rnd(finite(s[a].meanBalance)&&finite(s.baseline.meanBalance)?s[a].meanBalance-s.baseline.meanBalance:null),
    clusterBootstrap95:deltas.length?{low:rnd(deltas[Math.floor(.025*deltas.length)]),high:rnd(deltas[Math.min(deltas.length-1,Math.floor(.975*deltas.length))]),resamples:deltas.length}:null};
  }
  const byPressure=Object.fromEntries(['low','moderate','elevated'].map(b=>[b,{complete:full.filter(r=>r.pressureBand===b).length,
   nonzero:full.filter(r=>r.pressureBand===b&&r.horizons[String(h)].damageDealt+r.horizons[String(h)].damageTaken>0).length}]));
  summaries[String(h)]={complete:full.length,censored:rows.length-full.length,nonzero:full.filter(r=>r.horizons[String(h)].damageDealt+r.horizons[String(h)].damageTaken>0).length,
   incomingNonzero:full.filter(r=>r.horizons[String(h)].damageTaken>0).length,actions:s,contrasts,byPressure};
 }
 const long=summaries['1.8'],covered=Object.fromEntries(C21_ACTIONS.map(a=>[a,new Set(rows.filter(r=>!r.horizons['1.8'].censored&&r.selectedAction===a).map(r=>r.matchId)).size]));
 const gate={minimumMatches:30,minimumWindowsPerArm:120,minimumMatchesPerArm:20,minimumNonzeroWindows:90,minimumIncomingDamageWindows:30,
  observedMatches:matches,observedCoverage:covered,passes:matches>=30&&C21_ACTIONS.every(a=>long.actions[a].n>=120&&covered[a]>=20)&&long.nonzero>=90&&long.incomingNonzero>=30};
 return {schema:'fpsarena-c22-risk-aware-encounter-evaluation-v1',matches,offers:rows.length,horizons:summaries,pressureAudit,trainingGate:gate,
  decision:gate.passes?'data adequacy threshold met (NOT authorization to deploy)':'RESEARCH ONLY: insufficient independent matches/outcome signal; no real-data neural training',
  cautions:['Pressure level is an explicitly defined pre-action public proxy, not a ground-truth incoming-fire measurement',
   '0.9s and 1.8s outcomes are cumulative within the same opportunities; do not treat as independent samples',
   'Arms randomized per opportunity; offers within a match may be dependent, so intervals cluster on whole matches',
   'No incoming damage should not be treated as proven evasive success','No hidden server position/health used in decision features',
   'No browser/real-player performance verified']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [inp,out]=process.argv.slice(2);if(!inp||!out)throw Error('usage: evaluate-risk-aware-c22.mjs IN OUT');
 const result=evaluateC22(JSON.parse(readFileSync(inp,'utf8')));mkdirSync(path.dirname(path.resolve(out)),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 console.log(`C22 ${result.matches} matches ${result.offers} offers gate=${result.trainingGate.passes}`);
}
