// C20: shared-seed, two-branch simulation. Research evaluation, not deployment.
import {createHash} from 'node:crypto';
import {C19_STRATA} from './natural-end-study-c19.mjs';
import {stratifiedAssignmentC17} from './stratified-exploration-c17.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const positiveInt=x=>Number.isSafeInteger(x)&&x>0;
const avg=x=>x.reduce((a,b)=>a+b,0)/x.length;
const round=x=>Math.round(x*1e6)/1e6;
function rng(seed){let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let z=x;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};}
const q=(sorted,p)=>sorted[Math.floor((sorted.length-1)*p)];
export function createMatchedSeedPlanC20({pairsPerStratum=2,experimentSeed=200020,baseSeed=20200000,sourceFingerprint='unverified'}={}){
 if(!positiveInt(pairsPerStratum)||pairsPerStratum>30||!positiveInt(experimentSeed)||!positiveInt(baseSeed)||baseSeed+1000000>Number.MAX_SAFE_INTEGER||
 typeof sourceFingerprint!=='string'||!sourceFingerprint)throw Error('C20 invalid preregistration configuration');
 const jobs=[];
 for(let i=0;i<C19_STRATA.length;i++)for(let block=0;block<pairsPerStratum;block++){
  const [map,weapon]=C19_STRATA[i],seed=baseSeed+i*100000+block*101;
  for(let parity=0;parity<2;parity++){
   const replicate=2*block+parity,a=stratifiedAssignmentC17({map,loadout:weapon,seed,replicate,experimentSeed});
   jobs.push({id:`s${i}-b${block}-${a.arm}`,pairId:`s${i}-b${block}`,stratum:`tdm|${map}|${weapon}`,map,weapon,seed,
    block,replicate,arm:a.arm,assignmentDraw:a.draw,experimentSeed,capSeconds:600});
  }
 }
 const body={schema:'fpsarena-c20-matched-seed-preregistered-v1',design:'paired common-random-numbers simulator forks, both arms observed per shared seed',
  inference:'paired controlled simulator contrasts (not human causal or per-action counterfactual labels)',policy:'unchanged C16 safety-gated micro-strafe',
  pairsPerStratum,experimentSeed,baseSeed,sourceFingerprint,capSeconds:600,lagMs:65,opponents:'stress',bots:5,jobs};
 return {...body,registrationSHA256:sha(body)};
}
export function analyzeMatchedSeedC20(plan,rows,{bootstrapReplicates=4000,bootstrapSeed=200120}={}){
 if(!plan||sha(Object.fromEntries(Object.entries(plan).filter(([k])=>k!=='registrationSHA256')))!==plan.registrationSHA256||
 !positiveInt(bootstrapReplicates)||bootstrapReplicates>50000||!positiveInt(bootstrapSeed)||!Array.isArray(rows)||rows.length!==plan.jobs?.length)
 throw Error('C20 invalid preregistration, analysis configuration or missing job');
 const expected=new Map(plan.jobs.map(x=>[x.id,x]));if(expected.size!==plan.jobs.length)throw Error('Duplicate registered trial');
 const pairs=new Map(),seen=new Set(),seenSeeds=new Map();let natural=0,censored=0;
 for(const row of rows){
  const j=expected.get(row?.jobId),r=row?.result,o=row?.observation,a=o?.metadata?.assignment,d=o?.diagnostics;
  if(!j||seen.has(j.id))throw Error('C20 duplicate/unknown job');seen.add(j.id);
  const recon=stratifiedAssignmentC17({map:j.map,loadout:j.weapon,seed:j.seed,replicate:j.replicate,experimentSeed:j.experimentSeed});
  if(row.arm!==j.arm||j.arm!==recon.arm||j.assignmentDraw!==recon.draw||row.fullMatch!==true||row.capSeconds!==600||
   r?.mode!=='tdm'||r.seed!==j.seed||r.map!==j.map||r.primaryLoadout!==j.weapon||
   ![r.kills,r.deaths,r.shots,r.errors,r.damageDealt,r.damageTaken,r.duration].every(Number.isFinite)||r.errors!==0||
   r.duration<=0||r.duration>600.02||typeof r.finishedNaturally!=='boolean'||
   r.c19NaturalTrial?.requested!==true||r.c19NaturalTrial.capSeconds!==600||r.c19NaturalTrial.serverTerminal!==r.finishedNaturally||
   r.c19NaturalTrial.rightCensored===r.finishedNaturally||
   r.c20MatchedSeedTrial?.requested!==true||r.c20MatchedSeedTrial.design!=='controlled-paired-simulator-forks'||
   r.c20MatchedSeedTrial.pairSeed!==j.seed||r.c20MatchedSeedTrial.arm!==j.arm||r.c20MatchedSeedTrial.replicate!==j.replicate||
   (r.finishedNaturally&&(r.termination!=='results'||Math.max(...Object.values(r.modeState?.scores||{}))!==50))||
   (!r.finishedNaturally&&(r.termination!=='match'||Math.abs(r.duration-600)>.03))||
   o?.metadata?.seed!==j.seed||o.metadata.mode!=='tdm'||o.metadata.map!==j.map||o.metadata.loadout!==j.weapon||
   o.metadata.productionActuation!==false||o.metadata.explorationAlgorithm!=='c16-lazy-geometry-c15-scheduler'||
   a?.randomized!==true||a.seed!==j.seed||a.arm!==j.arm||a.draw!==j.assignmentDraw||a.replicate!==j.replicate||a.block!==j.block||
   a.experimentSeed!==j.experimentSeed||a.assignmentProbability!==.5||a.treatmentProbability!==.5||
   !a.independence?.startsWith('controlled paired simulator forks: SAME game seed')||
   !Number.isSafeInteger(d?.interventionTicks)||d.interventionTicks<0||
   !Array.isArray(o.offers)||o.offers.some(x=>x.seed!==j.seed||x.arm!==j.arm||x.validity?.serverOnlyFeaturesUsed!==false)||
   (j.arm==='control'&&d.interventionTicks!==0))throw Error('C20 failed source/arm/outcome provenance '+j.id);
  natural+=r.finishedNaturally?1:0;censored+=r.finishedNaturally?0:1;
  const existing=seenSeeds.get(j.seed);if(existing&&existing!==j.pairId)throw Error('C20 seed reused in separate pairs');seenSeeds.set(j.seed,j.pairId);
  const p=pairs.get(j.pairId)||{pairId:j.pairId,stratum:j.stratum,seed:j.seed};
  if(p[j.arm])throw Error('C20 duplicate arm in pair');p[j.arm]={result:r,observation:o};pairs.set(j.pairId,p);
 }
 if(pairs.size!==plan.jobs.length/2||[...pairs.values()].some(x=>!x.control||!x.treatment))throw Error('C20 incomplete paired seed');
 const strata=new Map(),deltas=[];let noActuationPairs=0,matchedNoActuation=0;
 for(const p of pairs.values()){
  const t=p.treatment.result,c=p.control.result,delta=(t.kills-t.deaths)-(c.kills-c.deaths);
  const row={pairId:p.pairId,stratum:p.stratum,seed:p.seed,delta,
   control:{kills:c.kills,deaths:c.deaths,shots:c.shots,duration:c.duration},
   treatment:{kills:t.kills,deaths:t.deaths,shots:t.shots,duration:t.duration},
   treatmentOffers:p.treatment.observation.offers.length,interventionTicks:p.treatment.observation.diagnostics.interventionTicks,
   censored:!(t.finishedNaturally&&c.finishedNaturally)};
  // No active override must retain gameplay identity under the same seed.
  if(row.interventionTicks===0){noActuationPairs++;if(delta===0&&t.shots===c.shots&&t.duration===c.duration&&t.damageDealt===c.damageDealt&&t.damageTaken===c.damageTaken)matchedNoActuation++;else throw Error('C20 no-op fork divergence '+p.pairId);}
  const st=strata.get(p.stratum)||[];st.push(row);strata.set(p.stratum,st);deltas.push(row);
 }
 if(strata.size!==C19_STRATA.length||[...strata.values()].some(v=>v.length!==plan.pairsPerStratum))throw Error('C20 incomplete strata');
 // Canonical pair/stratum ordering makes bootstrap independent of result file enumeration.
 const orderedStrata=new Map([...strata].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,value.sort((a,b)=>a.pairId.localeCompare(b.pairId))]));
 const rand=rng(bootstrapSeed),boots=[];
 for(let b=0;b<bootstrapReplicates;b++){
  const xs=[];for(const g of orderedStrata.values())for(let j=0;j<g.length;j++)xs.push(g[Math.floor(rand()*g.length)].delta);
  boots.push(avg(xs));
 }boots.sort((a,b)=>a-b);
 const itd=avg(deltas.map(x=>x.delta)),ci=plan.pairsPerStratum>=2?[q(boots,.025),q(boots,.975)]:null;
 const byStratum=[...strata].map(([name,g])=>({name,pairs:g.length,meanDelta:avg(g.map(x=>x.delta)),activePairs:g.filter(x=>x.interventionTicks>0).length}));
 const armStats={};for(const arm of ['control','treatment']){
  const r=deltas.map(x=>x[arm]);armStats[arm]={matches:r.length,kills:r.reduce((a,x)=>a+x.kills,0),deaths:r.reduce((a,x)=>a+x.deaths,0),shots:r.reduce((a,x)=>a+x.shots,0),meanDuration:round(avg(r.map(x=>x.duration)))};
 }
 const active=deltas.filter(x=>x.interventionTicks>0).length;
 const benefits={positive:deltas.filter(x=>x.delta>0).length,zero:deltas.filter(x=>x.delta===0).length,negative:deltas.filter(x=>x.delta<0).length};
 return {schema:'fpsarena-c20-common-seed-analysis-v1',registrationSHA256:plan.registrationSHA256,
  matches:rows.length,pairs:deltas.length,naturalEnded:natural,administrativelyCensored:censored,
  baselineIdentity:{noActuationPairs,exactlyIdentical:matchedNoActuation},armStats,
  meanPairedKillDifferential:itd,stratifiedBootstrapCI95:ci,bootstrapReplicates,
  byStratum,leaveOneStratumOut:byStratum.map(x=>({removed:x.name,meanDelta:avg(deltas.filter(d=>d.stratum!==x.name).map(y=>y.delta))})),
  activePairs:active,pairSigns:benefits,pairOutcomes:deltas,
  approval:{neuralActionValueTrainingAllowed:deltas.length>=60&&plan.pairsPerStratum>=8&&active>=30,
   productionPromotionAllowed:false,
   reasons:['C20 pairs are entire game forks, not independently randomized micro-actions',
     ...(deltas.length<60?['fewer than 60 independent paired game seeds']:[]),
     ...(plan.pairsPerStratum<8?['fewer than 8 paired seeds per stratum']:[]),
     ...(active<30?['fewer than 30 pairs with actuation']:[]),
     'No browser/human-opponent validation; safety gates unchanged']},
  notes:['Shared game RNG seed across both arms controls initial world; later RNG streams can diverge because actions change game evolution',
   'Stratified bootstrap interval is descriptive for simulated map/weapon population, not proof of external causality',
   'Both no-offer and no-actuation pairs remain in the primary intention-to-test evaluation; censoring retained']};
}
