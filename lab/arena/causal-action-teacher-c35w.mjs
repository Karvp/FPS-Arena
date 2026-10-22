/** C35-W: randomized ONE-TICK movement trials. Research headless only.
 * The public action menu is prepared before queueInput/Game.step. All potential
 * outcomes except the actually executed action remain unknown (null).
 * This is a randomized intent-to-treat experiment, not an identified Q oracle.
 * C16 authorizes C21 micro moves only; C35-W uses its own restrictive macro
 * guard and refuses to overwrite any upstream (C21 etc.) input modifications.
 */
import {publicMovementMenuC35V} from './movement-value-observer-c35v.mjs';
import {C35Z_SCHEMA} from './precision-exploration-c35z.mjs';
export const C35W_SCHEMA='fpsarena-c35w-causal-motor-assignment-v1';
export const C35W_ARMS=Object.freeze(['control','alternative-a','alternative-b']);
export const C35W_P=Object.freeze([.8,.1,.1]);
export const C35Y_P=Object.freeze([.6,.2,.2]);
export const C35Y_SCHEMA='fpsarena-c35y-safe-exploration-v1';
const KEYS=['forward','backward','left','right'];
const finite=Number.isFinite;
const hash32=(x)=>{x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return(x^(x>>>16))>>>0;};
export function assignmentC35W(seed,index){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(index)||index<1)throw Error('C35W invalid seed/index');
 const u=hash32((seed^Math.imul(index,0x517cc1b7)^0xc35a7721)>>>0)/4294967296;
 return u<.8?'control':u<.9?'alternative-a':'alternative-b';
}
export function assignmentC35Y(seed,index){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(index)||index<1)throw Error('C35Y invalid seed/index');
 const u=hash32((seed^Math.imul(index,0x517cc1b7)^0xc35a7721)>>>0)/4294967296;
 return u<.6?'control':u<.8?'alternative-a':'alternative-b';
}
const keysOnly=(cmd)=>Object.fromEntries(KEYS.map(k=>[k,!!cmd?.[k]]));
const commandChanged=(a,b)=>Object.keys({...a,...b}).some(k=>a?.[k]!==b?.[k]);
const n5=(v)=>finite(v)?+v.toFixed(5):null;
/** No server state or outcome is accepted by this assignment interface. */
export class CausalActionTeacherC35W{
 constructor({seed,matchId,setupId,weapon,mode='tdm',policy='randomized',cooldown=.9,horizonTicks=30,maxOffers=250,exploration='c35w'}={}){
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!matchId||!setupId||!weapon||mode!=='tdm'||!['randomized','observe'].includes(policy)||
   !finite(cooldown)||cooldown<.6||!Number.isInteger(horizonTicks)||horizonTicks<6||horizonTicks>60||
   !Number.isInteger(maxOffers)||maxOffers<1||!['c35w','c35y','c35z'].includes(exploration)||
   (['c35y','c35z'].includes(exploration)&&(cooldown<.6||policy!=='randomized')))throw Error('C35W invalid configuration');
  Object.assign(this,{seed,matchId,setupId,weapon,mode,policy,cooldown,horizonTicks,maxOffers,
   exploration,lastTime:-Infinity,tick:0,nextAt:0,lastServer:null,rows:[],pending:[],counts:{probes:0,eligible:0,offers:0,
    assigned:{control:0,'alternative-a':0,'alternative-b':0},executedAlternatives:0,modifiedTicks:0,
    completed:0,censored:0,upstreamConflicts:0,refused:{},fireChanges:0}});
 }
 command(now,client,original,applied){
  if(!finite(now)||now<=this.lastTime)throw Error('C35W clock');this.lastTime=now;this.tick++;
  if(!!original?.fire!==!!applied?.fire){this.counts.fireChanges++;throw Error('C35W upstream fire boundary');}
  if(this.policy==='observe'||now+1e-8<this.nextAt||this.rows.length>=this.maxOffers||!this.lastServer)return applied;
  if(commandChanged(original,applied)){this.counts.upstreamConflicts++;return applied;}
  this.counts.probes++;
  const menu=publicMovementMenuC35V(now,client,original,applied,{weapon:this.weapon,maxAge:.275,precisionResearch:this.exploration==='c35z'});
  if(!menu.valid){this.counts.refused[menu.reason]=(this.counts.refused[menu.reason]??0)+1;return applied;}
  const orig=keysOnly(applied);
  const alternatives=menu.actions.filter(a=>a.safe&&KEYS.some(k=>a.keys[k]!==orig[k]))
   .sort((a,b)=>(b.heuristicValue??-Infinity)-(a.heuristicValue??-Infinity)||a.id-b.id);
  if(alternatives.length<2){this.counts.refused['less-than-two-safe-alternatives']=(this.counts.refused['less-than-two-safe-alternatives']??0)+1;return applied;}
  this.counts.eligible++;this.nextAt=now+this.cooldown;
  const index=this.counts.offers+1,assignedArm=['c35y','c35z'].includes(this.exploration)?assignmentC35Y(this.seed,index):assignmentC35W(this.seed,index),slot=C35W_ARMS.indexOf(assignedArm);
  const probabilities=['c35y','c35z'].includes(this.exploration)?C35Y_P:C35W_P;
  const selected=slot?alternatives[slot-1].keys:orig;
  // Commitment of propensity/choice happens before the authoritative step.
  const row={schema:this.exploration==='c35z'?C35Z_SCHEMA:this.exploration==='c35y'?C35Y_SCHEMA:C35W_SCHEMA,matchId:this.matchId,setupId:this.setupId,offerIndex:index,offerId:`${this.matchId}-${index}`,
   tick:this.tick,at:n5(now),weapon:this.weapon,assignedArm,
   propensity:probabilities[slot],assignmentDistribution:Object.fromEntries(C35W_ARMS.map((a,i)=>[a,probabilities[i]])),
   assignmentMethod:'hash32 independent of game RNG',targetId:menu.targetId,features:menu.features,
   actionSet:[{arm:'control',keys:orig,safe:true,heuristicValue:menu.features.incumbentHeuristic},
    ...alternatives.slice(0,2).map((a,i)=>({arm:C35W_ARMS[i+1],keys:a.keys,safe:a.safe,heuristicValue:a.heuristicValue}))],
   requestedAction:selected,executedAction:null,executedArm:null,compliant:null,
   outcome:null,unselectedOutcomes:null,censored:false,policy:'randomized',
   provenance:'public before Game.step; factual counters strictly after; one motor tick only'};
  this.rows.push(row);this.counts.offers++;this.counts.assigned[assignedArm]++;
  this.pending.push({row,baseline:{...this.lastServer},endTick:this.tick+this.horizonTicks-1});
  const out={...applied,...selected};
  for(const k of Object.keys({...applied,...out}))if(!KEYS.includes(k)&&applied[k]!==out[k])throw Error('C35W nonmotor boundary');
  if(!!out.fire!==!!applied.fire)throw Error('C35W changed fire');
  row.executedAction=keysOnly(out);row.executedArm=assignedArm;row.compliant=true;
  if(slot){this.counts.modifiedTicks++;this.counts.executedAlternatives++;}
  return out;
 }
 afterStep({serverShots,serverHits,serverKills,serverDamageTaken,serverAlive}){
  if(![serverShots,serverHits,serverKills,serverDamageTaken].every(finite)||typeof serverAlive!=='boolean')throw Error('C35W invalid server truth');
  const next={shots:serverShots,hits:serverHits,kills:serverKills,damageTaken:serverDamageTaken,alive:serverAlive};
  if(this.lastServer&&['shots','hits','kills','damageTaken'].some(k=>next[k]<this.lastServer[k]))throw Error('C35W nonmonotone server counters');
  for(const p of this.pending){if(this.tick>=p.endTick&&p.row.outcome===null){const b=p.baseline;
   p.row.outcome={hitWindow:+(next.hits>b.hits),shotDelta:next.shots-b.shots,hitDelta:next.hits-b.hits,
    killDelta:next.kills-b.kills,damageTakenDelta:next.damageTaken-b.damageTaken,aliveEnd:next.alive,
    horizonTicks:this.horizonTicks,source:'SERVER_AFTER_STEP_FACTUAL_INTENT_TO_TREAT_ONLY'};
   this.counts.completed++;
  }}
  this.pending=this.pending.filter(x=>x.row.outcome===null);this.lastServer=next;
 }
 finish(){for(const p of this.pending){p.row.censored=true;this.counts.censored++;}this.pending=[];
  if(this.counts.fireChanges||this.counts.completed+this.counts.censored!==this.rows.length||
   Object.values(this.counts.assigned).reduce((a,b)=>a+b,0)!==this.rows.length)throw Error('C35W invariant');
  return {schema:C35W_SCHEMA,policy:this.policy,seed:this.seed,matchId:this.matchId,setupId:this.setupId,
   exploration:this.exploration,design:'randomized short-lived intent-to-treat motor decisions; only chosen action has factual outcome',
   caveat:'non-executed action outcomes unknown; horizon can include subsequent decisions; overlap avoided by cooldown',
   counts:this.counts,rows:this.rows};
 }
}
