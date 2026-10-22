/** C35-AC: a preregisterable, opt-in one-tick ADS-toggle experiment.
 * Eligibility and RNG use only pre-step public/agent information. The authoritative
 * shot sink supplies factual outcomes after selection. NOT a production policy.
 */
import {publicAimMovementFeaturesC35AA} from './aim-movement-audit-c35aa.mjs';
export const C35AC_SCHEMA='fpsarena-c35ac-ads-toggle-v1';
const finite=Number.isFinite;
const trunc=v=>finite(v)?+v.toFixed(5):null;
function mix32(x){x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return(x^(x>>>16))>>>0;}
export function assignC35AC(seed,index){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(index)||index<1)throw Error('C35AC invalid RNG input');
 return mix32((seed^Math.imul(index,0x7f4a7c15)^0xac351731)>>>0)<0x80000000?'control':'toggle';
}
export class AdsToggleRandomizerC35AC{
 constructor({seed,matchId,setupId,weapon,policy='observe',cooldown=.6,maxOffers=400}={}){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!matchId||!setupId||!weapon||!['observe','randomized'].includes(policy)||!finite(cooldown)||cooldown<.5||!Number.isInteger(maxOffers)||maxOffers<1)throw Error('C35AC invalid config');
  Object.assign(this,{seed,matchId,setupId,weapon,policy,cooldown,maxOffers,lastNow:-Infinity,nextAt:0,pending:null,rows:[],
   counts:{ticks:0,eligible:0,control:0,toggle:0,adsOnBaseline:0,hipBaseline:0,actualAimToggles:0,confirmedShots:0,zeroShotOffers:0,confirmedHitShots:0,fireChanged:0,refused:{}}});
 }
 refuse(reason){this.counts.refused[reason]=(this.counts.refused[reason]||0)+1;}
 command(now,client,original,applied){
  if(!finite(now)||now<=this.lastNow||this.pending)throw Error('C35AC time/phase');
  this.lastNow=now;this.counts.ticks++;
  if(!!original?.fire!==!!applied?.fire){this.counts.fireChanged++;throw Error('C35AC upstream modified fire');}
  if(this.policy==='observe'||now<this.nextAt||this.rows.length>=this.maxOffers)return applied;
  if(Object.keys({...original,...applied}).some(k=>original[k]!==applied[k])){this.refuse('upstream-priority');return applied;}
  if(!applied?.fire){this.refuse('no-fire-intent');return applied;}
  if(['skill','use','reload','jump','crouch','slide','prone','interact'].some(k=>!!applied[k])||applied.lean){this.refuse('priority-action');return applied;}
  const m=client?.local?.mv;
  if(client?.local?.alive===false||client?.local?.down||client?.local?.frozen||!m?.onGround||m.slideT>0||m.zip||m.heli||m.air||m.hk||m.gs){this.refuse('unsafe-motion-state');return applied;}
  const f=publicAimMovementFeaturesC35AA(now,client,applied,{weapon:this.weapon,maxAge:.225});
  if(!f.valid||f.targetStatus!=='fresh'||f.targetAgeMs===null||f.targetAgeMs<0||f.targetAgeMs>225||f.aimAngleDeg===null||f.aimAngleDeg>4||f.targetRange<2||f.targetRange>90){this.refuse('no-fresh-aligned-target');return applied;}
  const index=this.rows.length+1,arm=assignC35AC(this.seed,index),baselineADS=!!applied.aim,experimentalADS=arm==='toggle'?!baselineADS:baselineADS;
  const out=arm==='toggle'?{...applied,aim:experimentalADS}:applied;
  if(!!out.fire!==!!applied.fire||Object.keys({...applied,...out}).some(k=>out[k]!==applied[k]&&k!=='aim'))throw Error('C35AC command modification outside ADS');
  const row={schema:C35AC_SCHEMA,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,offerIndex:index,t:trunc(now),
   baselineADS,assignedArm:arm,propensity:.5,assignmentDistribution:{control:.5,toggle:.5},
   publicFeatures:f,baselineCommand:{...applied},executedCommand:{...out},provenance:'PRE_STEP_PUBLIC_50_50_ADS_TOGGLE',
   factualShot:null,outcome:null,unselectedOutcome:null};
  this.rows.push(row);this.pending=row;this.nextAt=now+this.cooldown;this.counts.eligible++;this.counts[arm]++;
  this.counts[baselineADS?'adsOnBaseline':'hipBaseline']++;
  if(arm==='toggle')this.counts.actualAimToggles++;
  return out;
 }
 onShot(shot){
  if(!this.pending)return;
  if(shot?.schema!=='fpsarena-c35l-authoritative-ballistics-v1'||!Array.isArray(shot.pellets))throw Error('C35AC invalid authoritative shot');
  if(this.pending.factualShot)throw Error('C35AC multiple shots in one tick');
  this.pending.factualShot={ads:!!shot.ads,spreadDegrees:shot.spreadDegrees,pelletCount:shot.pellets.length,
   playerHit:+shot.pellets.some(p=>p.hitKind==='player'),playerHitPellets:shot.pellets.filter(p=>p.hitKind==='player').length};
 }
 afterStep({serverShotsBefore,serverShotsAfter}){
  if(!Number.isSafeInteger(serverShotsBefore)||!Number.isSafeInteger(serverShotsAfter)||serverShotsAfter<serverShotsBefore)throw Error('C35AC invalid shot counters');
  const r=this.pending;if(!r)return;
  const n=serverShotsAfter-serverShotsBefore;
  if(n>1||+(!!r.factualShot)!==n)throw Error('C35AC shot parity');
  if(n){this.counts.confirmedShots++;this.counts.confirmedHitShots+=r.factualShot.playerHit;}
  else this.counts.zeroShotOffers++;
  r.outcome={serverConfirmedShot:n,playerHit:n?r.factualShot.playerHit:null,
   source:'AUTHORITATIVE_AFTER_GAME_STEP_FACTUAL_ONLY'};
  this.pending=null;
 }
 finish(){if(this.pending||this.counts.fireChanged||this.counts.eligible!==this.rows.length||this.counts.control+this.counts.toggle!==this.rows.length||this.counts.confirmedShots+this.counts.zeroShotOffers!==this.rows.length)throw Error('C35AC final invariant');
  return {schema:C35AC_SCHEMA,policy:this.policy,seed:this.seed,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,
   caveat:'Intent-to-treat at safe eligible pre-step ticks. ADS-baseline and HIP-baseline strata must be analyzed separately. Repeated within-match outcomes and later match trajectories are dependent.',
   counts:this.counts,rows:this.rows};
 }
}
