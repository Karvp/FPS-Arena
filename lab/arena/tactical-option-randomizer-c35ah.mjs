/** C35-AH: research-only randomized bounded multi-tick MOTOR options.
 * Assignment is pre-action with known propensity, and entire option is one
 * experimental unit. Rechecks public collision/LOS/safety on EVERY tick;
 * freezes fire, aim, aim angles, skill and upstream action decisions.
 * Only assigned factual 6s return is known, not counterfactual Q(s,option).
 */
import {publicMovementMenuC35V} from './movement-value-observer-c35v.mjs';
export const C35AH_SCHEMA='fpsarena-c35ah-bounded-motor-option-v1';
export const C35AH_ARMS=Object.freeze(['incumbent','option-a','option-b']);
export const C35AH_P=Object.freeze([.5,.25,.25]);
const MOTOR=['forward','backward','left','right'];
const S=x=>JSON.parse(JSON.stringify(x));
const round=x=>Number.isFinite(x)?+x.toFixed(5):null;
function mix(x){x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return(x^(x>>>16))>>>0;}
export function assignC35AH(seed,index){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(index)||index<1)throw Error('C35AH bad assignment arguments');
 const u=mix((seed^Math.imul(index,0x6b11350f)^0xc35aaffe)>>>0)/4294967296;
 return u<.5?'incumbent':u<.75?'option-a':'option-b';
}
function changed(a,b){return Object.keys({...a,...b}).some(k=>a?.[k]!==b?.[k]);}
function motor(cmd){return Object.fromEntries(MOTOR.map(k=>[k,!!cmd?.[k]]));}
function otherUnchanged(a,b){return Object.keys({...a,...b}).every(k=>MOTOR.includes(k)||a?.[k]===b?.[k]);}
function counts(m){
 const o={};for(const k of ['shots','hits','damageDealt','damageTaken','ownKills','deathCount']){
  if(!Number.isFinite(m?.[k])||m[k]<0)throw Error('C35AH invalid server counter '+k);o[k]=m[k];
 }return o;
}
const selectOptions=(menu,incumbent)=>menu.actions.filter(a=>a.safe&&MOTOR.some(k=>!!a.keys[k]!==!!incumbent[k]))
 .sort((a,b)=>b.heuristicValue-a.heuristicValue||a.id-b.id).slice(0,2);
