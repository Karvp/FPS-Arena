// C25 prospective, fixed-time-grid calibration study. Observation only.
// Train/validation/test are whole MATCHES with a pre-registered split.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const finite=Number.isFinite;
const assert=(x,why)=>{if(!x)throw Error('C25 invalid '+why);};
const hash=obj=>createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const round=x=>finite(x)?+x.toFixed(6):null;
const keys=(x,arr)=>x&&JSON.stringify(Object.keys(x).sort())===JSON.stringify([...arr].sort());
const WINDOW=1.8;
export const C25_ENDPOINT=Object.freeze({timeGridFirstSeconds:3,windowSeconds:1.8,
 primary:'any future server-confirmed hostile weapon hit in the next 1.8s',
 source:'public shot packets DELIVERED pre-window; server labels AFTER opening only',
 split:'2 predeclared training seeds, 1 validation, 1 test per map x weapon; match is unit',
 noIntervention:true});
const mid=m=>`${m.metadata.map}/${m.metadata.loadout}/${m.metadata.seed}`;
export function validateC25(data,plan=null,{excludedSeeds=[]}={}){
 assert(data?.schema==='fpsarena-c25-fixed-grid-dataset-v1'&&data.engine==='uploaded-main'&&Array.isArray(data.matches)&&data.matches.length>0,'dataset root');
 const identities=new Set();let complete=0,positive=0;
 for(const m of data.matches){
  const z=m.metadata;
  assert(m.schema==='fpsarena-c25-fixed-grid-match-v1'&&z?.producer==='headless-simulator'&&z?.mode==='tdm'&&z?.profile==='release'&&
   z.productionActuation===false&&z.observerOnly===true&&z.snapshotLagMs===65&&z.seconds>=10&&z.seconds<=600&&
   Number.isSafeInteger(z.seed)&&z.seed>=0&&z.seed<=0xffffffff&&
   ['arena','foundry','neon'].includes(z.map)&&['mp5sd','hk_sl8','m4a1','aa12'].includes(z.loadout),'match provenance');
  const id=mid(m);assert(!identities.has(id),'duplicate match');identities.add(id);
  assert(m.horizonSeconds===WINDOW&&m.firstWindowSeconds===3&&m.dataLeakagePolicy?.includes('BEFORE')&&m.dataLeakagePolicy?.includes('AFTER'),'temporal definition');
  assert(Array.isArray(m.windows)&&m.events,'missing windows and events');
  let prev=-Infinity;const counters=['hostileShotEvents','hostileNearTracerEvents','hostileWeaponHitEvents','hostileWeaponDamage'];
  const sums=Object.fromEntries(counters.map(k=>[k,0]));
  for(const w of m.windows){
   assert(finite(w.start)&&finite(w.end)&&w.start>=3&&w.start>=prev+WINDOW-1e-4&&Math.abs(w.end-w.start-WINDOW)<1e-4,'fixed nonoverlap');
   const grid=(w.start-3)/WINDOW;assert(Math.abs(grid-Math.round(grid))<.0002,'fixed time grid altered');prev=w.start;
   assert(w.complete===true||w.complete===false,'censor flag');
   assert(w.atRisk===true&&keys(w.publicCueBeforeWindow,['receivedShotCount','receivedNearTracerCount','nearestReceivedTracerMeters','lookbackSeconds','cueDefinition'])&&
    keys(w.publicStatus,['alive','healthFraction','armorFraction'])&&
    keys(w.label,counters),'fields/label leakage');
   const c=w.publicCueBeforeWindow,s=w.publicStatus,l=w.label;
   assert(c.lookbackSeconds===1.5&&c.cueDefinition==='delivered public shot packets only; may include friendlies; no future server labels','cue temporal definition');
   assert(Number.isInteger(c.receivedShotCount)&&c.receivedShotCount>=0&&Number.isInteger(c.receivedNearTracerCount)&&
    c.receivedNearTracerCount>=0&&c.receivedNearTracerCount<=c.receivedShotCount&&
    (c.nearestReceivedTracerMeters===null||(finite(c.nearestReceivedTracerMeters)&&c.nearestReceivedTracerMeters>=0)),'shot cue');
   assert(s.alive===true&&[s.healthFraction,s.armorFraction].every(x=>finite(x)&&x>=0&&x<=1),'public status');
   for(const k of counters){assert(finite(l[k])&&l[k]>=0,'invalid label '+k);if(k!=='hostileWeaponDamage')assert(Number.isInteger(l[k]),'noninteger label '+k);sums[k]+=l[k];}
   assert(l.hostileNearTracerEvents<=l.hostileShotEvents&&((l.hostileWeaponHitEvents===0)===(l.hostileWeaponDamage===0)),'event count/damage inconsistency');
   if(w.complete){assert(w.end<=z.seconds+1e-3,'complete window beyond episode duration');complete++;if(l.hostileWeaponHitEvents>0)positive++;}
   else assert(w.end>=z.seconds-1e-3,'censor not at episode end');
  }
  for(const k of counters)assert(finite(m.events[k])&&m.events[k]>=sums[k]-1e-3,'label/events count mismatch '+k);
  assert(m.events.hostileNearTracerEvents<=m.events.hostileShotEvents,'all tracer counts');
 }
 if(plan){
  assert(plan.schema==='fpsarena-c25-threat-calibration-plan-v1'&&plan.version===1&&
   JSON.stringify(plan.endpoint)===JSON.stringify(C25_ENDPOINT),'preregistered endpoint changed');
  const {registrationSHA256,...unsigned}=plan;assert(registrationSHA256===hash(unsigned),'preregistered hash tampered');
  assert(/^[0-9a-f]{64}$/.test(plan.sourceSHA256),'source hash missing');
  assert(plan.jobs.length===data.matches.length,'job count missing/extra');
  const seenSeed=new Set(excludedSeeds),seenJobs=new Set(),allowed=new Map();
  for(const j of plan.jobs){
   assert(Number.isSafeInteger(j.seed)&&j.seed>=0&&!seenSeed.has(j.seed),'reused seed');seenSeed.add(j.seed);
   assert(['train','validation','test'].includes(j.split)&&/^[a-z0-9_-]+$/.test(j.id)&&!seenJobs.has(j.id),'invalid split or duplicate id');seenJobs.add(j.id);
   assert(['arena','foundry','neon'].includes(j.map)&&['mp5sd','hk_sl8','m4a1','aa12'].includes(j.weapon),'invalid stratum');
   allowed.set(`${j.map}/${j.weapon}/${j.seed}`,j);
  }
  assert(plan.seconds>=10&&plan.seconds<=600&&plan.profile==='release'&&plan.bots===5&&plan.opponents==='stress'&&plan.snapshotLagMs===65,'changed simulation settings');
  for(const m of data.matches){const j=allowed.get(mid(m));assert(j&&m.metadata.seconds===plan.seconds,'unregistered job/changed duration');}
  const byGroup=new Map();for(const j of plan.jobs){const k=j.map+'/'+j.weapon;const g=byGroup.get(k)||{train:0,validation:0,test:0};g[j.split]++;byGroup.set(k,g);}
  for(const g of byGroup.values())assert(g.train===2&&g.validation===1&&g.test===1,'split/stratum imbalance');
 }
 return {matches:data.matches.length,complete,positive};
}
const features=w=>{const c=w.publicCueBeforeWindow,s=w.publicStatus;
 return [Math.min(1,Math.log1p(c.receivedShotCount)/Math.log(31)),
  Math.min(1,Math.log1p(c.receivedNearTracerCount)/Math.log(11)),
  c.nearestReceivedTracerMeters===null?1:Math.min(1,c.nearestReceivedTracerMeters/65),
  s.healthFraction,s.armorFraction];};
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const sigmoidScore=(w,x)=>sigmoid(w.reduce((v,wi,j)=>v+wi*(j?x[j-1]:1),0));
function trainLogistic(rows,lambda){
 const p=6,w=[Math.log((rows.filter(r=>r.y).length+1)/(rows.length+1)),-.1,-.1,0,0,0];
 for(let step=0;step<550;step++){const g=Array(p).fill(0);for(const r of rows){const diff=sigmoidScore(w,r.x)-r.y;g[0]+=diff;for(let j=1;j<p;j++)g[j]+=diff*r.x[j-1];}
  for(let j=0;j<p;j++){g[j]=g[j]/rows.length+(j===0?0:lambda*w[j]);w[j]-=.4*g[j];}}
 return {kind:'regularized-logistic',lambda,weights:w.map(round)};
}
// Small, actual two-layer neural predictor, trained only on frozen training matches.
function predictMLP(net,x){const h=net.w1.map((a,j)=>Math.tanh(net.b1[j]+a.reduce((s,w,k)=>s+w*x[k],0)));
 return sigmoid(net.b2+net.w2.reduce((s,w,j)=>s+w*h[j],0));}
