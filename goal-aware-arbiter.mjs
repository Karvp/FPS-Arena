// FPS Arena v2.9.8 -- Goal-aware tactical arbitration (research-only).
// Counterfactual proposals require concrete low-yield same-target cycle evidence.
// Aim, trigger, fire, ADS and emergency movement are NEVER touched.
const GA_ROUTE=/^(?:pathfinding|pro-rotate|pro-long-range-close|precision-find-sightline|engagement-sightline|threat-aware-route|macro-range-approach|macro-vantage-approach|macro-covered-approach|macro-safe-advance)$/;
const GA_COVER=/^(?:camera-peek-hide|peek-reposition-cover|camera-cover-path|camera-peek-hold)$/;
const GA_SAFETY=/^(?:br-ring-path|br-next-ring|dodge-|predictive-hitscan-evasion|loot-|objective-|recovery-|evade-|emergency-|skill-|throwable-)/;
const gaFinite=Number.isFinite;
export function goalSource(reason=''){
 if(GA_ROUTE.test(reason))return 'PURSUIT';
 if(GA_COVER.test(reason))return 'CAMERA_COVER';
 if(GA_SAFETY.test(reason))return 'PRIORITY';
 if(/(?:strafe|squad|flank|spacing|duel|pro-combat|pro-hold|pro-brake|pro-fallback)/.test(reason))return 'COMBAT_MOVE';
 if(reason==='goal-aware-range-route')return 'GOAL_ARBITER';
 return reason?'OTHER':'NONE';
}
export function goalConflict(pursuit,chosen){
 if(!pursuit||!chosen||!GA_ROUTE.test(pursuit.reason||'')||!GA_COVER.test(chosen.reason||''))return null;
 const pn=Math.hypot(pursuit.x,pursuit.z),cn=Math.hypot(chosen.x,chosen.z);
 if(!gaFinite(pn)||!gaFinite(cn)||pn<.2||cn<.2)return null;
 const dot=(pursuit.x*chosen.x+pursuit.z*chosen.z)/(pn*cn);
 return {dot,opposed:dot<-.2};
}
export function validLowYieldEvidence(e,now,targetId){
 return !!(e&&e.label==='candidate-low-yield'&&Array.isArray(e.sequence)&&
   e.sequence.length===3&&e.sequence[1]==='TAKE_COVER'&&e.targetId===targetId&&
   gaFinite(e.time)&&now>=e.time&&now-e.time<=2.5&&
   gaFinite(e.intermediateDurationMs)&&e.intermediateDurationMs>=60&&
   e.intermediateFireTicks===0&&e.intermediateShotOpportunities===0&&
   e.intermediateHpLoss===0&&e.intermediateArmorLoss===0&&
   gaFinite(e.intermediateSelfRangeGainM)&&Math.abs(e.intermediateSelfRangeGainM)<.3);
}
function gaEmit(policy,event){if(typeof policy.onDecision==='function')policy.onDecision(event);}
// Shadow mode returns the exact original object reference in all circumstances.
export function goalAwareDecision(game,target,pursuit,chosen,now,memory={},policy={}){
 const original=chosen||pursuit;
 if(!original||!gaFinite(now)||!game?.local?.alive||!game.local.mv)return original;
 const targetId=String(target?.id??'');
 const p=game.local.mv;
 const point=target?.point;
 const valid=!!(targetId&&point&&[p.x,p.z,point.x,point.z].every(gaFinite));
 const distance=valid?Math.hypot(point.x-p.x,point.z-p.z):Infinity;
 const source=goalSource(original.reason||''),prior=memory.current;
 const conflict=goalConflict(pursuit,original);
 if(prior&&prior.source!==source){
   gaEmit(policy,{state:'goal-transition',from:prior.source,to:source,targetId,
     fromReason:prior.reason,toReason:original.reason,elapsedMs:Math.max(0,Math.round((now-prior.since)*1000))});
 }
 memory.current=prior?.source===source&&prior.targetId===targetId?prior:{source,targetId,since:now,reason:original.reason||''};
 memory.ticks=(memory.ticks||0)+1;
 if(conflict){memory.conflicts=(memory.conflicts||0)+1;
   if(!memory.lastConflictAt||now-memory.lastConflictAt>.5){
     gaEmit(policy,{state:'goal-conflict',source,requested:'PURSUIT',executed:source,targetId,
       pursuitReason:pursuit.reason,chosenReason:original.reason,dot:+conflict.dot.toFixed(3),
       distance:gaFinite(distance)?+distance.toFixed(2):null});
     memory.lastConflictAt=now;
   }
 }
 let reason='not-opposed';
 const danger=!!(policy.emergency||policy.dodge||policy.ring||policy.recovery||policy.loot||
   policy.objective||policy.unready||policy.weaponless||policy.fire||policy.shotOpportunity||
   game.local.ws?.reloading||game.local.ws?.plateT>0||
   game.local.hp<90||game.local.armor<35||
   (gaFinite(policy.lastDamage)&&now-policy.lastDamage<2));
 let direction=null;
 if(!valid)reason='no-target';
 else if(game.local.weapon?.cat!=='Shotgun')reason='weapon-not-evaluated';
 else if(danger)reason='priority-or-combat';
 else if(target.visible!==false)reason='target-visible';
 else if(distance<=Math.max(12,policy.engageAt??12)+8)reason='target-in-range';
 else if(!conflict?.opposed)reason='not-opposed';
 else if(!validLowYieldEvidence(policy.evidence,now,targetId)||memory.lastConsumedEvidenceTime===policy.evidence.time)reason='no-low-yield-evidence';
 else if(now<(memory.cooldownUntil??-Infinity))reason='cooldown';
 else if(!pursuit||![pursuit.x,pursuit.z].every(gaFinite))reason='invalid-route';
 else {
   const norm=Math.hypot(pursuit.x,pursuit.z),ux=pursuit.x/Math.max(norm,.001),uz=pursuit.z/Math.max(norm,.001);
   const next={x:p.x+ux*1.6,y:p.y,z:p.z+uz*1.6};
   const gain=distance-Math.hypot(point.x-next.x,point.z-next.z);
   if(norm<.25||gain<.6)reason='insufficient-range-progress';
   else if(typeof policy.canStep!=='function'||!policy.canStep(ux,uz,1.6))reason='route-blocked';
   else if(typeof policy.exposureAllowed!=='function'||!policy.exposureAllowed(next))reason='exposure-unproven';
   else {reason='verified-low-yield-cover-cycle'; direction={x:pursuit.x,z:pursuit.z,reason:'goal-aware-range-route'};}
 }
 const active=policy.active===true;
 if(direction&&active){
   memory.cooldownUntil=now+1.2; // single short command, not an ownership lock
   memory.lastConsumedEvidenceTime=policy.evidence.time; // one intervention per evidence episode
   gaEmit(policy,{state:'goal-intervention',targetId,from:source,to:'PURSUIT',reason,
     distance:+distance.toFixed(2),evidenceAgeMs:Math.round((now-policy.evidence.time)*1000)});
   return direction;
 }
 if(memory.lastReason!==reason||now-(memory.lastDecisionAt??-Infinity)>=2){
   gaEmit(policy,{state:direction?'goal-proposal':'goal-veto',targetId,
     requested:'PURSUIT',executed:source,reason,active,source,
     distance:gaFinite(distance)?+distance.toFixed(2):null,opposed:!!conflict?.opposed});
   memory.lastReason=reason;memory.lastDecisionAt=now;
 }
 return original;
}
// Final post-arbitration observation (diagnostic only): firing windows and suppression
// are correlations, not counterfactual shots or causal outcome estimates.
export function goalAwareObserve(target,input,now,memory={},policy={}){
 if(!gaFinite(now)||!input||!memory.current)return;
 const source=memory.current.source;
 if(policy.shotOpportunity){
   memory.shotOpportunityTicks=(memory.shotOpportunityTicks||0)+1;
   if(!input.fire){
     memory.unfiredOpportunityTicks=(memory.unfiredOpportunityTicks||0)+1;
     if(now-(memory.lastMissedAt??-Infinity)>=1){
       gaEmit(policy,{state:'goal-unfired-opportunity',targetId:String(target?.id??''),source,
         reason:memory.current.reason,fireSuppressedByMovement:!!policy.movementSuppressFire,
         note:'observational-not-counterfactual'});
       memory.lastMissedAt=now;
     }
   }
 }
 if(input.fire)memory.fireCommandTicks=(memory.fireCommandTicks||0)+1;
 if(now-(memory.lastSampleAt??-Infinity)>=1){
   gaEmit(policy,{state:'goal-summary',source,targetId:memory.current.targetId,
     conflicts:memory.conflicts||0,ticks:memory.ticks||0,
     shotOpportunityTicks:memory.shotOpportunityTicks||0,
     unfiredOpportunityTicks:memory.unfiredOpportunityTicks||0,
     fireCommandTicks:memory.fireCommandTicks||0});
   memory.lastSampleAt=now;
 }
}
