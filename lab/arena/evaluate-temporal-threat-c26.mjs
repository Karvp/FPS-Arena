// C26: frozen C25 development cohort -> NEW seed holdout at 35/65/125ms.
// No production actuation. All features derive from public snapshots delivered
// BEFORE their own window; never consume historical server labels as features.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateC25} from './evaluate-threat-calibration-c25.mjs';
const err=(msg)=>{throw Error('C26 '+msg);};
const check=(v,msg)=>{if(!v)err(msg);};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(6):null;
export const C26_LAGS=Object.freeze([35,65,125]);
export const C26_STRATA=Object.freeze([['arena','mp5sd'],['arena','hk_sl8'],['foundry','m4a1'],['foundry','aa12'],['neon','m4a1'],['neon','mp5sd']]);
export const C26_ENDPOINT=Object.freeze({horizonSeconds:1.8,firstSeconds:3,
 outcome:'any server confirmed hostile weapon hit AFTER public pre-window snapshot',
 split:'C25 12 train and 6 validation matches; C25 previous test excluded; C26 18 all-new holdout matches',
 latencyMs:[35,65,125],observerOnly:true,noPolicyActuation:true});
const id=m=>`${m.metadata.map}/${m.metadata.loadout}/${m.metadata.seed}`;
const identity=j=>`${j.map}/${j.weapon}/${j.seed}`;
const shot=w=>w.publicCueBeforeWindow;
const status=w=>w.publicStatus;
function single(w){const c=shot(w),s=status(w);return [
 Math.min(1,Math.log1p(c.receivedShotCount)/Math.log(31)),
 Math.min(1,Math.log1p(c.receivedNearTracerCount)/Math.log(11)),
 c.nearestReceivedTracerMeters===null?1:Math.min(1,c.nearestReceivedTracerMeters/65),
 s.healthFraction,s.armorFraction];}
