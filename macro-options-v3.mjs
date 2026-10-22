// FPS Arena Macro Options v3 (v2.9.6 research).
// A lightweight, explicitly interruptible movement option with event-based
// outcome instrumentation. No aiming, firing, camera or weapon mutations.
// Shadow mode is observational: it ALWAYS returns the original direction.
const optionDist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const optionRoute=/^(?:pathfinding|pro-rotate|pro-long-range-close|precision-find-sightline|engagement-sightline|threat-aware-route|macro-range-approach|macro-vantage-approach|macro-covered-approach|macro-safe-advance)$/;
const optionCover=/^(?:camera-peek-hide|peek-reposition-cover|camera-cover-path|camera-peek-hold)$/;
const optionFinite=v=>Number.isFinite(v);
const optionSafety=new Set(['EVADE','RING_ESCAPE','RECOVER','OBJECTIVE']);
/** Conservative post-hoc classification of a same-target A-B-A option sequence.
 * Does NOT assert causal damage avoidance or that the option was useless.
 * a/b are completed action outcomes; c is the next option transition.
 */
export function classifyOptionCycle(a,b,c,windowSec=1.5){
  if(!a||!b||!c||!Number.isFinite(a.start)||!Number.isFinite(b.end)||
    !(windowSec>0)||a.type!==c.type||a.type===b.type||
    !a.targetId||a.targetId!==b.targetId||a.targetId!==c.targetId||
    c.time-a.start>windowSec||c.time<b.end)return null;
  let label='unresolved';
  if(optionSafety.has(b.type))label='protected-interrupt';
  else if(b.fireTicks>0||b.shotOpportunities>0)label='combat-contact';
  else if(b.newLos)label='visibility-gain';
  else if(b.selfRangeGainM>.75)label='self-range-progress';
  else if((b.end-b.start)<.06)label='too-brief';
  else if(b.movedM<.5&&Math.abs(b.selfRangeGainM)<.3&&b.hpLoss===0&&b.armorLoss===0)
    label='candidate-low-yield';
  return {state:'option-cycle-evidence',sequence:[a.type,b.type,c.type],optionIds:[a.id,b.id,c.id],
    targetId:c.targetId,elapsedMs:Math.round((c.time-a.start)*1000),label,
    intermediateDurationMs:Math.round((b.end-b.start)*1000),
    intermediateSelfRangeGainM:+b.selfRangeGainM.toFixed(3),
    intermediateMovedM:+b.movedM.toFixed(3),
    intermediateFireTicks:b.fireTicks,intermediateShotOpportunities:b.shotOpportunities,
    intermediateHpLoss:b.hpLoss,intermediateArmorLoss:b.armorLoss};
}
function optionEmit(policy,state,data){if(typeof policy.onDecision==='function')policy.onDecision({state,...data});}
function optionState(game,target,pursuit,reactive,policy={}){
  if(policy.emergency||policy.dodge)return 'EVADE';
  if(policy.ring)return 'RING_ESCAPE';
  if(policy.recovery||game?.local?.ws?.reloading||game?.local?.ws?.plateT>0)return 'RECOVER';
  if(policy.objective||policy.loot)return 'OBJECTIVE';
  if(target?.visible&&target?.point&&game?.local?.mv&&
     optionDist(game.local.mv,target.point)<=Math.max(7,policy.engageAt??12)+4)return 'ENGAGE';
  if(optionCover.test(reactive?.reason||''))return 'TAKE_COVER';
  if(target?.point&&optionRoute.test(pursuit?.reason||''))return 'APPROACH';
  if(target?.point)return 'REPOSITION';
  return 'HOLD';
}
function optionFinish(memory,now,policy,why){
  const o=memory.option;
  if(!o)return;
  const outcome={id:o.id,type:o.type,targetId:o.targetId,start:o.start,end:now,
    movedM:o.moved,selfRangeGainM:o.selfRangeGain,
    fireTicks:o.fireTicks,shotOpportunities:o.shotOpportunities,newLos:o.newLos,
    hpLoss:o.hpLoss,armorLoss:o.armorLoss};
  // Proxy is diagnostic only; not an estimated kill probability or a learned policy.
  const proxy=Math.max(-2,Math.min(2,(o.fireTicks>0?1:0)+(o.newLos?.7:0)+
    Math.max(-10,Math.min(10,o.selfRangeGain))/6-(o.hpLoss+o.armorLoss*.5)/80));
  optionEmit(policy,'option-outcome',{
    option:o.type,optionId:o.id,targetId:o.targetId,
    durationMs:Math.round(Math.max(0,now-o.start)*1000),
    rangeGainM:+(o.startRange-o.lastRange).toFixed(3),
    selfRangeGainM:+o.selfRangeGain.toFixed(3),
    movedM:+o.moved.toFixed(3),fireTicks:o.fireTicks,shotOpportunities:o.shotOpportunities,
    newLos:o.newLos,hpLoss:+o.hpLoss.toFixed(2),armorLoss:+o.armorLoss.toFixed(2),
    proxyValue:+proxy.toFixed(3),interrupt:why,
    useful:o.selfRangeGain>.75||o.fireTicks>0||o.newLos||o.shotOpportunities>0
  });
  const recent=memory.recentOutcomes||(memory.recentOutcomes=[]);
  recent.push(outcome);
  if(recent.length>2)recent.shift();
  memory.option=null;
  return outcome;
}
function optionTransition(memory,type,targetId,distance,now,policy,why){
  if(memory.option?.type===type&&memory.option.targetId===targetId)return;
  optionFinish(memory,now,policy,why);
  memory.sequence=(memory.sequence||0)+1;
  const id='option-'+memory.sequence;
  // Only count an ABA if all three options act on the same target. Do not
  // conflate a target switch with unproductive local movement oscillation.
  const recent=memory.recentOutcomes||[];
  if(recent.length===2){
    const cycle=classifyOptionCycle(recent[0],recent[1],{type,targetId,time:now,id});
    if(cycle)optionEmit(policy,'option-cycle-evidence',cycle);
  }
  memory.lastProgressAt=now;
  memory.option={id,type,targetId,start:now,startRange:distance,lastRange:distance,
    moved:0,selfRangeGain:0,fireTicks:0,shotOpportunities:0,newLos:false,wasVisible:false,
    hpLoss:0,armorLoss:0,lastHp:null,lastArmor:null,lastPose:null,lastTargetPos:null};
  optionEmit(policy,'option-transition',{option:type,optionId:id,targetId,reason:why});
}
/** Evaluates tactical movement ownership. A single physical direction is returned.
 * The caller may choose active:true ONLY for the simulator-only experimental profile.
 * Inactive/shadow paths are strictly referentially identical to the caller's input.
 */
