// Authoritative fireWeapon instrument: event-level server shot + damage labels,
// 100% headless, fixed aim, no map occlusion / opponent response / browser network.
// No client private state is passed to the agent; this is a sandbox evaluation tool.
import {mkdirSync,writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fitDamageCalibration,evaluateDamageCalibration} from '../engagement-calibration.mjs';
import {authoritativeShotTrial} from '../lab/arena/server-shot-harness-c11.mjs';
import {gunStats,cleanAtt} from '../lab/arena/source-main/shared/attachments.js';
const {values:args}=parseArgs({options:{out:{type:'string'},shots:{type:'string'},seed:{type:'string'}}});
const shots=Number(args.shots??'256');
if(!Number.isInteger(shots)||shots<16||shots>2048)throw Error('shots 16..2048');
const seed=Number(args.seed??'51011');
if(!Number.isSafeInteger(seed)||seed<0)throw Error('seed must be a nonnegative integer');
const root=path.dirname(fileURLToPath(import.meta.url));
const outDir=path.resolve(root,'../reports/c11');mkdirSync(outDir,{recursive:true});
const outPath=path.resolve(args.out||path.join(outDir,'server-calibration.json'));
const ids=['mp5sd','m4a1','aa12','hk_sl8','l115a3'];
const configs=[
 {distance:12,aim:false,att:'',speed:0},
 {distance:35,aim:true,att:'',speed:3},
 {distance:70,aim:true,att:'',speed:7},
 {distance:115,aim:true,att:'',speed:3},
 {distance:150,aim:true,att:'',speed:8},
 {distance:90,aim:true,att:'suppressor',speed:7},
 {distance:40,aim:false,att:'laser',speed:4},
 {distance:210,aim:true,att:'',speed:6},
];
const motions=['constant','brake','reverse'];
const lags=[.065,.16];
// Build an isolated minimum server game facade but execute REAL fireWeapon(),
// server poseAt() interpolation, shared weaponstate, spreadDir(), rayWorld() and damageAt().
// Distinct train/holdout partitions have separate deterministic seq ranges.
const training=[],holdout=[],examples=[],eventTrace=[];
for(let i=0;i<ids.length;i++)for(let c=0;c<configs.length;c++)for(let m=0;m<motions.length;m++)for(let l=0;l<lags.length;l++){
 const v=configs[c],att=cleanAtt(ids[i],v.att);
 const w=gunStats(ids[i],att);if(!w||w.melee)continue;
 for(const split of ['train','holdout']){
  // STRICT geometry holdout: held-out distances, lateral speeds and delays
  // are not present in training. RNG sequences are also entirely disjoint.
  const hold=split==='holdout';
  const distance=v.distance+(hold?2.75+.5*c:0);
  const speed=v.speed+(hold&&v.speed>0?.65:0);
  const lag=lags[l]+(hold?.012:0);
  const key=`${ids[i]}-${c}-${m}-${l}-${split}`;
  const trial=authoritativeShotTrial({weaponId:ids[i],att,distance,aim:v.aim,speed,
   motion:motions[m],lag,rewind:false,shotCount:shots,
   shotSeed:seed+100000*i+10000*c+1000*m+500*l+(hold?5000000:0)});
  const contextId=JSON.stringify([ids[i],att,distance,v.aim,speed>0?speed:0,
   speed>0?motions[m]:'static',speed>0?lag:0]);
  const r={...trial.result,scenarioId:key,contextId,split};
  (hold?holdout:training).push(r);
  if(examples.length<10)examples.push({scenarioId:key,shot:trial.events.find(e=>e.type==='shot'),hit:trial.events.find(e=>e.type==='hit')||null});
  if(eventTrace.length<12000 && c<=1 && m===0 && l===0 && i<=3){
   for(const e of trial.events)eventTrace.push({scenarioId:key,split,...e});
  }
 }
}
// Explicit server rewind diagnostics, never used as labels for the unrewound estimator.
const controls=[];
for(const id of ids){
 const r=authoritativeShotTrial({weaponId:id,distance:70,aim:true,speed:7,lag:.16,
  rewind:true,shotCount:shots,shotSeed:seed+99700});
 controls.push(r.result);
}
const model=fitDamageCalibration(training);
const trainMetrics=evaluateDamageCalibration(training,model),testMetrics=evaluateDamageCalibration(holdout,model);
const byFamily={},holdoutSeen=new Set();for(const r of holdout){if(holdoutSeen.has(r.contextId))continue;holdoutSeen.add(r.contextId);const o=byFamily[r.family]||(byFamily[r.family]={n:0,rawAbsError:0,calibratedAbsError:0});
 o.n++;o.rawAbsError+=Math.abs(r.predictedDamage-r.observedDamage);
 o.calibratedAbsError+=Math.abs((model.groups[r.family]?.gain||1)*r.predictedDamage-r.observedDamage);}