const maps=['arena','foundry','neon'],guns=['mp5sd','hk_sl8','m4a1','aa12'];
export function publicTemporalFeatures(match,index){
 const windows=match.windows,w=windows[index];check(w?.complete,'cannot learn censored window');
 const prev=(n)=>{const old=windows[index-n];
  // Only consecutive, already-delivered snapshots can be joined; no hidden labels.
  return old&&old.complete&&Math.abs(w.start-old.start-1.8*n)<1e-4?old:null;};
 const one=prev(1),two=prev(2);
 return [...single(w),...(one?single(one):Array(5).fill(0)),...(two&&one?single(two):Array(5).fill(0)),
  Number(!!one),Number(!!two&&!!one),...maps.map(v=>Number(match.metadata.map===v)),...guns.map(v=>Number(match.metadata.loadout===v))];
}
export function validateC26Holdout(data,plan,development,developmentPlan){
 validateC25(development,developmentPlan);
 check(data?.schema==='fpsarena-c25-fixed-grid-dataset-v1'&&data.engine==='uploaded-main'&&Array.isArray(data.matches),'dataset root');
 check(plan?.schema==='fpsarena-c26-temporal-study-v1'&&plan.version===1&&
  JSON.stringify(plan.endpoint)===JSON.stringify(C26_ENDPOINT),'endpoint changed');
 const {registrationSHA256,...unsigned}=plan;
 check(registrationSHA256===hash(unsigned),'registration hash tampered');
 check(plan.profile==='release'&&plan.seconds>=10&&plan.seconds<=600&&plan.bots===5&&plan.opponents==='stress'&&plan.jobs.length===18&&data.matches.length===18,'cohort mismatch');
 check(plan.developmentRegistrationSHA256===developmentPlan.registrationSHA256&&plan.developmentDatasetSHA256===hash(development),'development artifacts changed');
 const oldSeeds=new Set(development.matches.map(m=>m.metadata.seed)),jobs=new Map(),seeds=new Set();
 for(const j of plan.jobs){check(C26_STRATA.some(s=>s[0]===j.map&&s[1]===j.weapon)&&C26_LAGS.includes(j.lagMs)&&Number.isSafeInteger(j.seed)&&!oldSeeds.has(j.seed)&&!seeds.has(j.seed),'reused/invalid seed');
  check(!jobs.has(identity(j)),'duplicate job');seeds.add(j.seed);jobs.set(identity(j),j);}
 check(new Set([...jobs.values()].map(j=>j.map+'/'+j.weapon+'/'+j.lagMs)).size===18,'stratum-lag incomplete');
 const seen=new Set();let complete=0,positive=0;
 for(const m of data.matches){const z=m.metadata,j=jobs.get(id(m));check(j&&!seen.has(id(m)),'missing or duplicate match');seen.add(id(m));
  check(m.schema==='fpsarena-c25-fixed-grid-match-v1'&&z.producer==='headless-simulator'&&z.mode==='tdm'&&z.profile==='release'&&z.observerOnly===true&&z.productionActuation===false&&z.snapshotLagMs===j.lagMs&&z.seconds===plan.seconds,'provenance incorrect');
  check(m.horizonSeconds===1.8&&m.firstWindowSeconds===3&&m.dataLeakagePolicy?.includes('BEFORE'),'temporal definition');
  const fields=['hostileShotEvents','hostileNearTracerEvents','hostileWeaponHitEvents','hostileWeaponDamage'];
  let prev=-Infinity;const sums=Object.fromEntries(fields.map(k=>[k,0]));
  for(const w of m.windows){check(finite(w.start)&&finite(w.end)&&w.start>=3&&w.start>=prev+1.8-1e-4&&Math.abs(w.end-w.start-1.8)<1e-4&&Math.abs((w.start-3)/1.8-Math.round((w.start-3)/1.8))<.0002,'window overlap/schedule');prev=w.start;
   check(w.atRisk===true&&typeof w.complete==='boolean'&&Object.keys(w).sort().join()===['atRisk','complete','end','label','publicCueBeforeWindow','publicStatus','start'].sort().join(),'window shape');
   const c=shot(w),s=status(w),l=w.label;
   check(Object.keys(c).sort().join()===['receivedShotCount','receivedNearTracerCount','nearestReceivedTracerMeters','lookbackSeconds','cueDefinition'].sort().join()&&
    Object.keys(s).sort().join()===['alive','healthFraction','armorFraction'].sort().join()&&
    Object.keys(l).sort().join()===fields.sort().join(),'leakage firewall');
   check(c.cueDefinition==='delivered public shot packets only; may include friendlies; no future server labels'&&c.lookbackSeconds===1.5&&
    Number.isInteger(c.receivedShotCount)&&c.receivedShotCount>=0&&Number.isInteger(c.receivedNearTracerCount)&&c.receivedNearTracerCount>=0&&c.receivedNearTracerCount<=c.receivedShotCount&&
    (c.nearestReceivedTracerMeters===null||finite(c.nearestReceivedTracerMeters)&&c.nearestReceivedTracerMeters>=0),'cue invalid');
   check(s.alive===true&&[s.healthFraction,s.armorFraction].every(a=>finite(a)&&a>=0&&a<=1),'public status invalid');
   for(const k of fields){check(finite(l[k])&&l[k]>=0&&(k==='hostileWeaponDamage'||Number.isInteger(l[k])),'invalid server label');sums[k]+=l[k];}
   check(l.hostileNearTracerEvents<=l.hostileShotEvents&&((l.hostileWeaponHitEvents===0)===(l.hostileWeaponDamage===0)),'server event inconsistent');
   if(w.complete){check(w.end<=z.seconds+1e-3,'complete beyond episode');complete++;positive+=Number(l.hostileWeaponHitEvents>0);}else check(w.end>=z.seconds-1e-3,'bad censor');
  }
  for(const k of fields)check(m.events[k]>=sums[k]-1e-3,'event total mismatch');
 }
 return {matches:18,complete,positive,lags:[...C26_LAGS]};
}
const sigmoid=z=>1/(1+Math.exp(-Math.max(-25,Math.min(25,z))));
const clip=p=>Math.min(1-1e-9,Math.max(1e-9,p));
const dot=(v,x)=>v.reduce((s,a,i)=>s+a*x[i],0);
const predict=(m,x,meta)=>{
 if(m.kind==='constant')return m.p;
 if(m.kind==='stratum-rate'){const v=m.counts[meta.map+'/'+meta.weapon];return (v.positive+m.alpha*m.global)/(v.n+m.alpha);}
 if(m.kind==='logistic')return sigmoid(m.w[0]+dot(m.w.slice(1),m.temporal?x:x.slice(0,5)));
 if(m.kind==='mlp'){const h=m.w1.map((v,i)=>Math.tanh(dot(v,x)+m.b1[i]));return sigmoid(dot(m.w2,h)+m.b2);}
 err('invalid model');};