export function macroOptionDecision(game,target,pursuit,reactive,now,memory={},policy={}){
  const original=reactive||pursuit;
  if(!optionFinite(now)||!game?.local?.alive||!game.local.mv||!original){
    if(optionFinite(now))optionFinish(memory,now,policy,'inactive');
    return original;
  }
  const point=target?.point,valid=point&&[point.x,point.z,game.local.mv.x,game.local.mv.z].every(optionFinite);
  const distance=valid?optionDist(game.local.mv,point):Infinity;
  const targetId=valid?String(target.id??''):'';
  const active=policy.active===true;
  const fallback=optionState(game,target,pursuit,reactive,policy);
  let picked=fallback,reason='baseline',proposed=original;
  const veto=(r)=>{reason=r;return false;};
  const emergency=!!(policy.emergency||policy.ring||policy.recovery||policy.loot||policy.objective||policy.dodge||policy.unready||policy.weaponless||
    game.local.ws?.reloading||game.local.ws?.plateT>0||game.local.hp<75||game.local.armor<22||
    (optionFinite(policy.lastDamage)&&now-policy.lastDamage<1.5));
  const engageAt=Math.max(7,Math.min(20,optionFinite(policy.engageAt)?policy.engageAt:12));
  const conflict=!!(pursuit&&original&&optionRoute.test(pursuit.reason||'')&&optionCover.test(original.reason||''));
  const type=game.local.weapon?.cat;
  const weaponEligible=type==='Shotgun';
  let candidate=false;
  if(!valid||!targetId) veto('no-target');
  else if(!weaponEligible)veto('weapon-not-evaluated');
  else if(emergency)veto('safety-or-objective');
  else if(target.visible!==false||policy.shotOpportunity||policy.fire)veto('available-combat');
  else if(distance<=engageAt+3)veto('within-engagement-range');
  else if(!conflict)veto('no-route-cover-conflict');
  else if(now<(memory.suspendedUntil??-Infinity))veto('suspended');
  else if(!optionFinite(pursuit.x)||!optionFinite(pursuit.z))veto('invalid-route');
  else {
    const rn=Math.hypot(pursuit.x,pursuit.z),on=Math.hypot(original.x,original.z);
    const ux=pursuit.x/Math.max(.001,rn),uz=pursuit.z/Math.max(.001,rn);
    const dot=(ux*original.x+uz*original.z)/Math.max(.001,on);
    const next={x:game.local.mv.x+ux*1.8,y:game.local.mv.y,z:game.local.mv.z+uz*1.8};
    const gain=distance-optionDist(next,point);
    if(rn<.3||on<.3||dot>-.18)veto('not-opposed');
    else if(gain<.25)veto('no-range-progress');
    else if(typeof policy.canStep!=='function'||!policy.canStep(ux,uz,1.8))veto('blocked-route');
    else if(typeof policy.exposureAllowed!=='function'||!policy.exposureAllowed(next))veto('unsafe-exposure');
    else if(memory.option?.type==='APPROACH'&&memory.option.targetId===targetId&&
      now-(memory.lastProgressAt??now)>.60){
      memory.suspendedUntil=now+.8;veto('progress-stalled');
    }else {candidate=true;picked='APPROACH';reason='safe-range-progress';proposed={...pursuit,reason:'macro-option-approach',macroOption:'APPROACH'};}
  }
  if(!candidate&&reason==='progress-stalled')picked='TAKE_COVER';
  const actual=active&&candidate?proposed:original;
  const actualOption=active&&candidate?'APPROACH':fallback;
  // The counterfactual option is reported separately from what actually moved.
  // No mutation of input direction or firearm controls in shadow mode.
  if(memory.lastProposed!==picked||memory.lastReason!==reason||now-(memory.lastDiagnosticAt??-Infinity)>2.0){
    optionEmit(policy,candidate?'option-proposal':'option-veto',{
      proposed:picked,executed:actualOption,reason,active,targetId,distance:optionFinite(distance)?+distance.toFixed(2):null});
    memory.lastProposed=picked;memory.lastReason=reason;memory.lastDiagnosticAt=now;
  }
  if(memory.option?.targetId!==targetId||memory.option?.type!==actualOption)
    optionTransition(memory,actualOption,targetId,optionFinite(distance)?distance:0,now,policy,reason);
  memory.currentDecision={candidate,active,proposed:picked,executed:actualOption,reason,
    targetId,distance:optionFinite(distance)?distance:null};
  return actual;
}
/** Observe final command after ALL gameplay and fire arbitration, not the proposal. */
export function macroOptionObserve(game,target,input,now,memory={},policy={}){
  if(!optionFinite(now)||!memory.option||!game?.local?.mv)return;
  const o=memory.option,p=game.local.mv;
  // Damage is an outcome proxy only; a respawn/health reset should not count
  // as damage. The owner does not infer how much damage was *avoided*.
  const hp=game.local.hp,armor=game.local.armor;
  if(optionFinite(hp)){
    if(optionFinite(o.lastHp))o.hpLoss+=Math.max(0,o.lastHp-hp);
    o.lastHp=hp;
  }
  if(optionFinite(armor)){
    if(optionFinite(o.lastArmor))o.armorLoss+=Math.max(0,o.lastArmor-armor);
    o.lastArmor=armor;
  }
  if(optionFinite(p.x)&&optionFinite(p.z)){
    if(o.lastPose){
      o.moved+=Math.hypot(p.x-o.lastPose.x,p.z-o.lastPose.z);
      if(o.lastTargetPos){
        o.selfRangeGain+=optionDist(o.lastPose,o.lastTargetPos)-optionDist(p,o.lastTargetPos);
      }
    }
    o.lastPose={x:p.x,z:p.z};
  }
  const q=target?.point;
  if(q&&optionFinite(q.x)&&optionFinite(q.z)){
    const d=optionDist(p,q);
    if(o.lastRange-d>.25)memory.lastProgressAt=now;
    o.lastRange=d;
    o.lastTargetPos={x:q.x,z:q.z};
  }
  if(target?.visible){if(!o.wasVisible)o.newLos=true;o.wasVisible=true;}
  if(input?.fire)o.fireTicks++;
  if(policy.shotOpportunity===true)o.shotOpportunities++;
  if(now-(memory.lastSampleAt??-Infinity)>=.5){
    optionEmit(policy,'option-sample',{option:o.type,optionId:o.id,targetId:o.targetId,
      range:optionFinite(o.lastRange)?+o.lastRange.toFixed(2):null,
      movedM:+o.moved.toFixed(2),selfRangeGainM:+o.selfRangeGain.toFixed(2),fireTicks:o.fireTicks,shotOpportunities:o.shotOpportunities,
      hpLoss:+o.hpLoss.toFixed(2),armorLoss:+o.armorLoss.toFixed(2),
      actuallyFired:!!input?.fire,visible:!!target?.visible,active:memory.currentDecision?.active===true,
      candidate:memory.currentDecision?.candidate===true,reason:memory.currentDecision?.reason});
    memory.lastSampleAt=now;
  }
}
export function macroOptionEnd(memory,now,policy={},reason='match-end'){
  if(optionFinite(now))optionFinish(memory,now,policy,reason);
}
/** Correct attribution if a downstream research arbiter changes physical movement.
 * Option accounting must reflect what actually executed, never an earlier proposal.
 */
export function macroOptionReconcile(memory,target,finalDirection,now,policy={}){
 if(!optionFinite(now)||!memory?.option||finalDirection?.reason!=='goal-aware-range-route')return false;
 const targetId=String(target?.id??'');
 if(!targetId||memory.option.targetId!==targetId)return false;
 const distance=Number.isFinite(memory.option.lastRange)?memory.option.lastRange:0;
 if(memory.option.type!=='APPROACH')optionTransition(memory,'APPROACH',targetId,distance,now,policy,'goal-arbiter-executed');
 if(memory.currentDecision){memory.currentDecision.executed='APPROACH';memory.currentDecision.reason='goal-arbiter-executed';}
 return true;
}
