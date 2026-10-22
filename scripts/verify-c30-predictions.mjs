#!/usr/bin/env node
// Independent public feature replay & domain-coverage audit. No game/private state reads.
import {readFileSync,writeFileSync} from 'node:fs';
import {neuralLossC30,readFrozenC30} from '../lab/arena/research-policy-c30.mjs';
const model=readFrozenC30('reports/c30/encounters/FROZEN-POLICY.json');
const actions=['baseline','micro-left','micro-right'];
const data=[];
for(const [prefix,n] of [['p',24],['e',36]])for(let i=0;i<n;i++){
 const file=`reports/c30/study/${prefix}${String(i).padStart(3,'0')}.neural.dataset.json`;
 const d=JSON.parse(readFileSync(file,'utf8')).matches[0];
 for(const o of d.offers){
  if(!o.c30?.publicFeatureValues){if(o.c30?.reason)continue;throw Error('Unlabelled offer '+file);}
  const x=o.c30.publicFeatureValues,p=neuralLossC30(model,x);
  const k=p.indexOf(Math.min(...p));
  if(o.c30.selected!==actions[k]||o.selectedAction!==actions[k]||p.some((z,i)=>Math.abs(z-o.c30.prediction[i])>1e-6))throw Error('Invalid replay decision '+file);
  data.push({stage:prefix==='p'?'pilot':'full',weapon:x.slice(4).indexOf(1),offsetRatio:x[3],velocity:x[2],
   action:actions[k],margin:p[2]-p[1],distance:x[0]*100,lagMs:x[1]*250});
 }
}
const split=s=>data.filter(x=>x.stage===s);
const summarise=r=>({offers:r.length,actions:Object.fromEntries(actions.map(a=>[a,r.filter(x=>x.action===a).length])),
 scoreMarginLeftMinusRight:{min:Math.min(...r.map(x=>x.margin)),max:Math.max(...r.map(x=>x.margin)),
 mean:r.reduce((s,x)=>s+x.margin,0)/r.length},
 observedOffsetRatioRange:[Math.min(...r.map(x=>x.offsetRatio)),Math.max(...r.map(x=>x.offsetRatio))],
 byWeapon:Object.fromEntries([0,1,2,3,4,5].map(j=>[j,r.filter(x=>x.weapon===j).length]))});
const out={schema:'fpsarena-c30-frozen-policy-public-replay-audit-v1',
 modelSourceSHA256:model.modelSourceSHA256,trainingRegistration:model.trainingRegistration,
 pilot:summarise(split('pilot')),full:summarise(split('full')),
 inputProvenance:'ONLY recorded delayed client public feature vectors, no future outcomes',
 interpretation:'Neural collapsed to one fixed action in deployed feature distribution. Exact replay must match original command decisions.'};
writeFileSync('reports/c30/study/PREDICTION-REPLAY-AUDIT.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