function trainMLP(rows,lambda){const H=7,net={kind:'mlp-5-7-1',lambda,
  w1:Array.from({length:H},(_,j)=>Array.from({length:5},(_,k)=>.12*Math.sin(13+j*17+k*7))),
  b1:Array(H).fill(0),w2:Array.from({length:H},(_,j)=>.04*Math.cos(j*19+7)),
  b2:Math.log((rows.filter(r=>r.y).length+1)/(rows.length+1))};
 for(let t=0;t<350;t++){
  const gw1=net.w1.map(a=>a.map(()=>0)),gb1=Array(H).fill(0),gw2=Array(H).fill(0);let gb2=0;
  for(const r of rows){const hs=net.w1.map((a,j)=>Math.tanh(net.b1[j]+a.reduce((s,w,k)=>s+w*r.x[k],0)));
   const diff=predictMLP(net,r.x)-r.y;gb2+=diff;
   for(let j=0;j<H;j++){gw2[j]+=diff*hs[j];const dj=diff*net.w2[j]*(1-hs[j]*hs[j]);gb1[j]+=dj;
    for(let k=0;k<5;k++)gw1[j][k]+=dj*r.x[k];}}
  net.b2-=.35*gb2/rows.length;
  for(let j=0;j<H;j++){net.w2[j]-=.35*(gw2[j]/rows.length+lambda*net.w2[j]);net.b1[j]-=.35*gb1[j]/rows.length;
   for(let k=0;k<5;k++)net.w1[j][k]-=.35*(gw1[j][k]/rows.length+lambda*net.w1[j][k]);}
 }
 return net;
}
const pModel=(m,x)=>m.kind==='regularized-logistic'?sigmoidScore(m.weights,x):m.kind==='mlp-5-7-1'?predictMLP(m,x):m.probability;
const metrics=rows=>{if(!rows.length)return null;const clip=p=>Math.min(1-1e-9,Math.max(1e-9,p));
 return {windows:rows.length,positive:rows.filter(r=>r.y).length,rate:round(rows.filter(r=>r.y).length/rows.length),
  brier:round(rows.reduce((s,r)=>s+(r.p-r.y)**2,0)/rows.length),
  logLoss:round(rows.reduce((s,r)=>s-(r.y*Math.log(clip(r.p))+(1-r.y)*Math.log(1-clip(r.p))),0)/rows.length)};};
