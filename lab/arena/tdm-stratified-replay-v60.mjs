/** V60: public-state, pre-action deterministic replay branches.
 * RESEARCH ONLY. No production import. Private game state is used exclusively
 * as an audit witness after the public trigger has been selected.
 */
import {createHash} from 'node:crypto';
import {publicHostilesC35K} from './public-target-los-c35k.mjs';
import {movementUnitC35T} from './target-relative-motion-c35t.mjs';
import {WEAPONS} from './source-main/shared/weapons.js';

export const V60_ARMS=Object.freeze(['keep','close','strafe','withdraw']);
export const V60_STRATA=Object.freeze(['range-gap','contact','under-pressure']);
export const V60_SCHEMA='fpsarena-v60-public-stratified-four-arm-replay-v1';
const MOT=['forward','backward','left','right'];
const CANDIDATES=Object.freeze([
 {forward:true},{forward:true,right:true},{right:true},{right:true,backward:true},
 {backward:true},{backward:true,left:true},{left:true},{left:true,forward:true}
]);
const finite=Number.isFinite;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cnum=n=>finite(n)?+n.toFixed(4):null;
function canonical(x,depth=0,seen=new Set()){
 if(x===null||typeof x==='boolean'||typeof x==='string')return x;
 if(typeof x==='number')return finite(x)?x:String(x);
 if(typeof x!=='object'||depth>12)return null;
 if(seen.has(x))return '[circular]';
 seen.add(x);
 const out=x instanceof Map?[...x.entries()].map(([a,b])=>[canonical(a,depth+1,seen),canonical(b,depth+1,seen)]):
 x instanceof Set?[...x.values()].map(t=>canonical(t,depth+1,seen)):
 Array.isArray(x)?x.map(t=>canonical(t,depth+1,seen)):
 Object.fromEntries(Object.keys(x).sort().filter(k=>!['socket','g','io','map'].includes(k)).map(k=>[k,canonical(x[k],depth+1,seen)]));
 seen.delete(x);return out;
}
export function witnessV60({world,client,trainee,randomState}){
 const privateState={tick:world.tick,now:world.now,phase:world.phase,config:world.config,mode:canonical(world.mode),
 players:[...world.players.values()].map(p=>({id:p.id,fields:canonical(Object.fromEntries(Object.keys(p).filter(k=>!['socket','bot'].includes(k)).map(k=>[k,p[k]]))),bot:canonical(p.bot)})),
 ability:canonical(world.abil),streaks:canonical(world.streaks)};
 const publicState={pos:client.pos,rig:client.rig,localHp:client.local?.hp,entities:client.entities,modeState:client.modeState};
 return {tick:world.tick+1,serverSHA256:sha(privateState),rngState:randomState??null,
 publicSHA256:sha(canonical(publicState)),traineeId:String(trainee.id)};
}
function pointBlocked(boxes,a,b){
 if(!Array.isArray(boxes)||boxes.length>1500)return true;
 for(let step=1;step<=8;step++){
  const t=step/8,pt={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  for(const q of boxes){
   if(![q?.x0,q?.x1,q?.z0,q?.z1].every(finite))return true;
   if(pt.x>=q.x0-.55&&pt.x<=q.x1+.55&&pt.z>=q.z0-.55&&pt.z<=q.z1+.55)return true;
  }
 }
 return false;
}
export function publicStateV60(client,now,cmd,{weapon='aa12',recentDamage=false}={}){
 const p=client?.pos,hp=client?.local?.hp;
 if(!finite(now)||![p?.x,p?.y,p?.z,client?.rig?.yaw,hp].every(finite)||client?.local?.alive!==true)
  return {valid:false,reason:'missing-or-dead',stratum:null};
 if(hp<58)return {valid:false,reason:'low-hp',stratum:null};
 if(cmd?.fire||cmd?.skill||cmd?.reload)return {valid:false,reason:'combat-interrupt',stratum:null};
 const seen=publicHostilesC35K(client,now,{maxAge:.275});
 if(!seen.valid)return {valid:false,reason:seen.reason,stratum:null};
 const target=seen.hostiles[0],maxRange=WEAPONS[weapon]?.maxRange;
 if(!target||!finite(maxRange)||maxRange<=0)return {valid:false,reason:'no-target-or-weapon',stratum:null};
 const dx=target.pos.x-p.x,dz=target.pos.z-p.z,distance=Math.hypot(dx,dz);
 const prior=recentDamage&&distance<=65;
 const contact=distance>=10&&distance<=Math.min(maxRange*.95,55);
 const gap=distance>maxRange*1.05&&distance<=Math.min(95,Math.max(40,maxRange*2.6));
 const stratum=prior?'under-pressure':contact?'contact':gap?'range-gap':null;
 return {valid:!!stratum,reason:stratum?'eligible':'outside-band',stratum,distance:cnum(distance),
 targetId:String(target.id),targetPos:{x:target.pos.x,z:target.pos.z},hp:cnum(hp),maxRange:cnum(maxRange),publicHostiles:seen.hostiles.length};
}
export function armCommandV60({client,now,command,arm,features}){
 if(!V60_ARMS.includes(arm))throw Error('V60_BAD_ARM');
 const copy={...command};
 if(arm==='keep')return {command:copy,changed:false,reason:'keep'};
 if(!features?.valid||!features?.targetPos)return {command:copy,changed:false,reason:'no-public-feature'};
 const p=client?.pos,yaw=client?.rig?.yaw,dx=features.targetPos.x-p.x,dz=features.targetPos.z-p.z,
 d=Math.hypot(dx,dz),boxes=client?.map?.boxes;
 if(!(d>1)||!finite(yaw)||!Array.isArray(boxes))return {command:copy,changed:false,reason:'missing-geometry'};
 const ux=dx/d,uz=dz/d,choices=[];
 for(let i=0;i<CANDIDATES.length;i++){
  const keys=CANDIDATES[i],m=movementUnitC35T(keys,yaw);
  if(!m||![m.x,m.z].every(finite))continue;
  const toward=m.x*ux+m.z*uz,side=m.x*uz-m.z*ux;
  if(arm==='close'&&toward<.42)continue;
  if(arm==='withdraw'&&toward>-.38)continue;
  if(arm==='strafe'&&(Math.abs(side)<.72||Math.abs(toward)>.43))continue;
  const end={x:p.x+m.x*1.25,z:p.z+m.z*1.25};
  const bound=client.map.bound;
  if(!finite(bound)||Math.abs(end.x)>bound-.9||Math.abs(end.z)>bound-.9)continue;
  if(pointBlocked(boxes,p,end))continue;
  const score=arm==='close'?toward:arm==='withdraw'?-toward:Math.abs(side);
  choices.push({keys,score,i});
 }
 choices.sort((a,b)=>b.score-a.score||a.i-b.i);
 if(!choices.length)return {command:copy,changed:false,reason:'no-safe-candidate'};
 for(const key of MOT)copy[key]=!!choices[0].keys[key];
 return {command:copy,changed:MOT.some(k=>!!copy[k]!==!!command[k]),reason:'safe-'+arm};
}
export class V60BranchTrial {
 constructor({arm='keep',stratum='range-gap',weapon='aa12',seed=1,earliestTick=600,latestTick=3600,treatmentTicks=120,outcomeTicks=300,confirmationSamples=3,sampleEvery=6}={}){
  if(!V60_ARMS.includes(arm)||!V60_STRATA.includes(stratum)||!WEAPONS[weapon]||
   ![seed,earliestTick,latestTick,treatmentTicks,outcomeTicks,confirmationSamples,sampleEvery].every(Number.isSafeInteger)||
   earliestTick<60||latestTick<=earliestTick||treatmentTicks<30||treatmentTicks>300||
   outcomeTicks<treatmentTicks||outcomeTicks>600||confirmationSamples<1||sampleEvery<1)throw Error('V60_BAD_CONFIG');
  Object.assign(this,{arm,stratum,weapon,seed,earliestTick,latestTick,treatmentTicks,outcomeTicks,
   confirmationSamples,sampleEvery,offset:((seed>>>0)%73)*sampleEvery});
  this.nextEligibleTick=earliestTick+this.offset;this.firstEligibleTick=null;this.streak=0;this.lastSampleTick=null;
  this.triggerTick=null;this.prestate=null;this.initial=null;this.terminal=null;
  this.lastHp=null;this.damageUntil=-1;this.triggerFeature=null;this.prefix=createHash('sha256');
  this.prefixSHA256=null;this.changedTicks=0;this.eligibleTicks=0;this.reasonCounts={};this.rejectionCounts={};
  this.activeTicks=0;this.commandChecks=0;this.examples=[];
 }
 beforeStep({tick,now,client,command}){
  if(!Number.isSafeInteger(tick))throw Error('V60_BAD_TICK');
  const base={...command};
  const hp=client?.local?.hp;
  if(finite(hp)&&finite(this.lastHp)&&hp<this.lastHp-.1)this.damageUntil=tick+90;
  if(finite(hp))this.lastHp=hp;
  if(this.triggerTick===null){
   this.prefix.update(JSON.stringify({tick,command:base})+'\n');
   if(tick>=this.nextEligibleTick&&tick<=this.latestTick&&(tick-this.nextEligibleTick)%this.sampleEvery===0){
    const f=publicStateV60(client,now,base,{weapon:this.weapon,recentDamage:tick<=this.damageUntil});
    this.lastSampleTick=tick;
    if(f.valid&&f.stratum===this.stratum){
     this.streak++;if(this.firstEligibleTick===null)this.firstEligibleTick=tick;
     if(this.streak>=this.confirmationSamples){
      this.triggerTick=tick;this.triggerFeature=f;this.prefixSHA256=this.prefix.digest('hex');
     }
    }else{this.streak=0;this.rejectionCounts[f.reason]=(this.rejectionCounts[f.reason]??0)+1;}
   }
   return base; // first trigger step is deliberately an unmodified prestate step
  }
  if(tick<=this.triggerTick)return base;
  if(tick>this.triggerTick+this.treatmentTicks)return base;
  if(!this.prestate)throw Error('V60_NO_WITNESS');
  const features=publicStateV60(client,now,base,{weapon:this.weapon,recentDamage:tick<=this.damageUntil});
  const result=armCommandV60({client,now,command:base,arm:this.arm,features});
  this.activeTicks++;
  this.reasonCounts[result.reason]=(this.reasonCounts[result.reason]??0)+1;
  if(result.changed){this.changedTicks++;if(this.examples.length<6)this.examples.push({tick,arm:this.arm,
    before:MOT.map(k=>+!!base[k]).join(''),after:MOT.map(k=>+!!result.command[k]).join('')});}
  if(features.valid)this.eligibleTicks++;
  for(const [k,v] of Object.entries(base))if(!MOT.includes(k)&&result.command[k]!==v)throw Error('V60_NON_MOTOR_MUTATION');
  this.commandChecks++;
  return result.command;
 }
 setWitness(witness,counters){
  if(this.prestate||this.triggerTick===null)throw Error('V60_BAD_WITNESS');
  this.prestate=witness;this.initial={...counters};
 }
 afterStep({tick,...counters}){
  if(this.triggerTick!==null&&tick===this.triggerTick+this.outcomeTicks)this.terminal={...counters};
 }
 finish(){
  const completed=!!this.terminal;
  return {schema:V60_SCHEMA,arm:this.arm,stratum:this.stratum,weapon:this.weapon,seed:this.seed,
   triggerTick:this.triggerTick,firstEligibleTick:this.firstEligibleTick,nextEligibleTick:this.nextEligibleTick,
   treatmentTicks:this.treatmentTicks,outcomeTicks:this.outcomeTicks,complete:completed,
   rightCensored:this.triggerTick!==null&&!completed,notTriggered:this.triggerTick===null,
   prestate:this.prestate,triggerPublicFeatures:this.triggerFeature,
   prefixSHA256:(this.prefixSHA256??(this.prefixSHA256=this.prefix.digest('hex'))),
   initial:this.initial,terminal:this.terminal,outcome:completed?Object.fromEntries(Object.keys(this.initial).map(k=>[k,(this.terminal[k]??0)-(this.initial[k]??0)])):null,
   changedTicks:this.changedTicks,eligibleTicks:this.eligibleTicks,activeTicks:this.activeTicks,
   commandChecks:this.commandChecks,examples:this.examples,rejections:this.rejectionCounts,reasons:this.reasonCounts,
   treatmentStartsAfterTrigger:true,privilegedWitnessNotActorInput:true,onlyMovementModified:true,
   researchOnly:true,productionAllowed:false};
 }
}