const seeded=(i,j)=>Math.sin(37*i+17*j+.7)*.06;
function trainLogistic(rows,lambda,temporal){const n=temporal?24:5;
 const base=(rows.filter(r=>r.y).length+.5)/(rows.length+1),w=[Math.log(base/(1-base)),...Array(n).fill(0)];
 for(let t=0;t<500;t++){const g=Array(n+1).fill(0);
  for(const r of rows){const x=temporal?r.x:r.x.slice(0,5),diff=sigmoid(w[0]+dot(w.slice(1),x))-r.y;g[0]+=diff;for(let j=0;j<n;j++)g[j+1]+=diff*x[j];}
  const lr=.4;for(let j=0;j<=n;j++)w[j]-=lr*(g[j]/rows.length+(j?lambda*w[j]:0));}
 return {kind:'logistic',lambda,temporal,w:w.map(round)};}
function trainNeural(rows,lambda){const H=9,D=24,prev=(rows.filter(r=>r.y).length+.5)/(rows.length+1);
 const m={kind:'mlp',lambda,w1:Array.from({length:H},(_,i)=>Array.from({length:D},(_,j)=>seeded(i,j))),b1:Array(H).fill(0),w2:Array.from({length:H},(_,i)=>seeded(50,i)),b2:Math.log(prev/(1-prev))};
 for(let t=0;t<300;t++){const gw1=m.w1.map(a=>a.map(()=>0)),gb1=Array(H).fill(0),gw2=Array(H).fill(0);let gb2=0;
  for(const r of rows){const hs=m.w1.map((a,j)=>Math.tanh(dot(a,r.x)+m.b1[j])),d=sigmoid(dot(m.w2,hs)+m.b2)-r.y;gb2+=d;
   for(let j=0;j<H;j++){gw2[j]+=d*hs[j];const v=d*m.w2[j]*(1-hs[j]*hs[j]);gb1[j]+=v;for(let k=0;k<D;k++)gw1[j][k]+=v*r.x[k];}}
  const lr=.32;m.b2-=lr*gb2/rows.length;for(let j=0;j<H;j++){m.w2[j]-=lr*(gw2[j]/rows.length+lambda*m.w2[j]);m.b1[j]-=lr*gb1[j]/rows.length;
   for(let k=0;k<D;k++)m.w1[j][k]-=lr*(gw1[j][k]/rows.length+lambda*m.w1[j][k]);}}
 m.w1=m.w1.map(v=>v.map(round));m.w2=m.w2.map(round);m.b1=m.b1.map(round);m.b2=round(m.b2);return m;
}
const score=(rows,model)=>{if(!rows.length)return null;let sq=0,ll=0,pos=0;
 for(const r of rows){const p=clip(predict(model,r.x,r.meta));sq+=(p-r.y)**2;ll-=r.y*Math.log(p)+(1-r.y)*Math.log(1-p);pos+=r.y;}
 return {windows:rows.length,positive:pos,brier:round(sq/rows.length),logLoss:round(ll/rows.length)};};
const rowify=(m,split)=>m.windows.flatMap((w,i)=>w.complete?[{x:publicTemporalFeatures(m,i),y:Number(w.label.hostileWeaponHitEvents>0),split,matchId:id(m),meta:{map:m.metadata.map,weapon:m.metadata.loadout,lagMs:m.metadata.snapshotLagMs}}]:[]);
function ciByMatch(rows,baseline,selected){const groups=Map.groupBy(rows,r=>r.matchId),ids=[...groups.keys()];if(ids.length<4)return null;
 let s=26026026;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const diff=[];for(let b=0;b<1200;b++){const take=[];for(let j=0;j<ids.length;j++)take.push(...groups.get(ids[Math.floor(rnd()*ids.length)]));diff.push(score(take,baseline).brier-score(take,selected).brier);}
 diff.sort((a,b)=>a-b);return {unit:'whole match',resamples:diff.length,baselineMinusSelectedBrier:[round(diff[30]),round(diff[1169])]};}
