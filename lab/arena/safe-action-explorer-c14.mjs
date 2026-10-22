// C14 — headless-only, match-randomized safe micro-strafe exploration.
// Never imported by the shipped extension. Only delayed client-public snapshots,
// own predicted state, own selected command and public static map geometry.
import {publicPolicyState,commandAction} from './encounter-policy-recorder-c13.mjs';
import {MOVE, STANCE_H} from './source-main/shared/constants.js';
const finite=Number.isFinite;
const round=x=>finite(x)?+x.toFixed(5):null;
function hash32(n){let x=(n>>>0)+0x9E3779B9>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return (x^(x>>>16))>>>0;}
export function matchAssignmentC14(seed,{probability=.5,forcedArm=null}={}){
 if(!Number.isSafeInteger(seed)||!finite(probability)||probability<0||probability>1||
   (forcedArm!==null&&!['control','treatment'].includes(forcedArm)))throw Error('invalid C14 assignment');
 const draw=hash32(seed^0x14a14a14)/4294967296;
 const arm=forcedArm|| (draw<probability?'treatment':'control');
 return {arm,design:forcedArm===null?'randomized-match':'forced-arm-diagnostic',seed,
  draw:round(draw),treatmentProbability:forcedArm===null?probability:(arm==='treatment'?1:0),
  assignmentProbability:forcedArm===null?(arm==='treatment'?probability:1-probability):1,
  unit:'(mode,map,seed,loadout) match',independence:'match-level',
  randomized:forcedArm===null};
}
const movementDisallowed=cmd=>!!(cmd?.fire||cmd?.skill||cmd?.reload||cmd?.use||cmd?.interact||
 cmd?.plate||cmd?.throw||cmd?.jump||cmd?.crouch||cmd?.slide||cmd?.prone||cmd?.lean||
 cmd?.left||cmd?.right||cmd?.backward||cmd?.slot>=0&&cmd.slot!==-1);
