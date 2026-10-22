// C17: pre-treatment, match-level stratified randomized assignment.
// Complete two-match blocks have one treatment and one control match,
// randomized within each (mode,map,weapon,block) without game RNG access.
const hashText=(s)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0;};
const isInt=Number.isSafeInteger;
export function stratifiedAssignmentC17({mode='tdm',map,loadout,seed,replicate,experimentSeed=170017}={}){
 if(mode!=='tdm'||!['arena','foundry','neon'].includes(map)||typeof loadout!=='string'||!loadout.trim()||
    !isInt(seed)||seed<0||!isInt(replicate)||replicate<0||!isInt(experimentSeed)||experimentSeed<0)
   throw Error('Invalid C17 pre-treatment block assignment');
 const block=Math.floor(replicate/2),parity=replicate%2;
 const draw=hashText(`${experimentSeed}|${mode}|${map}|${loadout}|${block}`)/4294967296;
 const firstTreatment=draw<.5;
 const arm=(parity===0?firstTreatment:!firstTreatment)?'treatment':'control';
 return {arm,design:'stratified-randomized-match',seed,draw:+draw.toFixed(9),
  treatmentProbability:.5,assignmentProbability:.5,unit:'(mode,map,seed,loadout) match',
  independence:'match-level; block-matched on map and weapon, different game seeds',
  randomized:true,stratum:`${mode}|${map}|${loadout}`,experimentSeed,block,replicate,blockSize:2};
}

