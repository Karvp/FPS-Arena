// Experimental 2-layer neural predictor for in-match server-confirmed hits.
// Strict: match conditions are the sampling unit, not individual shots.
// This model is NEVER imported into page-agent.js and never controls the bot.
export const C12_FEATURES=['distance','lateralSpeed','radialSpeed','aim','snapshotAge','observedHostiles','onGround'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sig=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const rnd=(seed)=>{let x=seed>>>0;return()=>{x=(x+0x6D2B79F5)>>>0;let z=x;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};};
export function shotVector(r){
 if(r?.schema!=='fpsarena-c12-in-match-shot-v1'||r.eligibility?.featureComplete!==true||
    r.eligibility?.ambiguousShot===true||r.eligibility?.labelSource!=='server-hit-events'||
    r.provenance?.featureSource!=='delayed-public-client-snapshot')return null;
 const f=r.features;if(!f||!C12_FEATURES.every(k=>Number.isFinite(f[k])))return null;
 if(!Number.isSafeInteger(r.seed)||!r.matchId||!r.encounterId||!r.map||!r.mode||
   (r.labels?.serverHit!==0&&r.labels?.serverHit!==1))return null;
 return {x:[clamp(f.distance/200,0,2),clamp(f.lateralSpeed/12,-1,1),
  clamp(f.radialSpeed/12,-1,1),f.aim,clamp(f.snapshotAge/.5,0,1),
  clamp(f.observedHostiles/11,0,1),f.onGround],y:r.labels.serverHit,
  matchId:r.matchId,encounterId:r.encounterId,
  // Pairing is at map/seed/mode, across different profiles as well.
  group:`${r.mode}|${r.map}|${r.seed}`,weapon:r.weaponId};
}
export function flattenDataset(data){
 const matches=Array.isArray(data?.matches)?data.matches:[];
 const seenShots=new Set(),rows=[];let duplicates=0;
 for(const match of matches)for(const row of match.shots||[]){
  if(seenShots.has(row.shotId)){duplicates++;continue;}
  seenShots.add(row.shotId);
  const v=shotVector(row);if(v)rows.push(v);
 }
 return {rows,duplicates,totalShots:matches.reduce((n,m)=>n+(m.shots?.length||0),0)};
}
export function matchSplit(rows,seed=202612){
 const groups=[...new Set(rows.map(r=>r.group))].sort();const random=rnd(seed);
 for(let i=groups.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[groups[i],groups[j]]=[groups[j],groups[i]];}
 const n=groups.length;
 const t=Math.max(1,Math.floor(.2*n)),v=Math.max(1,Math.floor(.2*n));
 const test=new Set(groups.slice(0,t)),valid=new Set(groups.slice(t,t+v));
 return {train:rows.filter(r=>!valid.has(r.group)&&!test.has(r.group)),
  valid:rows.filter(r=>valid.has(r.group)),test:rows.filter(r=>test.has(r.group)),
  groups:{train:n-t-v,valid:v,test:t},groupAssignments:Object.fromEntries(groups.map(g=>[g,test.has(g)?'test':valid.has(g)?'valid':'train']))};
}
function initialize(seed,hidden=10){const r=rnd(seed);const n=C12_FEATURES.length;
 return {featureNames:[...C12_FEATURES],hidden,
  w1:Array.from({length:hidden},()=>Array.from({length:n},()=>(r()-.5)*.2)),
  b1:Array(hidden).fill(0),w2:Array.from({length:hidden},()=>(r()-.5)*.2),b2:0};}
export function inferHitProbability(net,x){
 if(!Array.isArray(x)||x.length!==C12_FEATURES.length||!x.every(Number.isFinite))throw Error('invalid shot features');
 const h=net.w1.map((ws,j)=>Math.tanh(net.b1[j]+ws.reduce((a,w,k)=>a+w*x[k],0)));
 return sig(net.b2+h.reduce((a,v,j)=>a+v*net.w2[j],0));
}
function score(rows,predict){
 if(!rows.length)return null;
 const probs=rows.map(r=>clamp(predict(r.x),1e-6,1-1e-6));
 const brier=probs.reduce((s,p,i)=>s+(p-rows[i].y)**2,0)/rows.length;
 const logLoss=probs.reduce((s,p,i)=>s-(rows[i].y*Math.log(p)+(1-rows[i].y)*Math.log(1-p)),0)/rows.length;
 return {n:rows.length,positive:rows.reduce((s,r)=>s+r.y,0),brier:+brier.toFixed(6),logLoss:+logLoss.toFixed(6)};
}
export function trainMatchShotNeural(data,{seed=202612,epochs=70,minMatches=12,minShots=150}={}){
 const flat=flattenDataset(data);const sample=flat.rows;
 const distinct=[...new Set(sample.map(r=>r.group))];
 const positives=sample.reduce((s,r)=>s+r.y,0);
 const summary={observedShots:flat.totalShots,eligibleShots:sample.length,excludedShots:flat.totalShots-sample.length,
  duplicateShotIds:flat.duplicates,independentMatchConditions:distinct.length,
  positiveShots:positives,negativeShots:sample.length-positives,
  weapons:[...new Set(sample.map(r=>r.weapon))].sort()};
 const base={schema:'fpsarena-c12-match-shot-neural-evaluation-v1',summary,features:C12_FEATURES,
  label:'server hit yes/no on actual in-match trainee shot',causal:false,
  productionEligible:false,policyActuationEnabled:false,
  caveats:['No counterfactual combat improvement measured','Hit labels per shot, not per pellet',
   'Paired profiles of the same map/seed always share a split','Best epoch selected on validation; test set used once']};
 if(distinct.length<minMatches||sample.length<minShots||positives<15||sample.length-positives<15)
  return {...base,status:'insufficient-independent-in-match-data',reason:`Need >=${minMatches} unique match conditions, >=${minShots} valid shots, and 15 events per class; have ${distinct.length}, ${sample.length}, ${positives}/${sample.length-positives}`,model:null};
 const s=matchSplit(sample,seed);
 if([s.train,s.valid,s.test].some(z=>z.length<12||z.every(r=>r.y===0)||z.every(r=>r.y===1)))
  return {...base,status:'insufficient-grouped-split-balance',split:s.groups,model:null};
 let net=initialize(seed),best=null,bestLoss=Infinity,bestEpoch=0;
 const rand=rnd(seed+1);
 for(let epoch=0;epoch<epochs;epoch++){
  const arr=s.train.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
  const lr=.025/(1+epoch*.025);
  for(const {x,y} of arr){
   const h=net.w1.map((ws,j)=>Math.tanh(net.b1[j]+ws.reduce((v,w,k)=>v+w*x[k],0)));
   const p=sig(net.b2+h.reduce((v,z,j)=>v+z*net.w2[j],0));const delta=p-y;
   const old=net.w2.slice();
   for(let j=0;j<net.hidden;j++)net.w2[j]-=lr*(delta*h[j]+.001*net.w2[j]);
   net.b2-=lr*delta;
   for(let j=0;j<net.hidden;j++){
    const d=delta*old[j]*(1-h[j]*h[j]);
    for(let k=0;k<x.length;k++)net.w1[j][k]-=lr*(d*x[k]+.001*net.w1[j][k]);
    net.b1[j]-=lr*d;
   }
  }
  const valid=score(s.valid,x=>inferHitProbability(net,x));
  if(valid.brier<bestLoss){bestLoss=valid.brier;best=structuredClone(net);bestEpoch=epoch+1;}
 }
 const constant=s.train.reduce((sum,r)=>sum+r.y,0)/s.train.length;
 const holdout=score(s.test,x=>inferHitProbability(best,x));
 const baseline=score(s.test,()=>constant);
 return {...base,status:'research-model-evaluated',split:{...s.groups,trainShots:s.train.length,
  validationShots:s.valid.length,testShots:s.test.length},selectedEpoch:bestEpoch,
  validation:score(s.valid,x=>inferHitProbability(best,x)),
  holdout,constantRateBaseline:baseline,improvesHeldoutBrier:holdout.brier<baseline.brier,
  model:best};
}
