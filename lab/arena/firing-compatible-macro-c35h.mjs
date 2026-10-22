/** C35-H exploratory firing-compatible macro movement.
 * HEADLESS RESEARCH OPT-IN ONLY. Never imported by page-agent.js.
 * Input: incumbent command, local predicted player, delayed public target and map.
 * No server Game, opponent true state, future outcomes or weapon readiness accepted.
 * C16 continues to gate C21 micro actions independently; firing commands are
 * ineligible for those micro actions. This separate macro guard is NOT C16.
 */
import {publicPolicyState} from './encounter-policy-recorder-c13.mjs';
import {publicClearanceC14} from './safe-action-explorer-c14.mjs';
export const C35H_SCHEMA='fpsarena-c35h-public-fire-compatible-macro-v1';
export const C35H_POLICIES=Object.freeze(['observe','lateral']);
const PRIORITY=['reload','skill','use','interact','plate','throw','jump','crouch','slide','prone','lean'];
const finite=Number.isFinite;
function hash32(x){x=(x+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return (x^(x>>>16))>>>0;}
export function publicFireCorridorC35H(client,cmd,now,{mode='tdm',distance=0.8}={}){
 const reasons=[];
 if(mode!=='tdm')reasons.push('mode');
 if(!finite(now)||now<0)reasons.push('clock');
 const p=client?.local?.mv;
 if(!client?.local?.alive||client.local.down||client.local.frozen||p?.heli||p?.air||p?.hk>0||p?.gs>0||p?.slideT>0||!p?.onGround)reasons.push('player-motion-state');
 if(cmd?.fire!==true||cmd?.forward!==true||cmd?.backward||cmd?.left||cmd?.right)reasons.push('not-uncontested-forward-fire');
 if(PRIORITY.some(k=>!!cmd?.[k])||finite(cmd?.slot)&&cmd.slot>=0)reasons.push('priority-command');
 let state=null;
 if(reasons.length===0){
  state=publicPolicyState(client,now);
  const f=state.features;
  if(!state.eligible||!finite(f.snapshotAge)||f.snapshotAge>.2||!finite(f.distance)||f.distance<12||f.distance>85||f.healthFraction<.5)
   reasons.push('public-target-unreliable');
 }
 let left=false,right=false;
 if(reasons.length===0){
  left=publicClearanceC14(client,cmd,-1,{distance});
  right=publicClearanceC14(client,cmd,1,{distance});
  if(!left||!right)reasons.push('bilateral-public-geometry');
 }
 return {eligible:reasons.length===0,reasons,clearance:{left,right},
  publicTargetId:state?.targetId??null,
  publicSnapshotAge:state?.features?.snapshotAge??null};
}
export class FiringCompatibleMacroC35H{
 constructor({policy='observe',seed,mode='tdm',matchId,setupId,cooldown=.5,burstTicks=3,clearanceMeters=.8}={}){
  if(!C35H_POLICIES.includes(policy)||!Number.isSafeInteger(seed)||!matchId||!setupId||
    !finite(cooldown)||cooldown<.25||cooldown>2||!Number.isInteger(burstTicks)||burstTicks<1||burstTicks>5||
    !finite(clearanceMeters)||clearanceMeters<.4||clearanceMeters>1.5)throw Error('C35H invalid preregistered configuration');
  this.policy=policy;this.seed=seed;this.mode=mode;this.matchId=matchId;this.setupId=setupId;
  this.cooldown=cooldown;this.burstTicks=burstTicks;this.clearanceMeters=clearanceMeters;
  this.nextTryAt=0;this.lastTime=-Infinity;this.active=null;this.ordinal=0;
  this.events=[];this.counts={ticks:0,fireTicks:0,eligible:0,rejected:0,episodes:0,
   modifiedTicks:0,interrupted:0,completed:0,incumbentFireModified:0,otherControlsModified:0,
   fireForwardTicks:0,fireLateralTicks:0,fireWithoutMovementTicks:0,refusalReasons:{}};
 }
 command(now,client,incumbent,microApplied){
  if(!finite(now)||now<=this.lastTime)throw Error('C35H nonmonotonic clock');
  this.lastTime=now;this.counts.ticks++;
  const base={...microApplied};if(incumbent?.fire){this.counts.fireTicks++;
   if(incumbent.forward)this.counts.fireForwardTicks++;
   if(incumbent.left||incumbent.right)this.counts.fireLateralTicks++;
   if(!incumbent.forward&&!incumbent.backward&&!incumbent.left&&!incumbent.right)this.counts.fireWithoutMovementTicks++;}
  // Strictly prohibit touching or hiding incumbent priority, yaw, aim, weapon or trigger.
  if(base.fire!==incumbent.fire)throw Error('C35H upstream fire change');
  if(this.active){
   const gate=publicFireCorridorC35H(client,incumbent,now,{mode:this.mode,distance:this.clearanceMeters});
   if(!gate.eligible || !this.active.canContinue || base.forward!==incumbent.forward||base.left!==incumbent.left||base.right!==incumbent.right){
    this.active.interrupted=true;this.active.stopReason=gate.reasons.join('|')||'upstream-command';this.counts.interrupted++;this.active=null;
   }else{
    const key=this.active.side<0?'left':'right';
    this.active.deliveredTicks++;this.counts.modifiedTicks++;
    const applied={...base,[key]:true};
    if(this.active.deliveredTicks>=this.burstTicks){this.active.complete=true;this.counts.completed++;this.active=null;}
    this.verify(incumbent,base,applied);return applied;
   }
  }
  if(now+1e-8<this.nextTryAt)return base;
  const gate=publicFireCorridorC35H(client,incumbent,now,{mode:this.mode,distance:this.clearanceMeters});
  if(!gate.eligible){this.counts.rejected++;
   for(const reason of gate.reasons)this.counts.refusalReasons[reason]=(this.counts.refusalReasons[reason]||0)+1;
   return base;}
  // A valid candidate has to pass the independent upstream micro gate: firing
  // never receives a C21 micro command, and command shape must be unchanged.
  if(base.forward!==incumbent.forward||base.left!==incumbent.left||base.right!==incumbent.right||base.backward!==incumbent.backward)
   throw Error('C35H upstream competing movement');
  this.nextTryAt=now+this.cooldown;
  this.counts.eligible++;this.counts.episodes++;
  const side=hash32(this.seed^Math.imul(++this.ordinal,0x4c35a9a1))%2===0?-1:1;
  const event={id:`${this.matchId}:fire-corridor:${this.ordinal}`,t:+now.toFixed(5),side,
   publicTargetId:gate.publicTargetId,publicSnapshotAge:gate.publicSnapshotAge,
   assigned:'public-bilateral-geometry-symmetric',policy:this.policy,deliveredTicks:0,
   complete:false,interrupted:false,stopReason:null,predecisionOnly:true};
  this.events.push(event);
  if(this.policy==='observe')return base;
  this.active={...event,canContinue:true};
  // Keep exact same event object for accounting.
  this.events[this.events.length-1]=this.active;
  this.active.deliveredTicks++;this.counts.modifiedTicks++;
  const applied={...base,[side<0?'left':'right']:true};
  if(this.active.deliveredTicks>=this.burstTicks){this.active.complete=true;this.counts.completed++;this.active=null;}
  this.verify(incumbent,base,applied);return applied;
 }
 verify(incumbent,base,applied){
  // Only add one lateral key; preserve *all* original fields including fire,
  // aim, yaw/pitch, abilities, weapon controls and macro forward movement.
  const changed=Object.keys(applied).filter(k=>applied[k]!==base[k]);
  if(changed.length!==1||!['left','right'].includes(changed[0])||applied[changed[0]]!==true||
    Object.entries(incumbent).some(([k,v])=>k!=='left'&&k!=='right'&&applied[k]!==v)){
   this.counts.otherControlsModified++;throw Error('C35H invariant violated');
  }
 }
 finish(){
  if(this.active){this.active.stopReason='end-of-match-censored';this.active=null;}
  if(this.counts.otherControlsModified||this.counts.incumbentFireModified)throw Error('C35H controller illegal actuation');
  if(this.counts.modifiedTicks!==this.events.reduce((s,e)=>s+e.deliveredTicks,0))throw Error('C35H tick accounting mismatch');
  return {schema:C35H_SCHEMA,policy:this.policy,matchId:this.matchId,setupId:this.setupId,
   guard:'public predecision target age, local predicted state, bilateral static geometry; separate from C16 micro gate',
   status:'RESEARCH ONLY; no production actuation',cooldownSeconds:this.cooldown,
   burstTicks:this.burstTicks,clearanceMeters:this.clearanceMeters,counts:this.counts,events:this.events};
 }
}
