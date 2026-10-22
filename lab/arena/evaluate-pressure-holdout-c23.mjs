// C23: predeclared pressure-conditioned analysis, using only PRE-ACTION public
// proxies. This is retrospective analysis of C22's randomized controller, not
// a learned/active game policy. Unit of resampling is the entire match.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateC22} from './evaluate-risk-aware-c22.mjs';
import {C21_ACTIONS} from './encounter-randomization-c21.mjs';
const assert=(ok,msg)=>{if(!ok)throw Error('C23 invalid provenance: '+msg);};
const finite=Number.isFinite;
const rnd=n=>finite(n)?+n.toFixed(5):null;
const BANDS=Object.freeze(['low','moderate','elevated','unobserved']);
export const C23_FIXED_ENDPOINT=Object.freeze({horizonSeconds:1.8,metric:'damageDealt-minus-damageTaken',bands:BANDS,unit:'match',arms:C21_ACTIONS});
const hash=x=>{x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return (x^(x>>>16))>>>0;};
const pct=(values,q)=>values.length?values[Math.min(values.length-1,Math.floor(q*values.length))]:null;
const sha=s=>createHash('sha256').update(s).digest('hex');
export function validateC23(data,plan,{exploratorySeeds=[]}={}){
 const check=validateC22(data);
 assert(plan?.schema==='fpsarena-c23-pressure-holdout-plan-v1'&&plan.version===1,'plan schema');
 assert(plan.endpoint?.horizonSeconds===1.8&&plan.endpoint?.metric===C23_FIXED_ENDPOINT.metric&&
  JSON.stringify(plan.endpoint?.bands)===JSON.stringify(BANDS)&&plan.endpoint.unit==='match','endpoint tampering');
 assert(typeof plan.sourceSHA256==='string'&&/^[0-9a-f]{64}$/.test(plan.sourceSHA256),'missing source provenance');
 const {registrationSHA256,...unsigned}=plan;
 assert(registrationSHA256===sha(JSON.stringify(unsigned)),'registration hash changed');
 assert(plan.profile==='release'&&plan.seconds>=30&&plan.seconds<=600&&plan.snapshotLagMs===65&&plan.bots===5&&plan.opponents==='stress','game conditions');
 assert(Array.isArray(plan.jobs)&&plan.jobs.length===check.matches&&plan.jobs.length>=1,'missing or extra match');
 const ids=new Set(),seeds=new Set(),pre=new Set(exploratorySeeds);
 for(const job of plan.jobs){
  assert(typeof job.id==='string'&&/^[a-z0-9_-]+$/.test(job.id)&&!ids.has(job.id),'job id');ids.add(job.id);
  assert(Number.isSafeInteger(job.seed)&&job.seed>=0&&job.seed<=0xffffffff&&!seeds.has(job.seed)&&!pre.has(job.seed),'seed collision with plan or exploratory cohort');seeds.add(job.seed);
  assert(['arena','foundry','neon'].includes(job.map)&&['mp5sd','hk_sl8','m4a1','aa12'].includes(job.weapon),'map/weapon');
 }
 const planned=new Map(plan.jobs.map(j=>[`${j.map}/${j.weapon}/${j.seed}`,j]));
 for(const match of data.matches){const meta=match.metadata,key=`${meta.map}/${meta.loadout}/${meta.seed}`;
  assert(planned.has(key),'unregistered observation');
  assert(match.diagnostics.publicPressureAudit.auditPeriod===.45,'changed sampling schedule');
 }
 return check;
}
function summarize(matches,band,arm){
 const rows=matches.flatMap(m=>m.offers.filter(r=>r.pressureBand===band&&r.selectedAction===arm&&!r.horizons['1.8'].censored));
 const mean=rows.length?rows.reduce((s,r)=>s+r.horizons['1.8'].damageDealt-r.horizons['1.8'].damageTaken,0)/rows.length:null;
 return {n:rows.length,matches:new Set(rows.map(r=>`${r.map}/${r.loadout}/${r.seed}`)).size,
  nonzero:rows.filter(r=>r.horizons['1.8'].damageDealt+r.horizons['1.8'].damageTaken>0).length,
  incoming:rows.filter(r=>r.horizons['1.8'].damageTaken>0).length,
  meanBalance:rnd(mean)};
}
export function evaluateC23(data,plan,{bootstraps=600,bootstrapSeed=230023,exploratorySeeds=[]}={}){
 assert(Number.isInteger(bootstraps)&&bootstraps>=30&&bootstraps<=10000,'bootstraps');
 const check=validateC23(data,plan,{exploratorySeeds});
 const groups=Object.fromEntries(BANDS.map(b=>[b,{arms:Object.fromEntries(C21_ACTIONS.map(a=>[a,summarize(data.matches,b,a)])),contrasts:{}}]));
 let rng=bootstrapSeed>>>0;const random=()=>{rng=hash(rng);return rng/4294967296;};
 for(const band of BANDS){for(const arm of C21_ACTIONS.slice(1)){
  const armStat=groups[band].arms[arm],base=groups[band].arms.baseline;
  const delta=finite(armStat.meanBalance)&&finite(base.meanBalance)?armStat.meanBalance-base.meanBalance:null;
  // C23 does NOT provide a confidence interval for sparse pressure cohorts;
  // bootstrap conditional on the *match* is allowed only with sufficient independent support.
  const enough=armStat.n>=20&&base.n>=20&&armStat.matches>=8&&base.matches>=8&&
   armStat.nonzero+base.nonzero>=12;
  let interval=null;
  if(enough){const values=[];
   for(let i=0;i<bootstraps;i++){
    const sample=Array.from({length:data.matches.length},()=>data.matches[Math.floor(random()*data.matches.length)]);
    const a=summarize(sample,band,arm),b=summarize(sample,band,'baseline');
    if(finite(a.meanBalance)&&finite(b.meanBalance))values.push(a.meanBalance-b.meanBalance);
   }values.sort((a,b)=>a-b);
   if(values.length>=bootstraps*.95)interval={low:rnd(pct(values,.025)),high:rnd(pct(values,.975)),replicates:values.length};
  }
  groups[band].contrasts[arm]={observedDifference:rnd(delta),matchBootstrap95:interval,
   sufficientlyCoveredForInterval:enough,interpretation:enough?'descriptive, repeated opportunities and exploratory subgroup uncertainty remains':'NOT ESTIMABLE with reliable match-cluster interval'};
 }}
 const audit=Object.fromEntries(BANDS.map(b=>[b,{sampled:0,eligible:0}]));
 for(const m of data.matches)for(const b of BANDS){audit[b].sampled+=m.diagnostics.publicPressureAudit.byPressure[b];
  audit[b].eligible+=m.diagnostics.publicPressureAudit.byPressureEligible[b];}
 for(const b of BANDS)audit[b].eligibleRate=rnd(audit[b].sampled?audit[b].eligible/audit[b].sampled:null);
 const completed=check.rows.filter(r=>!r.horizons['1.8'].censored);
 const nonzero=completed.filter(r=>r.horizons['1.8'].damageDealt+r.horizons['1.8'].damageTaken>0).length;
 const incoming=completed.filter(r=>r.horizons['1.8'].damageTaken>0).length;
 const anyPerBand=Object.fromEntries(BANDS.map(b=>[b,completed.filter(r=>r.pressureBand===b).length]));
 const actionCoverage=Object.fromEntries(C21_ACTIONS.map(a=>[a,{windows:completed.filter(r=>r.selectedAction===a).length,
  matches:new Set(completed.filter(r=>r.selectedAction===a).map(r=>`${r.map}/${r.loadout}/${r.seed}`)).size}]));
 const sufficient=check.matches>=30&&C21_ACTIONS.every(a=>actionCoverage[a].windows>=120&&actionCoverage[a].matches>=20)&&
  nonzero>=90&&incoming>=30&&['moderate','elevated'].every(b=>C21_ACTIONS.every(a=>groups[b].arms[a].n>=30&&groups[b].arms[a].matches>=8));
 return {schema:'fpsarena-c23-pressure-conditioned-holdout-evaluation-v1',registrationSHA256:plan.registrationSHA256,
  predeclaredEndpoint:C23_FIXED_ENDPOINT,cohort:'NEW SEEDS ONLY — not pooled with C22 exploratory study',
  matches:check.matches,offers:check.rows.length,complete:completed.length,censored:check.rows.length-completed.length,
  nonzero,incoming,actionCoverage,pressureOfferCounts:anyPerBand,pressureAudits:audit,pressureCohorts:groups,
  trainingGate:{passes:sufficient,minMatches:30,minWindowsPerArm:120,minMatchesPerArm:20,minNonzeroWindows:90,minIncomingWindows:30,minModerateAndElevatedPerArm:30},
  decision:sufficient?'DATA GATE ONLY — further independent evaluation required; NO production approval':'RESEARCH ONLY — insufficient action value signal; neural training blocked',
  cautions:['Pre-action pressure is a public heuristic and cannot measure true incoming bullet probability',
   'Eligibility audit frequency is not the randomized assignment count',
   'Opportunities can depend on prior treatment and are not independent within or across a match',
   'Intervals are descriptive and insufficient subgroup support suppresses interval reporting',
   'Do not select a winning pressure cohort after reading holdout results; no production policy change']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [dataPath,planPath,outPath]=process.argv.slice(2);
 if(!dataPath||!planPath||!outPath)throw Error('usage: evaluate-pressure-holdout-c23.mjs DATA PLAN OUT');
 const out=evaluateC23(JSON.parse(readFileSync(dataPath,'utf8')),JSON.parse(readFileSync(planPath,'utf8')));
 mkdirSync(path.dirname(path.resolve(outPath)),{recursive:true});writeFileSync(outPath,JSON.stringify(out,null,2)+'\n');
 console.log(`C23 ${out.matches} matches ${out.offers} offers; training=${out.trainingGate.passes}`);
}
