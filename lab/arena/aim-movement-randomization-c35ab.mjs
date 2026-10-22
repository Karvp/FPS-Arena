/** C35-AB: safe, deliberately narrow one-tick randomized aim/motion probe.
 * Public-only pre-step eligibility. Outcomes are observed ONLY after Game.step.
 * Inference/causal claims restricted to randomized offer population; no model or
 * authoritative server state can influence assignment. NOT production policy.
 */
import {publicAimMovementFeaturesC35AA} from './aim-movement-audit-c35aa.mjs';
export const C35AB_SCHEMA='fpsarena-c35ab-aim-motion-randomized-v1';
const MOV=['forward','backward','left','right'];
const finite=Number.isFinite;
const round=v=>finite(v)?+v.toFixed(5):null;
function mix32(x){x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return(x^(x>>>16))>>>0;}
export function assignC35AB(seed,index){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(index)||index<1)throw Error('C35AB seed/index');
 return mix32((seed^Math.imul(index,0x7f4a7c15)^0xab351731)>>>0)<0x80000000?'control':'treatment';
}
export class AimMovementRandomizerC35AB{
 constructor({seed,matchId,setupId,weapon,policy='observe',cooldown=.65,maxOffers=320}={}){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!matchId||!setupId||!weapon||!['observe','randomized'].includes(policy)||!finite(cooldown)||cooldown<.5||!Number.isInteger(maxOffers)||maxOffers<1)throw Error('C35AB config');
  Object.assign(this,{seed,matchId,setupId,weapon,policy,cooldown,maxOffers,nextAt:0,lastNow:-Infinity,
   offers:[],pending:null,counts:{ticks:0,eligible:0,assignments:0,control:0,treatment:0,adsOffers:0,holdOffers:0,
    interventions:0,confirmedShots:0,confirmedHitShots:0,zeroShotOffers:0,fireChanged:0,nonTreatmentModified:0,refused:{}}});
 }
 command(now,client,original,applied){
  if(!finite(now)||now<=this.lastNow||this.pending)throw Error('C35AB time/phase');
  this.lastNow=now;this.counts.ticks++;
  if(!!original?.fire!==!!applied?.fire){this.counts.fireChanged++;throw Error('C35AB upstream firing modification');}
  if(this.policy==='observe'||now<this.nextAt||this.offers.length>=this.maxOffers)return applied;
  // C21, C16 and all other upstream action modifications take precedence.
  if(Object.keys({...original,...applied}).some(k=>original[k]!==applied[k])){this.reject('upstream-priority');return applied;}
  if(!applied?.fire){this.reject('no-fire-intent');return applied;}
  if(['skill','use','reload','jump','crouch','slide','prone','interact'].some(k=>!!applied[k])||applied?.lean){this.reject('priority-action');return applied;}
  const m=client?.local?.mv;
  if(client?.local?.alive===false||client?.local?.down||client?.local?.frozen||!m?.onGround||m?.slideT>0||m?.zip||m?.heli||m?.air||m?.hk||m?.gs){this.reject('movement-state');return applied;}
  const f=publicAimMovementFeaturesC35AA(now,client,applied,{weapon:this.weapon,maxAge:.225});
  if(!f.valid||f.targetStatus!=='fresh'||f.targetAgeMs===null||f.targetAgeMs<0||f.targetAgeMs>225||f.aimAngleDeg===null||f.aimAngleDeg>4||f.targetRange<2||f.targetRange>90){this.reject('no-fresh-aligned-target');return applied;}
  // Intervention priority: hip-fire => ADS on; ADS & moving => one-tick key release.
  const axis=!applied.aim?'ads':MOV.some(k=>applied[k])&&f.speed>=.5?'hold':null;
  if(!axis){this.reject('no-safe-alternative');return applied;}
  const index=this.offers.length+1,arm=assignC35AB(this.seed,index),out=arm==='treatment'?
   axis==='ads'?{...applied,aim:true}:{...applied,forward:false,backward:false,left:false,right:false}:applied;
  if(!!out.fire!==!!applied.fire||Object.keys({...applied,...out}).some(k=>out[k]!==applied[k]&&!(axis==='ads'?k==='aim':MOV.includes(k))))throw Error('C35AB modification boundary');
  const row={schema:C35AB_SCHEMA,setupId:this.setupId,matchId:this.matchId,offerIndex:index,at:round(now),axis,assignedArm:arm,
   propensity:.5,assignmentDistribution:{control:.5,treatment:.5},provenance:'PUBLIC_PRE_STEP_RANDOMIZED_ONE_TICK',
   publicFeatures:f,baselineCommand:{aim:!!applied.aim,motor:Object.fromEntries(MOV.map(k=>[k,!!applied[k]])),fire:!!applied.fire},
   executedCommand:{aim:!!out.aim,motor:Object.fromEntries(MOV.map(k=>[k,!!out[k]])),fire:!!out.fire},
   factualShot:null,outcome:null,unselectedOutcome:null};
  this.offers.push(row);this.pending=row;this.nextAt=now+this.cooldown;this.counts.eligible++;this.counts.assignments++;this.counts[arm]++;
  this.counts[axis==='ads'?'adsOffers':'holdOffers']++;
  if(arm==='treatment')this.counts.interventions++;
  return out;
 }
 reject(why){this.counts.refused[why]=(this.counts.refused[why]||0)+1;}
 onShot(shot){
  if(this.pending){
   if(shot?.schema!=='fpsarena-c35l-authoritative-ballistics-v1'||!Array.isArray(shot.pellets))throw Error('C35AB shot schema');
   if(this.pending.factualShot)throw Error('C35AB multiple shots in one tick');
   this.pending.factualShot={ads:!!shot.ads,spreadDegrees:shot.spreadDegrees,pelletCount:shot.pellets.length,
    playerHit:+shot.pellets.some(p=>p.hitKind==='player'),playerHitPellets:shot.pellets.filter(p=>p.hitKind==='player').length};
  }
 }
 afterStep({serverShotsBefore,serverShotsAfter}){
  if(!Number.isSafeInteger(serverShotsBefore)||!Number.isSafeInteger(serverShotsAfter)||serverShotsAfter<serverShotsBefore)throw Error('C35AB counters');
  const row=this.pending;if(!row)return;
  const delta=serverShotsAfter-serverShotsBefore;
  if(delta>1||+(!!row.factualShot)!==delta)throw Error('C35AB shot parity');
  if(delta){this.counts.confirmedShots++;this.counts.confirmedHitShots+=row.factualShot.playerHit;}
  else this.counts.zeroShotOffers++;
  row.outcome={serverConfirmedShot:delta,playerHit:delta?row.factualShot.playerHit:null,
   source:'AUTHORITATIVE_AFTER_GAME_STEP_FACTUAL_ONLY'};
  this.pending=null;
 }
 finish(){if(this.pending||this.counts.fireChanged||this.counts.assignments!==this.offers.length||this.counts.control+this.counts.treatment!==this.offers.length||this.counts.confirmedShots+this.counts.zeroShotOffers!==this.offers.length)throw Error('C35AB audit invariant');
  return {schema:C35AB_SCHEMA,policy:this.policy,seed:this.seed,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,
   design:'50/50 randomized at eligible public fire-intent ticks; mutually exclusive ADS-on or hold-motor for one tick',
   limitations:'No target-side counterfactual shot labels; randomization identifies ITT only among eligible offers; possible gameplay downstream and repeated within-match dependence.',counts:this.counts,rows:this.offers};
 }
}