export class TacticalOptionRandomizerC35AH{
 constructor({seed,matchId,setupId,weapon,policy='observe',doseSeconds=1.25,horizonSeconds=6,cooldownSeconds=7.5,maxOffers=300}={}){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!matchId||!setupId||!weapon||!['observe','randomized'].includes(policy)||
   !Number.isFinite(doseSeconds)||doseSeconds<.3||doseSeconds>2||!Number.isFinite(horizonSeconds)||horizonSeconds<3||horizonSeconds>10||
   doseSeconds>=horizonSeconds||!Number.isFinite(cooldownSeconds)||cooldownSeconds<=horizonSeconds||!Number.isInteger(maxOffers)||maxOffers<1)
   throw Error('C35AH invalid design');
  Object.assign(this,{seed,matchId,setupId,weapon,policy,doseSeconds,horizonSeconds,cooldownSeconds,maxOffers,
   rows:[],active:null,open:null,nextAt:0,lastNow:-Infinity,pending:false,pre:null,
   counts:{ticks:0,offers:0,assigned:{incumbent:0,'option-a':0,'option-b':0},modifiedTicks:0,
    completed:0,censored:0,interruptions:0,upstreamConflicts:0,fireMutations:0,refused:{}}});
 }
 refuse(reason){this.counts.refused[reason]=(this.counts.refused[reason]||0)+1;}
 safe(now,client,original,applied){
  if(!!original?.fire!==!!applied?.fire){this.counts.fireMutations++;throw Error('C35AH upstream fire conflict');}
  if(changed(original,applied))return {ok:false,reason:'upstream-conflict'};
  // Precision shots get no motor overrides while firing; other weapons retain fire unchanged.
  if(['hk_sl8','l115a3'].includes(this.weapon)&&!!applied.fire)return {ok:false,reason:'precision-fire'};
  const menu=publicMovementMenuC35V(now,client,original,applied,{weapon:this.weapon,maxAge:.275,precisionResearch:true});
  return menu.valid?{ok:true,menu}:{ok:false,reason:menu.reason};
 }
 command(now,client,original,applied){
  if(!Number.isFinite(now)||now<=this.lastNow||this.pending)throw Error('C35AH command phase');
  this.pending=true;this.lastNow=now;this.counts.ticks++;
  if(!!original?.fire!==!!applied?.fire){this.counts.fireMutations++;throw Error('C35AH upstream fire conflict');}
  if(this.policy==='observe')return applied;
  if(this.active){
   const a=this.active;
   if(now>=a.start+this.doseSeconds-1e-7){this.active=null;return applied;}
   if(a.assignedArm==='incumbent')return applied;
   const v=this.safe(now,client,original,applied);
   const ranked=v.ok?selectOptions(v.menu,applied):[];
   const chosen=ranked[C35AH_ARMS.indexOf(a.assignedArm)-1];
   if(!chosen||!v.ok||v.menu.targetId!==a.targetId){
    a.interruptions++;a.interruptedAt=round(now);a.interruptionReason=!v.ok?v.reason:!chosen?'option-now-unsafe':'target-changed';
    this.counts.interruptions++;this.active=null;return applied;
   }
   const out={...applied,...motor(chosen.keys)};
   if(!otherUnchanged(applied,out)||!!out.fire!==!!applied.fire)throw Error('C35AH nonmotor mutation');
   if(MOTOR.some(k=>!!out[k]!==!!applied[k])){a.modifiedTicks++;this.counts.modifiedTicks++;}
   if(chosen.id!==a.optionId)a.replannedTicks++;
   a.optionTicks++;return out;
  }
  if(now<this.nextAt||this.rows.length>=this.maxOffers||!this.pre)return applied;
  const v=this.safe(now,client,original,applied);
  if(!v.ok){this.refuse(v.reason);return applied;}
  const opts=selectOptions(v.menu,applied);
  if(opts.length!==2){this.refuse('two-safe-options-not-available');return applied;}
  const index=this.rows.length+1,arm=assignC35AH(this.seed,index),slot=C35AH_ARMS.indexOf(arm);
  const chosen=slot?opts[slot-1]:null;
  const row={schema:C35AH_SCHEMA,setupId:this.setupId,matchId:this.matchId,weapon:this.weapon,index,start:round(now),
   assignedArm:arm,propensity:C35AH_P[slot],assignmentDistribution:{incumbent:.5,'option-a':.25,'option-b':.25},
   targetId:v.menu.targetId,initialPublicFeatures:S(v.menu.features),initialCommand:motor(applied),
   menu:opts.map((o,i)=>({arm:C35AH_ARMS[i+1],id:o.id,keys:motor(o.keys),heuristic:o.heuristicValue})),
   optionId:chosen?.id??null,doseSeconds:this.doseSeconds,horizonSeconds:this.horizonSeconds,
   optionTicks:0,modifiedTicks:0,replannedTicks:0,interruptions:0,interruptedAt:null,interruptionReason:null,
   factual:null,unselectedOutcomes:null,compliantAtAssignment:true,sequence:[],
   provenance:'PRE_ACTION_PUBLIC_ASSIGNMENT; MULTI_TICK_SAFETY_GUARD; FACTUAL_SERVER_POST_STEP_ONLY',_base:S(this.pre)};
  this.rows.push(row);this.open=row;this.active=row;this.nextAt=now+this.cooldownSeconds;
  this.counts.offers++;this.counts.assigned[arm]++;
  if(!slot)return applied;
  const out={...applied,...motor(chosen.keys)};
  if(!otherUnchanged(applied,out)||!!out.fire!==!!applied.fire)throw Error('C35AH nonmotor mutation');
  row.optionTicks++;if(MOTOR.some(k=>!!out[k]!==!!applied[k])){row.modifiedTicks++;this.counts.modifiedTicks++;}
  return out;
 }
 beforeStep({now,client,incumbent,applied,metrics}){
  if(!this.pending||now!==this.lastNow)throw Error('C35AH beforeStep phase');
  if(!otherUnchanged(incumbent,applied)||!!incumbent?.fire!==!!applied?.fire)throw Error('C35AH command integrity');
  if(this.open){
   const r=this.open,t=round(now-r.start);
   if(r.sequence.length<4||this.counts.ticks%30===0||r.sequence.length&&r.sequence.at(-1).changed!==MOTOR.some(k=>!!applied[k]!==!!incumbent[k])){
    r.sequence.push({at:t,changed:MOTOR.some(k=>!!applied[k]!==!!incumbent[k]),aim:!!applied.aim,fire:!!applied.fire,keys:motor(applied)});
   }
  }
 }
 afterStep({now,metrics,alive}){
  if(!this.pending||now!==this.lastNow)throw Error('C35AH afterStep phase');this.pending=false;
  const current=counts(metrics);
  if(this.pre&&Object.keys(current).some(k=>current[k]<this.pre[k]))throw Error('C35AH counter reversal');
  this.pre=current;
  if(this.open&&now-this.open.start>=this.horizonSeconds-1e-7){
   const r=this.open,b=r._base,delta={};for(const k of Object.keys(current))delta[k]=current[k]-b[k];
   r.factual={...delta,netDamage:delta.damageDealt-delta.damageTaken,survived:delta.deathCount===0&&!!alive,
    complete:true,source:'AUTHORITATIVE_AFTER_GAME_STEP_INTENT_TO_TREAT'};
   delete r._base;this.counts.completed++;this.open=null;this.active=null;
  }
 }
 finish(){
  if(this.pending||this.counts.fireMutations||this.counts.offers!==this.rows.length||
   Object.values(this.counts.assigned).reduce((s,x)=>s+x,0)!==this.rows.length)throw Error('C35AH finish invariant');
  if(this.open){this.open.factual={complete:false,censored:true,reason:'match-ended-before-horizon'};delete this.open._base;this.counts.censored++;this.open=null;this.active=null;}
  if(this.counts.completed+this.counts.censored!==this.rows.length)throw Error('C35AH factual accounting');
  return {schema:C35AH_SCHEMA,policy:this.policy,seed:this.seed,matchId:this.matchId,setupId:this.setupId,weapon:this.weapon,
   doseSeconds:this.doseSeconds,horizonSeconds:this.horizonSeconds,cooldownSeconds:this.cooldownSeconds,counts:this.counts,rows:this.rows,
   caveat:'Only entire assigned bounded movement option randomized; interruption is post-assignment noncompliance, not a reason to remove ITT units. Subsequent shot/aim behavior not independently randomized. Unselected returns unknown.'};
 }
}
