// C20 neural diagnostic, NOT a deployable per-action Q network.
// Trains on paired match-level policy contrasts; evaluate leave-one-stratum-out.
// Features deliberately limited to pre-treatment map/weapon, never outcomes or seed.
const MAPS=['arena','foundry','neon'],WEAPONS=['mp5sd','hk_sl8','aa12','m4a1'];
const num=x=>typeof x==='number'&&Number.isFinite(x);
const avg=x=>x.reduce((a,b)=>a+b,0)/x.length;
function rand(seed){let n=seed>>>0;return ()=>{n=(n+0x6d2b79f5)>>>0;let x=n;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};}
export function valueFeaturesC20(stratum){
 const p=String(stratum).split('|');if(p.length!==3||p[0]!=='tdm'||!MAPS.includes(p[1])||!WEAPONS.includes(p[2]))throw Error('C20 invalid pre-treatment context');
 return [...MAPS.map(x=>+(p[1]===x)),...WEAPONS.map(x=>+(p[2]===x))];
}
export function fitDiagnosticC20(pairs,{seed=200220,epochs=300,learningRate=.012,hidden=8}={}){
 if(!Array.isArray(pairs)||!pairs.length||!Number.isSafeInteger(seed)||!Number.isInteger(epochs)||epochs<1||epochs>2000||
 !num(learningRate)||learningRate<=0||learningRate>.1||!Number.isInteger(hidden)||hidden<2||hidden>32||
 pairs.some(p=>!num(p.delta)||!Number.isFinite(p.delta)||!p.stratum))throw Error('Invalid C20 neural diagnostic data');
 const rr=rand(seed);const w1=Array.from({length:hidden},()=>Array.from({length:7},()=>((rr()-.5)*.25)));
 const b1=Array(hidden).fill(0),w2=Array.from({length:hidden},()=>((rr()-.5)*.25));let b2=0;
 const data=[...pairs].sort((a,b)=>String(a.pairId).localeCompare(String(b.pairId))).map(p=>({x:valueFeaturesC20(p.stratum),y:Math.max(-2,Math.min(2,p.delta/10))}));
 // Full-batch, regularized MSE with gradient clipping. Seed is initialization only;
 // neither the game seed nor any post-treatment observation enters features.
 for(let e=0;e<epochs;e++){
  const gw1=w1.map(w=>w.map(()=>0)),gb1=b1.map(()=>0),gw2=w2.map(()=>0);let gb2=0;
  for(const {x,y} of data){
   const a=w1.map((row,j)=>Math.tanh(row.reduce((sum,w,k)=>sum+w*x[k],b1[j])));
   const p=b2+w2.reduce((sum,w,j)=>sum+w*a[j],0),error=Math.max(-3,Math.min(3,p-y));
   gb2+=error;
   for(let j=0;j<hidden;j++){
    gw2[j]+=error*a[j];const g=error*w2[j]*(1-a[j]*a[j]);gb1[j]+=g;
    for(let k=0;k<7;k++)gw1[j][k]+=g*x[k];
   }
  }
  const s=learningRate/data.length;
  for(let j=0;j<hidden;j++){
   w2[j]-=s*(gw2[j]+.03*w2[j]);b1[j]-=s*gb1[j];
   for(let k=0;k<7;k++)w1[j][k]-=s*(gw1[j][k]+.03*w1[j][k]);
  }b2-=s*gb2;
 }
 return {schema:'fpsarena-c20-neural-stratum-contrast-v1',seed,epochs,learningRate,hidden,
  features:['arena','foundry','neon','mp5sd','hk_sl8','aa12','m4a1'],w1,b1,w2,b2,
  semanticWarning:'MATCH-LEVEL policy treatment-control contrast, NOT individual action value; research only'};
}
export function predictDiagnosticC20(model,stratum){
 const x=valueFeaturesC20(stratum),a=model.w1.map((r,j)=>Math.tanh(r.reduce((s,w,k)=>s+w*x[k],model.b1[j])));
 return 10*(model.b2+model.w2.reduce((s,w,j)=>s+w*a[j],0));
}
function metrics(rows,key){let mae=0,mse=0;for(const r of rows){const d=r[key]-r.actual;mae+=Math.abs(d);mse+=d*d;}
 return {mae:mae/rows.length,rmse:Math.sqrt(mse/rows.length)};}
export function evaluateDiagnosticC20(analysis,{seed=200220}={}){
 const pairs=analysis?.pairOutcomes;if(!Array.isArray(pairs)||pairs.length<6||new Set(pairs.map(p=>p.stratum)).size<3)
 throw Error('C20 insufficient independent strata for diagnostic');
 const seen=new Set();for(const p of pairs){if(!p.pairId||seen.has(p.pairId)||!num(p.delta))throw Error('Duplicate or invalid paired outcome');seen.add(p.pairId);valueFeaturesC20(p.stratum);}
 const all=[...pairs].sort((a,b)=>a.pairId.localeCompare(b.pairId)),folds=[...new Set(all.map(p=>p.stratum))].sort(),heldout=[];
 for(let f=0;f<folds.length;f++){
  const stratum=folds[f],test=all.filter(p=>p.stratum===stratum),train=all.filter(p=>p.stratum!==stratum);
  if(train.length<3||!test.length)throw Error('Invalid leave-one-stratum-out split');
  const net=fitDiagnosticC20(train,{seed:seed+f}),globalMean=avg(train.map(x=>x.delta));
  for(const p of test)heldout.push({pairId:p.pairId,stratum:p.stratum,actual:p.delta,
   neural:predictDiagnosticC20(net,p.stratum),zero:0,trainMean:globalMean});
 }
 heldout.sort((a,b)=>a.pairId.localeCompare(b.pairId));
 return {schema:'fpsarena-c20-leave-one-stratum-out-diagnostic-v1',pairs:all.length,strata:folds.length,
  split:'leave an entire map-weapon stratum out; paired seed never crosses train/test for a fold',
  models:{neural:metrics(heldout,'neural'),zero:metrics(heldout,'zero'),trainMean:metrics(heldout,'trainMean')},
  heldout,trainedFullData:fitDiagnosticC20(all,{seed}),
  limitation:'Tiny match-level contrasts do not identify individual action-values; no online or production use',
  actionValueModelEligible:false,productionPromotionAllowed:false};
}