export function evaluateC26(devData,devPlan,holdData,holdPlan){
 const validation=validateC26Holdout(holdData,holdPlan,devData,devPlan);
 const devSplit=new Map(devPlan.jobs.map(j=>[identity(j),j.split]));
 const devRows=devData.matches.flatMap(m=>rowify(m,devSplit.get(id(m))));
 const train=devRows.filter(r=>r.split==='train'),val=devRows.filter(r=>r.split==='validation');
 check(train.length>0&&val.length>0,'development split empty');
 const base={kind:'constant',p:(train.filter(r=>r.y).length+.5)/(train.length+1)};
 const counts={};for(const r of train){const k=r.meta.map+'/'+r.meta.weapon;if(!counts[k])counts[k]={n:0,positive:0};counts[k].n++;counts[k].positive+=r.y;}
 const strat={kind:'stratum-rate',counts,global:base.p,alpha:20};
 const candidates=[base,strat,trainLogistic(train,.005,false),trainLogistic(train,.05,false),trainLogistic(train,.005,true),trainLogistic(train,.05,true),trainNeural(train,.005),trainNeural(train,.05)];
 const scored=candidates.map((m,i)=>({index:i,kind:m.kind,temporal:!!m.temporal,lambda:m.lambda??null,validation:score(val,m)}));
 const rank=[...scored].sort((a,b)=>a.validation.logLoss-b.validation.logLoss||a.index-b.index);
 const chosen=candidates[rank[0].index],test=holdData.matches.flatMap(m=>rowify(m,'test'));
 const lagBreakdown=C26_LAGS.map(lagMs=>{const subset=test.filter(r=>r.meta.lagMs===lagMs);return {lagMs,constant:score(subset,base),stratum:score(subset,strat),selected:score(subset,chosen)};});
 return {schema:'fpsarena-c26-temporal-threat-evaluation-v1',endpoint:C26_ENDPOINT,
  registeredPlanSHA256:holdPlan.registrationSHA256,developmentRegistrationSHA256:devPlan.registrationSHA256,
  data:{developmentTrain:score(train,base),developmentValidation:score(val,base),excludedPreviouslySeenC25TestMatches:devPlan.jobs.filter(j=>j.split==='test').length,
   holdout:validation},validationRanking:rank,selected:{kind:chosen.kind,temporal:!!chosen.temporal,lambda:chosen.lambda??null},
  newSeedHoldout:{constant:score(test,base),stratum:score(test,strat),staticLogistic:score(test,candidates[2]),
   temporalLogistic:score(test,candidates[4]),temporalNeural:score(test,candidates[6]),selected:score(test,chosen),
   byLag:lagBreakdown,matchBootstrap:ciByMatch(test,base,chosen)},
  modelArtifacts:{baseline:base,selected:chosen,validationOnlyOtherCandidates:candidates.filter(m=>m!==chosen).map(m=>({kind:m.kind,temporal:!!m.temporal,lambda:m.lambda??null}))},
  production:'UNMODIFIED - no realtime model inference',
  claimGate:'BLOCKED: independent reproducible value improvement and action effect not demonstrated',
  limitations:['All tests compare prediction under fixed Release Autopilot: NO causal left-vs-right policy effect',
   'History uses only PRE-window delivered public cues from up to two preceding grid points, never server labels',
   'Holdout latency variation is synthetic snapshot lag, not measured browser jitter',
   'Only 6 holdout matches per latency; correlated windows require match-cluster inference']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [dev,devPlan,hold,holdPlan,out]=process.argv.slice(2);if(!out)err('usage: node evaluate-temporal-threat-c26.mjs DEV DEV_PLAN HOLD HOLD_PLAN OUT');
 const result=evaluateC26(...[dev,devPlan,hold,holdPlan].map(p=>JSON.parse(readFileSync(p,'utf8'))));mkdirSync(path.dirname(path.resolve(out)),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 console.log('C26 new holdout:',JSON.stringify({matches:result.data.holdout.matches,windows:result.data.holdout.complete,positive:result.data.holdout.positive,selected:result.selected,baselineBrier:result.newSeedHoldout.constant.brier,selectedBrier:result.newSeedHoldout.selected.brier}));
}
