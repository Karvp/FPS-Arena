// C18: preregistered, independently-seeded, matched-block long-horizon evaluation.
// The combat policy is C16, unchanged. Never treat post-treatment opportunity
// counts or per-offer outcomes as causal reward labels.
import {createHash} from 'node:crypto';
import {stratifiedAssignmentC17, analyzeStratifiedC17} from './stratified-exploration-c17.mjs';

export const C18_STRATA=Object.freeze([
  Object.freeze(['arena','mp5sd']),Object.freeze(['arena','hk_sl8']),
  Object.freeze(['foundry','aa12']),Object.freeze(['foundry','m4a1']),
  Object.freeze(['neon','m4a1']),Object.freeze(['neon','mp5sd'])
]);
const positiveInteger=n=>Number.isSafeInteger(n)&&n>0;
const mean=xs=>xs.reduce((s,v)=>s+v,0)/xs.length;
function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6d2b79f5)>>>0;let x=s;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
function quantile(sorted,p){return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];}
export function createLongHorizonPlanC18({blocksPerStratum=4,seconds=75,experimentSeed=180018,baseSeed=18180000}={}){
 if(!positiveInteger(blocksPerStratum)||blocksPerStratum>30||!positiveInteger(seconds)||seconds<45||seconds>300||
    !positiveInteger(experimentSeed)||!positiveInteger(baseSeed)||baseSeed+100000>Number.MAX_SAFE_INTEGER)
   throw Error('Invalid pre-registered C18 trial parameters');
 const jobs=[];
 for(let j=0;j<C18_STRATA.length;j++)for(let replicate=0;replicate<blocksPerStratum*2;replicate++){
  const [map,weapon]=C18_STRATA[j];const seed=baseSeed+j*10000+replicate*17;
  const assignment=stratifiedAssignmentC17({map,loadout:weapon,seed,replicate,experimentSeed});
  jobs.push({id:`s${j}-r${replicate}`,mode:'tdm',map,weapon,seed,replicate,block:assignment.block,arm:assignment.arm,
   seconds,experimentSeed,assignmentDraw:assignment.draw});
 }
 const registration={schema:'fpsarena-c18-preregistered-long-horizon-v1',design:'1:1 randomized per map x weapon block; independent seeds',
  sourceEngine:'user-uploaded-main-C7-snapshot',sourcePolicy:'C16 guarded micro-strafe in headless lab',
  population:'six fixed map/weapon strata',blocksPerStratum,seconds,experimentSeed,baseSeed,
  fixedSimulator:{profile:'release',mode:'tdm',opponents:'stress',snapshotLagMs:65,bots:5,headless:true},
  analysis:'all-assigned-match ITT (kills minus deaths); do not condition on post-treatment offers',jobs};
 const fingerprint=createHash('sha256').update(JSON.stringify(registration)).digest('hex');
 return {...registration,registrationSHA256:fingerprint};
}
export function analyzeLongHorizonC18(plan,rows,{bootstrapReplicates=6000,analysisSeed=181818}={}){
 const {registrationSHA256,...body}=plan??{};
 if(createHash('sha256').update(JSON.stringify(body)).digest('hex')!==registrationSHA256||
    !Array.isArray(plan.jobs)||!Array.isArray(rows)||rows.length!==plan.jobs.length||
    !positiveInteger(bootstrapReplicates)||bootstrapReplicates>50000||!positiveInteger(analysisSeed))
   throw Error('C18 plan hash or trial completeness invalid');
 const byId=new Map();
 for(const row of rows){
  if(!row||typeof row.jobId!=='string'||byId.has(row.jobId))throw Error('C18 duplicate or missing job ID');
  byId.set(row.jobId,row);
 }
 for(const job of plan.jobs){
  const row=byId.get(job.id);
  if(!row)throw Error('C18 missing preregistered match: '+job.id);
  const result=row.result,obs=row.observation,a=obs?.metadata?.assignment;
  if(row.arm!==job.arm||row.cohort!=='stratified'||row.variant!=='17'||
     result?.seed!==job.seed||result?.map!==job.map||result?.mode!==job.mode||
     result?.primaryLoadout!==job.weapon||result?.duration!==job.seconds||
     obs?.metadata?.seed!==job.seed||a?.experimentSeed!==job.experimentSeed||
     a?.replicate!==job.replicate||a?.block!==job.block||a?.draw!==job.assignmentDraw||
     a?.arm!==job.arm||result?.c14?.assignment?.arm!==job.arm||
     !result?.explorationProfiler?.instrumented||
     !Number.isFinite(result.explorationProfiler.totalMs)||result.explorationProfiler.totalMs<0)
   throw Error('C18 mismatch in preregistered match or profiling: '+job.id);
 }
 const validated=analyzeStratifiedC17(rows,{minimumBlocks:plan.blocksPerStratum*C18_STRATA.length,
  minimumExposedPerArm:0,randomizationSeed:analysisSeed,bootstrapReplicates:1000});
 const blocks=validated.blockResults;
 if(blocks.length!==plan.jobs.length/2||validated.incompleteBlocks.length)
   throw Error('C18 block completeness mismatch');
 const byStratum=new Map();for(const b of blocks){const v=byStratum.get(b.stratum)||[];v.push(b);byStratum.set(b.stratum,v);}
 if(byStratum.size!==C18_STRATA.length||[...byStratum.values()].some(x=>x.length!==plan.blocksPerStratum))
   throw Error('C18 stratum incompleteness');
 const random=rng(analysisSeed),bootstrap=[],permutations=[];
 // Stratified resampling retains the same weight per *pre-treatment* stratum.
 for(let i=0;i<bootstrapReplicates;i++){
  const sampled=[],signFlip=[];
  for(const group of byStratum.values()){
   for(let k=0;k<group.length;k++)sampled.push(group[Math.floor(random()*group.length)].killDiffITT);
   for(const block of group)signFlip.push((random()<.5?-1:1)*block.killDiffITT);
  }
  bootstrap.push(mean(sampled));permutations.push(mean(signFlip));
 }
 bootstrap.sort((a,b)=>a-b);
 const observed=mean(blocks.map(x=>x.killDiffITT));
 const extreme=permutations.filter(v=>Math.abs(v)>=Math.abs(observed)-1e-12).length;
 const individual=validated.individualMatches;
 const summaryArm=arm=>{
  const xs=individual.filter(x=>x.arm===arm);
  const raw=rows.filter(x=>x.arm===arm);
  return {matches:xs.length,kills:xs.reduce((s,x)=>s+x.kills,0),deaths:xs.reduce((s,x)=>s+x.deaths,0),
   shots:xs.reduce((s,x)=>s+x.shots,0),offers:xs.reduce((s,x)=>s+x.offers,0),
   exposedMatches:xs.filter(x=>x.offers>0).length,interventionTicks:xs.reduce((s,x)=>s+x.interventionTicks,0),
   damageDealt:xs.reduce((s,x)=>s+x.damageDealt,0),damageTaken:xs.reduce((s,x)=>s+x.damageTaken,0),
   explorationCpuMs:raw.reduce((s,x)=>s+x.result.explorationProfiler.totalMs,0)};
 };
 const arms={control:summaryArm('control'),treatment:summaryArm('treatment')};
 const strata=[...byStratum].sort((a,b)=>a[0].localeCompare(b[0])).map(([stratum,bs])=>({stratum,
  blocks:bs.length,ittKillDifferential:mean(bs.map(b=>b.killDiffITT)),
  exposedControl:bs.filter(b=>b.control.offers>0).length,
  exposedTreatment:bs.filter(b=>b.treatment.offers>0).length,
  treatmentInterventionTicks:bs.reduce((s,b)=>s+b.treatment.interventionTicks,0)}));
 // Leave-one-stratum-out analysis is diagnostic, not a model selector.
 const leaveOneStratumOut=strata.map(s=>({removedStratum:s.stratum,
  ittKillDifferential:mean(blocks.filter(b=>b.stratum!==s.stratum).map(b=>b.killDiffITT))}));
 const ci=[quantile(bootstrap,.025),quantile(bootstrap,.975)];
 const blockers=[];
 if(arms.control.exposedMatches<10||arms.treatment.exposedMatches<10)blockers.push('insufficient-predeclared-exposure-support');
 if(ci[0]<=0)blockers.push('positive-combat-benefit-not-demonstrated');
 if(plan.seconds<90)blockers.push('intermediate-horizon-only-not-natural-match-end');
 return {schema:'fpsarena-c18-long-horizon-itt-v1',preregistrationSHA256:registrationSHA256,
  studyMatches:rows.length,completeBlocks:blocks.length,secondsPerMatch:plan.seconds,minutesSimulated:rows.length*plan.seconds/60,
  design:'complete randomized assignment; every match included regardless of post-treatment exposure',
  arms,strata,observedITT:observed,stratifiedBootstrapCI95:ci,
  signFlipMonteCarloP:(extreme+1)/(bootstrapReplicates+1),bootstrapReplicates,
  leaveOneStratumOut,benefitDemonstrated:ci[0]>0,limitationCodes:blockers,
  canTrainNeuralValuePolicy:false,productionPromotionAllowed:false,perOfferCounterfactualRewards:false,
  exploratoryLabel:'descriptive exploratory subgroup and leave-one-stratum-out diagnostics',
  limitations:['Independent game seeds within blocks, not matched counterfactual trajectories',
   'Finite simulated opponents and fixed 65ms snapshot lag',
   'Only explorer.command CPU measured, not browser FPS or end-to-end latency',
   'Post-treatment offers cannot identify causal effects for individual actions']};
}
