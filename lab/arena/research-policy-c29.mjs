// C29 — Research-only full-Game.step translation of the frozen C28 micro-policy.
// No server state, future labels, player hidden state or production imports.
import {SafeActionExplorerC16} from './safe-action-explorer-c16.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const C29_WEAPONS=Object.freeze(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']);
export const C29_POLICIES=Object.freeze(['baseline','simple','neural']);
export const C29_MODEL_SOURCE='reports/c28/micro-v1/FROZEN-POLICY.json';
const finite=Number.isFinite;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sha256=b=>createHash('sha256').update(b).digest('hex');
const expectedFeatures=['distance/85','lag/.25','baseVelocity/3','offset/5',...C29_WEAPONS.map(w=>`weapon=${w}`)];
function checkMatrix(x,rows,cols){return Array.isArray(x)&&x.length===rows&&x.every(r=>Array.isArray(r)&&r.length===cols&&r.every(finite));}
export function readFrozenC28(file){
 const text=readFileSync(file,'utf8');const f=JSON.parse(text);const w=f.weights;
 if(f.schema!=='fpsarena-c28-frozen-action-value-v1'||f.model!=='MLP 10→24→12→3 sigmoid'||f.preselectedPolicy!=='neural_mlp'||
 JSON.stringify(f.featureNames)!==JSON.stringify(expectedFeatures)||!w||
 !checkMatrix(w['net.0.weight'],24,10)||!checkMatrix(w['net.2.weight'],12,24)||!checkMatrix(w['net.4.weight'],3,12)||
 ![24,12,3].every((n,i)=>{const x=w[`net.${i*2}.bias`];return Array.isArray(x)&&x.length===n&&x.every(finite);})){throw Error('Incompatible or damaged C28 frozen model');}
 return {weights:w,sourceSHA256:sha256(text),model:f.model,featureNames:expectedFeatures};
}
function layer(input,weight,bias,activation){return weight.map((row,i)=>{let x=bias[i];for(let j=0;j<row.length;j++)x+=row[j]*input[j];return activation==='tanh'?Math.tanh(x):1/(1+Math.exp(-x));});}
export function neuralLossC29(model,features){
 if(!Array.isArray(features)||features.length!==10||!features.every(finite))throw Error('Invalid neural features');
 const w=model.weights;
 return layer(layer(layer(features,w['net.0.weight'],w['net.0.bias'],'tanh'),w['net.2.weight'],w['net.2.bias'],'tanh'),w['net.4.weight'],w['net.4.bias'],'sigmoid');
}
function visibleNearestHostile(client){
 const r=client?.remotes?.list||[],p=client?.pos;
 if(!p||![p.x,p.z].every(finite))return null;
 const enemies=r.filter(e=>e&&e.alive&&e.team!==client?.local?.team&&
  [e?.pos?.x,e?.pos?.z,e?.yaw].every(finite));
 enemies.sort((a,b)=>Math.hypot(a.pos.x-p.x,a.pos.z-p.z)-Math.hypot(b.pos.x-p.x,b.pos.z-p.z)||String(a.id).localeCompare(String(b.id)));
 return enemies[0]||null;
}
// PROXY, NOT equivalent to the C28 simulator: remote yaw is client-delivered,
// may represent stale body yaw rather than instantaneous aim. This is explicitly
// audited as domain shift and cannot authorize production rollout.
export function publicModelFeaturesC29(client,now,lagMs){
 const e=visibleNearestHostile(client),p=client?.pos,v=client?.local?.mv;
 if(!e||!p||!v||!finite(lagMs)||!finite(now))return {ok:false,reason:'missing-public-snapshot'};
 const gun=String(e.data?.w||'').toLowerCase();
 if(!C29_WEAPONS.includes(gun))return {ok:false,reason:'unsupported-enemy-weapon',weapon:gun};
 const stamp=e.buf?.at(-1)?.t;
 if(!finite(stamp)||now-stamp>.22)return {ok:false,reason:'stale-enemy-snapshot'};
 if(![v.vx,v.vz,p.x,p.z].every(finite))return {ok:false,reason:'missing-public-motion'};
 const dx=p.x-e.pos.x,dz=p.z-e.pos.z,distance=Math.hypot(dx,dz);
 if(distance<8||distance>75)return {ok:false,reason:'out-of-c28-distance-support',distance};
 const ux=dx/distance,uz=dz/distance;
 const offset=Math.cos(e.yaw)*dx-Math.sin(e.yaw)*dz;
 const baseVelocity=-uz*v.vx+ux*v.vz;
 // C28 training supports offset in [-3,3], baseVelocity in [-2.8,2.8].
 // Do not silently clamp or extrapolate outside those supports.
 if(Math.abs(offset)>3||Math.abs(baseVelocity)>2.8)return {ok:false,reason:'out-of-c28-motion-support',offset,baseVelocity,distance};
 const x=[distance/85,(lagMs/1000)/.25,baseVelocity/3,offset/5,...C29_WEAPONS.map(w=>+(w===gun))];
 if(!x.every(finite))return {ok:false,reason:'nonfinite-proxy'};
 return {ok:true,features:x,offset,baseVelocity,distance,enemyWeapon:gun,
  provenance:'delayed-public-remote-yaw; own client motion; proxy differs from C28 scripted geometry',
  snapshotAge:now-stamp};
}
export class ResearchPolicyC29 extends SafeActionExplorerC16{
 constructor({seed,mode,map,loadout,policy,model,lagMs,...options}={}){
  if(!C29_POLICIES.includes(policy)||!model||!finite(lagMs)||lagMs<0)throw Error('C29 configuration invalid');
  super({seed,mode,map,loadout,assignment:{arm:policy==='baseline'?'control':'treatment',design:'c29-preassigned-common-seed-policy',unit:'match',randomized:false,assignmentProbability:1},...options});
  this.policy=policy;this.model=model;this.lagMs=lagMs;
  this.inferenceCalls=0;this.inferenceFallbacks={};this.selectedCounts={baseline:0,'micro-left':0,'micro-right':0};
  this.proxySamples=[];
 }
 command(now,client,original){
  const before=this.offers.length,ret=super.command(now,client,original);
  if(this.offers.length===before)return ret;
  const offer=this.offers.at(-1);
  if(this.policy==='baseline'){
   this.selectedCounts.baseline++;offer.c29={policy:this.policy,selected:'baseline',reason:'no-intervention-control'};return ret;
  }
  this.inferenceCalls++;
  const input=publicModelFeaturesC29(client,now,this.lagMs);
  if(!input.ok){
   this.inferenceFallbacks[input.reason]=(this.inferenceFallbacks[input.reason]||0)+1;
   // Undo exploratory first tick, terminate active window rather than treating
   // a fallback 'baseline' string as right-strafe on the next command.
   this.interventionTicks--;this.activeUntil=-1;this.current=null;
   offer.selectedAction='baseline';offer.c29={policy:this.policy,selected:'baseline',reason:input.reason,
    publicDiagnostic:Object.fromEntries(['weapon','distance','offset','baseVelocity'].filter(k=>k in input).map(k=>[k,input[k]]))};
   this.selectedCounts.baseline++;return {...original};
  }
  let action,losses=null;
  if(this.policy==='simple')action=input.offset<=0?'micro-left':'micro-right';
  else{
   losses=neuralLossC29(this.model,input.features);
   const k=losses.indexOf(Math.min(...losses));
   action=['baseline','micro-left','micro-right'][k];
  }
  this.proxySamples.push({t:+now.toFixed(3),weapon:input.enemyWeapon,distance:+input.distance.toFixed(3),offset:+input.offset.toFixed(3),baseVelocity:+input.baseVelocity.toFixed(3),action});
  if(this.proxySamples.length>1000)this.proxySamples.shift();
  offer.selectedAction=action;offer.c29={policy:this.policy,selected:action,
   publicFeatureProxy:input.features,proxyProvenance:input.provenance,
   prediction:losses?.map(n=>+n.toFixed(6))||null};
  this.selectedCounts[action]++;
  if(action==='baseline'){
   this.interventionTicks--;this.activeUntil=-1;this.current=null;
   return {...original};
  }
  return {...original,[action==='micro-left'?'left':'right']:true};
 }
 finish(endTime){
  const r=super.finish(endTime);
  r.schema='fpsarena-c29-full-game-research-policy-match-v1';
  r.metadata.c29={policy:this.policy,c28FrozenSourceSHA256:this.model.sourceSHA256,lagMs:this.lagMs,productionActuation:false};
  r.diagnostics.c29={inferenceCalls:this.inferenceCalls,fallbacks:this.inferenceFallbacks,selectedCounts:this.selectedCounts,
   proxySamples:this.proxySamples.length,domainTransferValidated:false,source:'client-delivered delayed public state only'};
  return r;
 }
}
