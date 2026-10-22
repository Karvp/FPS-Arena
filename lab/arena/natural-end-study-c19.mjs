// C19: preregistered natural-end TDM, rigorous right-censoring and ITT analysis.
// This is evaluation infrastructure only; the C16 combat policy remains unchanged.
import {createHash} from 'node:crypto';
import {stratifiedAssignmentC17, analyzeStratifiedC17} from './stratified-exploration-c17.mjs';
export const C19_STRATA=Object.freeze([
 Object.freeze(['arena','mp5sd']),Object.freeze(['arena','hk_sl8']),
 Object.freeze(['foundry','aa12']),Object.freeze(['foundry','m4a1']),
 Object.freeze(['neon','m4a1']),Object.freeze(['neon','mp5sd'])
]);
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const int=n=>Number.isSafeInteger(n)&&n>0;
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const quantile=(a,p)=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))];
function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6d2b79f5)>>>0;let x=s;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
export function createNaturalEndPlanC19({blocksPerStratum=2,experimentSeed=190019,baseSeed=19190000,
 sourceFingerprint='unverified',capSeconds=600}={}){
 if(!int(blocksPerStratum)||blocksPerStratum>20||!int(experimentSeed)||!int(baseSeed)||
    baseSeed+100000>Number.MAX_SAFE_INTEGER||capSeconds!==600||typeof sourceFingerprint!=='string'||!sourceFingerprint)
    throw Error('Invalid C19 preregistration configuration');
 const jobs=[];
 for(let j=0;j<C19_STRATA.length;j++)for(let rep=0;rep<blocksPerStratum*2;rep++){
  const [map,weapon]=C19_STRATA[j],seed=baseSeed+j*10000+rep*17;
  const a=stratifiedAssignmentC17({map,loadout:weapon,seed,replicate:rep,experimentSeed});
  jobs.push({id:`s${j}-r${rep}`,mode:'tdm',map,weapon,seed,replicate:rep,block:a.block,arm:a.arm,
   experimentSeed,assignmentDraw:a.draw,capSeconds});
 }
 const p={schema:'fpsarena-c19-natural-end-preregistered-v1',study:'natural-end TDM, 600-second administrative censoring',
  design:'stratified 1:1 pre-assigned blocks; all assigned matches included in ITT regardless of intervention',
  blocksPerStratum,experimentSeed,baseSeed,capSeconds,sourceFingerprint,
  policy:'C16 safety-gated exploration, research-only',snapshotLagMs:65,bots:5,opponents:'stress',jobs};
 return {...p,registrationSHA256:sha(p)};
}
export function analyzeNaturalEndC19(plan,rows,{replicates=8000,analysisSeed=190119}={}){
 if(!plan||!int(replicates)||replicates>50000||!int(analysisSeed)||
  sha(Object.fromEntries(Object.entries(plan).filter(([k])=>k!=='registrationSHA256')))!==plan.registrationSHA256||
  !Array.isArray(rows)||rows.length!==plan.jobs?.length)throw Error('C19 tampered preregistration or missing matches');
 const jobs=new Map(plan.jobs.map(j=>[j.id,j]));
 if(jobs.size!==plan.jobs.length||new Set(plan.jobs.map(j=>j.seed)).size!==plan.jobs.length)throw Error('C19 duplicate job or game seed');
 const seen=new Set();let natural=0,censored=0,durations=[];
 for(const row of rows){const j=jobs.get(row?.jobId),r=row?.result,obs=row?.observation;
  if(!j||seen.has(j.id))throw Error('C19 unknown or duplicate trial');seen.add(j.id);
  if(row.arm!==j.arm||row.cohort!=='stratified'||row.variant!=='17'||
   row.fullMatch!==true||row.capSeconds!==j.capSeconds||
   r?.seed!==j.seed||r?.map!==j.map||r?.primaryLoadout!==j.weapon||r?.mode!=='tdm'||
   !Number.isFinite(r.duration)||r.duration<=0||r.duration>j.capSeconds+0.02||
   r?.c19NaturalTrial?.requested!==true||r.c19NaturalTrial.capSeconds!==600||
   r.c19NaturalTrial.serverTerminal!==r.finishedNaturally||
   r.c19NaturalTrial.rightCensored===r.finishedNaturally||
   (r.finishedNaturally&& (r.termination!=='results'||Math.max(...Object.values(r.modeState?.scores||{}))!==50))||
   (!r.finishedNaturally&&(r.termination!=='match'||Math.abs(r.duration-600)>0.03))||
   obs?.metadata?.seed!==j.seed||obs.metadata.assignment?.replicate!==j.replicate||
   obs.metadata.assignment?.block!==j.block||obs.metadata.assignment?.arm!==j.arm||
   obs.metadata.assignment?.draw!==j.assignmentDraw||obs.metadata.assignment?.experimentSeed!==j.experimentSeed)
   throw Error('C19 invalid match termination or provenance: '+j.id);
  if(r.finishedNaturally)natural++;else censored++;
  durations.push(r.duration);
 }
 const base=analyzeStratifiedC17(rows,{minimumBlocks:plan.blocksPerStratum*C19_STRATA.length,
  minimumExposedPerArm:0,randomizationSeed:analysisSeed,bootstrapReplicates:100});
 if(base.completeBlocks!==plan.jobs.length/2||base.incompleteBlocks.length)throw Error('C19 incomplete paired blocks');
 const strata=new Map();for(const b of base.blockResults){const a=strata.get(b.stratum)||[];a.push(b);strata.set(b.stratum,a);}
 if(strata.size!==C19_STRATA.length||[...strata.values()].some(g=>g.length!==plan.blocksPerStratum))throw Error('C19 stratum imbalance');
 const random=rng(analysisSeed),boots=[],flips=[];
 for(let k=0;k<replicates;k++){
  const bs=[],perm=[];
  for(const g of strata.values()){
   for(let j=0;j<g.length;j++)bs.push(g[Math.floor(random()*g.length)].killDiffITT);
   for(const b of g)perm.push((random()<.5?-1:1)*b.killDiffITT);
  }boots.push(avg(bs));flips.push(avg(perm));
 }
 boots.sort((a,b)=>a-b);
 const observed=avg(base.blockResults.map(b=>b.killDiffITT)),ci=[quantile(boots,.025),quantile(boots,.975)];
 const arms=Object.fromEntries(['control','treatment'].map(arm=>{const rr=rows.filter(r=>r.arm===arm);
  return [arm,{matches:rr.length,kills:rr.reduce((s,x)=>s+x.result.kills,0),deaths:rr.reduce((s,x)=>s+x.result.deaths,0),
   offers:rr.reduce((s,x)=>s+x.observation.offers.length,0),interventionTicks:rr.reduce((s,x)=>s+x.observation.diagnostics.interventionTicks,0),
   naturalEnds:rr.filter(x=>x.result.finishedNaturally).length,censored:rr.filter(x=>!x.result.finishedNaturally).length,
   meanDurationSeconds:+avg(rr.map(x=>x.result.duration)).toFixed(2)}];}));
 const perStratum=[...strata].map(([name,b])=>({name,blocks:b.length,itt:avg(b.map(x=>x.killDiffITT))}));
 // With one randomized block per stratum, within-stratum bootstrap is degenerate:
 // do not report it as a confidence interval. Two or more blocks are required.
 const supportedCI=plan.blocksPerStratum>=2?ci:null;
 const pValue=(flips.filter(x=>Math.abs(x)>=Math.abs(observed)-1e-12).length+1)/(replicates+1);
 return {schema:'fpsarena-c19-natural-end-analysis-v1',registrationSHA256:plan.registrationSHA256,
  assignedMatches:rows.length,completeBlocks:base.completeBlocks,naturalEnded:natural,administrativelyCensored:censored,
  hoursSimulated:+(durations.reduce((s,x)=>s+x,0)/3600).toFixed(4),arms,observedITT:observed,
  stratifiedBootstrapCI95:supportedCI,pairedSignFlipP:pValue,bootstrapReplicates:replicates,
  byStratum:perStratum,leaveOneStratumOut:perStratum.map(s=>({removed:s.name,itt:avg(base.blockResults.filter(x=>x.stratum!==s.name).map(x=>x.killDiffITT))})),
  note:'Effects are randomized ITT on simulated game seeds, not per-offer counterfactual rewards. Natural ends and capped outcomes are reported separately.',
  productionPromotionAllowed:false,neuralValueTrainingAllowed:false,
  inferenceWarnings:plan.blocksPerStratum<2?['one-block-per-stratum: stratified bootstrap CI is unidentifiable']:[],
  limitations:['Finite game-bot population; no real browser FPS benchmark','Six fixed weapon-map strata with limited replication',
   'Administrative 600s ceiling creates right-censored matches; outcome is observed kill differential at terminal/cap',
   'Independent seeds within randomized blocks, not identical-state counterfactual replays']};
}