export function analyzeStratifiedC17(rows,{minimumBlocks=20,minimumExposedPerArm=10,randomizationSeed=170017,bootstrapReplicates=3000}={}){
 if(!Array.isArray(rows)||!rows.length||!isInt(minimumBlocks)||minimumBlocks<1||
  !isInt(minimumExposedPerArm)||minimumExposedPerArm<0||!isInt(randomizationSeed)||
  !isInt(bootstrapReplicates)||bootstrapReplicates<100||bootstrapReplicates>50000)throw Error('Invalid C17 analysis config');
 const seen=new Set(),seenGameSeeds=new Set(),groups=new Map(),strata=new Map(),individual=[];
 let studySeed=null;
 for(const r of rows){
  const a=r?.observation?.metadata?.assignment,m=r?.observation?.metadata,d=r?.observation?.diagnostics,g=r?.result;
  if(r?.cohort!=='stratified'||r?.variant!=='17'||!a||!m||!d||!g||
    m.explorationAlgorithm!=='c16-lazy-geometry-c15-scheduler'||
    a.design!=='stratified-randomized-match'||a.randomized!==true||
    a.arm!==r.arm||a.arm!==stratifiedAssignmentC17({mode:g.mode,map:g.map,
      loadout:g.primaryLoadout,seed:g.seed,replicate:a.replicate,experimentSeed:a.experimentSeed}).arm||
    a.seed!==g.seed||m.seed!==g.seed||m.mode!==g.mode||m.map!==g.map||m.loadout!==g.primaryLoadout||
    a.stratum!==`${g.mode}|${g.map}|${g.primaryLoadout}`||a.blockSize!==2||
    a.block!==Math.floor(a.replicate/2)||a.treatmentProbability!==.5||a.assignmentProbability!==.5||
    ![g.kills,g.deaths,g.shots,g.errors,g.damageDealt,g.damageTaken].every(Number.isFinite)||
    !isInt(d.interventionTicks)||!Array.isArray(r.observation.offers)||
    m.productionActuation!==false||
    a.draw!==stratifiedAssignmentC17({mode:g.mode,map:g.map,loadout:g.primaryLoadout,seed:g.seed,replicate:a.replicate,experimentSeed:a.experimentSeed}).draw||
    (a.arm==='control'&&d.interventionTicks!==0)||
    r.observation.offers.some(o=>o.arm!==a.arm||o.seed!==g.seed||o.validity?.serverOnlyFeaturesUsed!==false))
    throw Error('Invalid C17 randomized provenance or outcomes');
  if(studySeed===null)studySeed=a.experimentSeed;
  if(studySeed!==a.experimentSeed)throw Error('C17 mixed experiment seeds');
  const matchSeedKey=`${a.stratum}|${g.seed}`;
  if(seenGameSeeds.has(matchSeedKey))throw Error('C17 game seed reused within stratum');
  seenGameSeeds.add(matchSeedKey);
  const key=`${a.stratum}|${a.block}|${a.replicate}`;
  if(seen.has(key))throw Error('Duplicate match replicate in C17');seen.add(key);
  const blockKey=`${a.stratum}|${a.block}`;const group=groups.get(blockKey)||{};
  if(group[a.arm])throw Error('Duplicate arm in block '+blockKey);
  const row={blockKey,stratum:a.stratum,block:a.block,replicate:a.replicate,seed:g.seed,
   arm:a.arm,kills:g.kills,deaths:g.deaths,killDifferential:g.kills-g.deaths,
   shots:g.shots,damageDealt:g.damageDealt,damageTaken:g.damageTaken,
   errors:g.errors,offers:r.observation.offers.length,interventionTicks:d.interventionTicks};
  group[a.arm]=row;groups.set(blockKey,group);individual.push(row);
  const summary=strata.get(a.stratum)||{control:0,treatment:0};summary[a.arm]++;strata.set(a.stratum,summary);
 }
 const blocks=[],incomplete=[];
 for(const [key,g] of groups){
  if(!g.control||!g.treatment){incomplete.push(key);continue;}
  if(g.control.seed===g.treatment.seed)throw Error('C17 block used duplicate game seed');
  if(g.control.errors||g.treatment.errors)throw Error('C17 runtime error');
  blocks.push({key,stratum:g.control.stratum,control:g.control,treatment:g.treatment,
   killDiffITT:g.treatment.killDifferential-g.control.killDifferential,
   damageDiffITT:g.treatment.damageDealt-g.control.damageDealt});
 }
 blocks.sort((a,b)=>a.key.localeCompare(b.key));
 const mean=x=>x.reduce((a,b)=>a+b,0)/Math.max(1,x.length);
 const diffs=blocks.map(b=>b.killDiffITT),observed=blocks.length?mean(diffs):null;
 const exposedControl=individual.filter(x=>x.arm==='control'&&x.offers>0).length;
 const exposedTreatment=individual.filter(x=>x.arm==='treatment'&&x.offers>0).length;
 const reasons=[];
 if(incomplete.length)reasons.push('incomplete-stratified-blocks');
 if(blocks.length<minimumBlocks)reasons.push('too-few-independent-randomization-blocks');
 if(exposedControl<minimumExposedPerArm||exposedTreatment<minimumExposedPerArm)reasons.push('insufficient-opportunity-support');
 if(individual.some(x=>x.errors))reasons.push('runtime-errors');
 const rand=(()=>{let x=randomizationSeed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let z=x;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};})();
 const q=(a,p)=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))];
 let ci=null,pValue=null;
 if(blocks.length){
  const samples=[];let extreme=0;
  for(let i=0;i<bootstrapReplicates;i++){
   let sum=0,permuted=0;
   for(let j=0;j<diffs.length;j++){
    sum+=diffs[Math.floor(rand()*diffs.length)];
    permuted+=(rand()<.5?-1:1)*diffs[j];
   }
   samples.push(sum/diffs.length);
   if(Math.abs(permuted/diffs.length)>=Math.abs(observed)-1e-12)extreme++;
  }
  samples.sort((a,b)=>a-b);ci=[q(samples,.025),q(samples,.975)];
  pValue=(extreme+1)/(bootstrapReplicates+1);
 }
 const stratumSummary=[...strata].sort((a,b)=>a[0].localeCompare(b[0])).map(([stratum,v])=>({stratum,...v}));
 return {schema:'fpsarena-c17-stratified-block-matched-itt-v1',design:'pre-assigned 1:1 randomized match blocks within map,weapon',
  comparison:'intention-to-treat; no conditioning on post-treatment exposure',
  studiedMatches:individual.length,completeBlocks:blocks.length,incompleteBlocks:incomplete,
  exposedControl,exposedTreatment,byStratum:stratumSummary,
  observedKillDifferentialPerMatch:observed,blockBootstrapCI95:ci,blockSignFlipRandomizationP:pValue,
  randomizationSeed,bootstrapReplicates,
  statisticalQualification:'Block sign-flip and bootstrap depend on pre-treatment block formation and independent game-seed units; finite simulations, not humans',
  status:reasons.length?'not-eligible-for-policy-learning':'eligible-for-further-statistical-review',reasonCodes:reasons,
  policyTrainingAllowed:false,promotionEligible:false,perOfferCausalRewardAvailable:false,
  individualMatches:individual,blockResults:blocks};
}