export function publicClearanceC14(client,cmd,side,{distance=1.0}={}){
 const p=client?.pos,m=client?.map,yaw=client?.rig?.yaw,move=client?.local?.mv;
 if(!p||!m||!Array.isArray(m.boxes)||!finite(m.bound)||!finite(yaw)||
   ![p.x,p.z,move?.y].every(finite)||![-1,1].includes(side)||
   !finite(distance)||distance<=0||distance>2)return false;
 const forward=cmd?.forward?1:0;
 const dx=-Math.sin(yaw)*forward+Math.cos(yaw)*side;
 const dz=-Math.cos(yaw)*forward-Math.sin(yaw)*side;
 const len=Math.hypot(dx,dz);if(len<.01)return false;
 const radius=MOVE.radius+.12;
 const height=STANCE_H[move.stance||0]||STANCE_H[0];
 // Broad-phase conservative segment sweep, never reads authoritative enemy state.
 for(let i=0;i<=5;i++){
  const x=p.x+dx/len*distance*i/5,z=p.z+dz/len*distance*i/5;
  if(Math.abs(x)>m.bound-radius-.15||Math.abs(z)>m.bound-radius-.15)return false;
  for(const b of m.boxes){
   if(![b.x0,b.x1,b.z0,b.z1,b.y0,b.y1].every(finite))return false;
   if(x+radius>b.x0&&x-radius<b.x1&&z+radius>b.z0&&z-radius<b.z1&&
      move.y+height>b.y0&&move.y+.05<b.y1)return false;
  }
 }
 return true;
}
export function candidateSetC14(client,cmd,now,mode='tdm'){
 const state=publicPolicyState(client,now),reasons=[];
 if(mode!=='tdm')reasons.push('mode');
 if(!state.eligible||state.features.snapshotAge>.22)reasons.push('stale-or-incomplete-public-state');
 if(state.eligible&&(state.features.distance<24||state.features.distance>100))reasons.push('distance');
 if(state.eligible&&state.features.healthFraction<.75)reasons.push('low-health');
 if(state.eligible&&state.features.onGround!==1)reasons.push('not-grounded');
 if(!client?.local?.alive||client.local.down||client.local.frozen||client.local.mv?.heli||client.local.mv?.air||client.local.mv?.slideT>0||client.local.mv?.hk>0||client.local.mv?.gs>0)
  reasons.push('movement-state');
 if(movementDisallowed(cmd))reasons.push('incumbent-priority-command');
 const left=publicClearanceC14(client,cmd,-1),right=publicClearanceC14(client,cmd,1);
 if(!left||!right)reasons.push('public-static-geometry');
 // Both lateral alternatives must be available to allow symmetric sampling.
 return {eligible:reasons.length===0,reasons,candidates:reasons.length?['baseline']:['baseline','micro-left','micro-right'],
  clearance:{left,right},state,originalAction:commandAction(cmd)};
}
export class SafeActionExplorerC14{
 constructor({seed,mode,map,loadout,assignment,offerCooldown=.9,actionSeconds=.16,maximumOffers=1500}={}){
  if(!Number.isSafeInteger(seed)||!assignment||!['control','treatment'].includes(assignment.arm)||
    !finite(offerCooldown)||offerCooldown<.5||!finite(actionSeconds)||actionSeconds<=0||actionSeconds>.25)
    throw Error('invalid C14 explorer config');
  this.seed=seed;this.mode=mode;this.map=map;this.loadout=loadout;this.assignment=assignment;
  this.offerCooldown=offerCooldown;this.actionSeconds=actionSeconds;this.maximumOffers=maximumOffers;
  this.nextOfferAt=0;this.activeUntil=-1;this.current=null;this.offers=[];this.skipped={};this.totalEligible=0;
  this.interventionTicks=0;this.interruptions=0;this.eventCounts={shots:0,hits:0,kills:0,deaths:0};
 }
 command(now,client,original){
  // Clone so incumbent object and input replay diagnostics cannot be mutated.
  const base={...original};
  if(this.current&&now<this.activeUntil-1e-6){
   const valid=(this.candidateSet||candidateSetC14)(client,base,now,this.mode);
   if(valid.eligible&&this.assignment.arm==='treatment'){
    const side=this.current.selectedAction==='micro-left'?'left':'right';this.interventionTicks++;
    return {...base,[side]:true};
   }
   this.current.interrupted=true;this.interruptions++;this.activeUntil=-1;
  }
  if(now+1e-6<this.nextOfferAt)return base;
  this.nextOfferAt=now+this.offerCooldown;
  const set=(this.candidateSet||candidateSetC14)(client,base,now,this.mode);
  if(!set.eligible){for(const r of set.reasons)this.skipped[r]=(this.skipped[r]||0)+1;return base;}
  this.totalEligible++;
  if(this.offers.length>=this.maximumOffers)return base;
  const offerIndex=this.totalEligible;
  const sideDraw=hash32(this.seed^Math.imul(offerIndex,0x517cc1b7)^0x14141414)/4294967296;
  const selectedAction=this.assignment.arm==='treatment'?(sideDraw<.5?'micro-left':'micro-right'):'baseline';
  const offer={schema:'fpsarena-c14-opportunity-v1',offerId:`${this.mode}-${this.map}-${this.seed}-${offerIndex}`,
   time:round(now),mode:this.mode,map:this.map,seed:this.seed,loadout:this.loadout,
   arm:this.assignment.arm,design:this.assignment.design,assignmentProbability:this.assignment.assignmentProbability,
   conditionalActionProbability:this.assignment.arm==='treatment'?.5:1,
   candidateSet:set.candidates,originalAction:set.originalAction,selectedAction,
   publicFeatures:set.state.features,publicTargetId:set.state.targetId,
   snapshotProvenance:set.state.provenance,clearance:set.clearance,
   interrupted:false,outcome:{shots:0,hits:0,kills:0,deaths:0,damageDealt:0,damageTaken:0},
   validity:{serverOnlyFeaturesUsed:false,counterfactualOutcomeObserved:false,exposureSource:'match-assigned'} };
  this.offers.push(offer);this.current=offer;
  if(this.assignment.arm==='treatment'){
   this.activeUntil=now+this.actionSeconds;this.interventionTicks++;
   return {...base,[selectedAction==='micro-left'?'left':'right']:true};
  }
  this.activeUntil=-1;
  return base;
 }
 serverEvent(now,type,data){
  const o=this.current;if(!o||!finite(now)||now<o.time-1e-6||now>=o.time+this.offerCooldown)return;
  if(type==='shot'&&data?.id==='trainee')o.outcome.shots++;
  else if(type==='hit'){o.outcome.hits++;o.outcome.damageDealt+=Math.max(0,finite(data?.dmg)?data.dmg:0);}
  else if(type==='kill'){if(data?.k==='trainee')o.outcome.kills++;if(data?.v==='trainee')o.outcome.deaths++;}
  else if(type==='dmg')o.outcome.damageTaken+=Math.max(0,Number(data?.h)||0)+Math.max(0,Number(data?.a)||0);
 }
 finish(endTime){
  for(const o of this.offers)o.outcome.censored=!finite(endTime)||endTime<o.time+this.offerCooldown-.02;
  return {schema:'fpsarena-c14-randomized-match-opportunity-v1',metadata:{seed:this.seed,mode:this.mode,
   map:this.map,loadout:this.loadout,assignment:this.assignment,productionActuation:false},
   diagnostics:{eligibleOffers:this.totalEligible,recordedOffers:this.offers.length,interventionTicks:this.interventionTicks,
    interruptions:this.interruptions,skipped:this.skipped},offers:this.offers};
 }
}