for(const v of Object.values(byFamily)){v.rawMAE=v.rawAbsError/v.n;v.calibratedMAE=v.calibratedAbsError/v.n;delete v.rawAbsError;delete v.calibratedAbsError;}
// Bootstrap at the distinct-geometry level, never at the pellet/shot level.
const uniqueHoldout=holdout.filter((r,i,rows)=>rows.findIndex(x=>x.contextId===r.contextId)===i);
const deltas=uniqueHoldout.map(r=>Math.abs(r.predictedDamage-r.observedDamage)-
 Math.abs((model.groups[r.family]?.gain||1)*r.predictedDamage-r.observedDamage));
let rng=(seed^0x71cfa21)>>>0;const draw=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
const bootstrap=[];for(let k=0;k<800;k++){let v=0;for(let i=0;i<deltas.length;i++)v+=deltas[Math.floor(draw()*deltas.length)];bootstrap.push(v/deltas.length);}
bootstrap.sort((a,b)=>a-b);
const improvementCI={maeImprovement: (testMetrics.raw.mae??0)-(testMetrics.calibrated.mae??0),
 low95:bootstrap[20],high95:bootstrap[779],draws:800,unit:'distinct held-out geometry'};
const promotionEligible=(testMetrics.raw.mae!==null&&testMetrics.calibrated.mae<testMetrics.raw.mae*.97 &&
 Object.values(byFamily).every(f=>f.calibratedMAE<=f.rawMAE*1.02+.02));
const output={version:'fpsarena-c11-server-shot-calibration-v1',date:'2026-10-12',
 environment:'uploaded fps-arena-main server/combat.js fireWeapon on isolated 2-player game facade',
 eventTypes:['shot','hit'],unitOfIndependence:'unique weapon/motion/distance/lag/attachment scene configuration',
 config:{shotCountPerScenario:shots,trainingContexts:training.length,holdoutContexts:holdout.length,
  seed,shotgunPelletEventsAggregatedPerTarget:true},model,
 evaluation:{train:trainMetrics,holdout:testMetrics,byFamily,
 promotionEligible:false,offlineHoldoutGatePassed:promotionEligible&&improvementCI.low95>0 &&
 testMetrics.calibrated.rmse<=testMetrics.raw.rmse*1.01,
 improvementCI,
 explanation:'Even a passing offline gate cannot authorize production; this run has no real-match validation.'},rewindControls:controls,
 caveats:['direct fireWeapon calls bypass stepWeapons fire rate, recoil and ammo for isolated per-trigger outcomes','fixed aim and artificial open world','no player reactive aim or map cover','no lag jitter','server-event damage is pre-armor','strict holdout uses unseen geometric distances, speeds and delays','separate firing sequences are not independent games','conditional model selection knows simulated trajectory family','never interpreted as actual match K/D or causal intervention benefit'],
 examples,training,holdout};
writeFileSync(outPath,JSON.stringify(output,null,2));
writeFileSync(path.join(path.dirname(outPath),'shot-events-sample.ndjson'),eventTrace.map(e=>JSON.stringify(e)).join('\n')+'\n');
console.log(JSON.stringify({outPath,training:training.length,holdout:holdout.length,holdoutMetrics:testMetrics,groups:Object.keys(model.groups).length},null,2));