function bootstrapTest(rows,baseline,selected){
 const groups=Map.groupBy(rows,r=>r.matchId),keys=[...groups.keys()];if(keys.length<3)return null;
 let s=25025025;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const d=[];for(let i=0;i<1500;i++){const sample=[];for(let j=0;j<keys.length;j++)sample.push(...groups.get(keys[Math.floor(rand()*keys.length)]));
  const base=metrics(sample.map(r=>({...r,p:pModel(baseline,r.x)}))).brier;
  const cand=metrics(sample.map(r=>({...r,p:pModel(selected,r.x)}))).brier;d.push(base-cand);}
 d.sort((a,b)=>a-b);return {metric:'baseline Brier - selected Brier (positive improvement)',low:round(d[Math.floor(.025*d.length)]),high:round(d[Math.floor(.975*d.length)]),resamples:d.length,clusterUnit:'match'};
}
export function evaluateC25(data,plan,{excludedSeeds=[]}={}){
 const valid=validateC25(data,plan,{excludedSeeds});
 const jobs=new Map(plan.jobs.map(j=>[`${j.map}/${j.weapon}/${j.seed}`,j]));
 const rows=data.matches.flatMap(m=>m.windows.filter(w=>w.complete).map(w=>({x:features(w),y:Number(w.label.hostileWeaponHitEvents>0),matchId:mid(m),split:jobs.get(mid(m)).split,
  cuePositive:w.publicCueBeforeWindow.receivedShotCount>0})));
 const train=rows.filter(r=>r.split==='train'),validation=rows.filter(r=>r.split==='validation'),test=rows.filter(r=>r.split==='test');
 const constant={kind:'constant-prevalence',probability:(train.reduce((s,r)=>s+r.y,0)+1)/(train.length+2)};
 const candidates=[constant,...[.005,.05,.3].map(l=>trainLogistic(train,l)),...[.005,.05].map(l=>trainMLP(train,l))];
 const leaderboard=candidates.map(m=>({kind:m.kind,lambda:m.lambda??null,validation:metrics(validation.map(r=>({...r,p:pModel(m,r.x)})))}));
 // No test-driven selection. Predeclared tie-breaking favors the simpler model.
 const best=leaderboard.reduce((a,b)=>b.validation.logLoss<a.validation.logLoss-1e-8?b:a,leaderboard[0]);
 const selected=candidates[leaderboard.indexOf(best)];
 const evaluateSplit=(rr,m)=>metrics(rr.map(r=>({...r,p:pModel(m,r.x)})));
 const testByCue=Object.fromEntries([true,false].map(c=>[c?'receivedShot':'noReceivedShot',{observations:test.filter(r=>r.cuePositive===c).length,
  hits:test.filter(r=>r.cuePositive===c&&r.y).length}]));
 const gate=train.filter(r=>r.y).length>=40&&validation.filter(r=>r.y).length>=15&&test.filter(r=>r.y).length>=15&&
  new Set(train.map(r=>r.matchId)).size>=18&&new Set(test.map(r=>r.matchId)).size>=12;
 return {schema:'fpsarena-c25-threat-calibration-evaluation-v1',registeredPlanSHA256:plan.registrationSHA256,
  data:{...valid,train:metrics(train.map(r=>({...r,p:constant.probability}))),validation:metrics(validation.map(r=>({...r,p:constant.probability}))),
   test:metrics(test.map(r=>({...r,p:constant.probability})))},
  validationSelection:leaderboard,selected:{kind:selected.kind,lambda:selected.lambda??null},
  holdout:{baseline:evaluateSplit(test,constant),selected:evaluateSplit(test,selected),
   logistic:evaluateSplit(test,candidates[1]),neural:evaluateSplit(test,candidates[4]),
   clusterBootstrap:bootstrapTest(test,constant,selected),byPriorReceivedShotCue:testByCue},
  modelArtifacts:{baseline:constant,selected},trainingGate:{passes:gate,reason:gate?'data-volume gate only, NO policy authorization':'BLOCKED: too few independent matches and confirmed incoming hits'},
  deployment:'DISABLED - predictive model is offline diagnostics only, no new movement or reaction action',
  limitations:['Only past DELIVERED shot packets are features; target label is FUTURE server-confirmed damage, never exposed to agent',
   'Train/validation/test segregated by match and seed, evaluation models selected by validation only',
   'Windows on one match are correlated; bootstrap clusters by whole match',
   'The fixed grid samples actual incumbent Release behavior, not action counterfactuals',
   'Server authoritative hitscan packets are delayed; cannot react to already-resolved hits',
   'Timing fixed to 65ms synthetic lag; no browser/real-world FPS evaluation']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [dataPath,planPath,outPath]=process.argv.slice(2);if(!outPath)throw Error('usage: evaluate-threat-calibration-c25.mjs DATA PLAN OUT');
 const e=evaluateC25(JSON.parse(readFileSync(dataPath,'utf8')),JSON.parse(readFileSync(planPath,'utf8')));
 mkdirSync(path.dirname(path.resolve(outPath)),{recursive:true});writeFileSync(outPath,JSON.stringify(e,null,2)+'\n');
 console.log(`C25 complete=${e.data.complete} positive=${e.data.positive} baseline=${e.holdout.baseline.brier} selected=${e.holdout.selected.brier} gate=${e.trainingGate.passes}`);
}
