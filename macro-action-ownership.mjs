// Experimental Macro Action Ownership v2.9.5.
// Arbitration occurs after route/cover planners. It can preserve an already
// selected, traversable short-horizon movement goal against a brief contradictory
// cover-peek command. It never locks aim/fire or suppresses emergency actions.
const ownDistance=(a,b)=>Math.hypot((a?.x??0)-(b?.x??0),(a?.z??0)-(b?.z??0));
const ownRoute=/^(?:pathfinding|pro-rotate|pro-long-range-close|precision-find-sightline|engagement-sightline|threat-aware-route|macro-range-approach|macro-vantage-approach|macro-covered-approach|macro-safe-advance)$/;
const ownCover=/^(?:camera-peek-hide|peek-reposition-cover|camera-cover-path|camera-peek-hold)$/;
export function macroActionOwnership(game,target,pursuit,reactive,now=0,memory={},policy={}) {
  const original=reactive||pursuit;
  const note=(state,reason)=>{
    if(typeof policy.onDecision==='function' &&
       (memory.reportState!==state || memory.reportReason!==reason || now-(memory.reportAt??-Infinity)>.65)){
      memory.reportState=state;memory.reportReason=reason;memory.reportAt=now;
      policy.onDecision({state,reason,owner:memory.owner||'none',goalId:memory.goalId||null});
    }
  };
  const reset=(why)=>{if(why==='commit-expired-or-stalled'||why==='route-blocked'||why==='exposed')memory.suspendedUntil=now+.8;memory.owner=null;memory.goalId=null;memory.waypoint=null;memory.bestDistance=Infinity;note('owner-preempt',why);return original;};
  const mv=game?.local?.mv;
  if(!mv || !game?.local?.alive || !target?.point || !original || !pursuit || !Number.isFinite(now))return reset('invalid');
  // Narrow eligibility after independent SMG trials lost 5 kills across 4 pairs.
  if(game.local.weapon?.cat!=='Shotgun')return reset('weapon-not-validated');
  const emergency=policy.emergency||policy.ring||policy.recovery||policy.loot||policy.objective||policy.dodge||
    policy.unready||policy.weaponless||policy.visibleShot||game.local.hp<70||
    game.local.ws?.reloading||game.local.ws?.plateT>0||
    (Number.isFinite(policy.lastDamage)&&now-policy.lastDamage<1.45);
  if(emergency)return reset('priority');
  if(target.visible!==false)return reset('target-visible');
  if(now<(memory.suspendedUntil??-Infinity)){note('owner-suspended','cooldown');return original;}
  const id=String(target.id??'');
  if(!id || !ownRoute.test(pursuit.reason||'') || !ownCover.test(original.reason||''))return reset('not-route-cover-conflict');
  const distance=ownDistance(mv,target.point);
  if(distance<Math.max(17,policy.engageAt??0))return reset('in-range');
  const norm=Math.hypot(pursuit.x,pursuit.z),rn=Math.hypot(original.x,original.z);
  if(norm<.3||rn<.3)return reset('zero-movement');
  const px=pursuit.x/norm,pz=pursuit.z/norm;
  if((px*original.x+pz*original.z)/rn>-.22)return reset('not-opposed');
  // Keep a goal only for a short, bounded interval, as opposed to freezing WASD.
  if(memory.goalId!==id || memory.owner!=='approach'){
    memory.owner='approach';memory.goalId=id;memory.startedAt=now;
    memory.progressAt=now;memory.bestDistance=distance;
    memory.waypoint={x:mv.x+px*3.5,z:mv.z+pz*3.5};
  }
  const wp=memory.waypoint;
  const remaining=ownDistance(mv,wp);
  if(distance<memory.bestDistance-.25){memory.bestDistance=distance;memory.progressAt=now;}
  if(now-(memory.startedAt??now)>.55 || now-(memory.progressAt??now)>.32 || remaining<.65){
    return reset('commit-expired-or-stalled');
  }
  const ux=(wp.x-mv.x)/Math.max(.001,remaining),uz=(wp.z-mv.z)/Math.max(.001,remaining);
  if(distance-ownDistance({x:mv.x+ux,z:mv.z+uz},target.point)<.13)return reset('not-progressing');
  if(typeof policy.canStep!=='function'||!policy.canStep(ux,uz,1.4))return reset('route-blocked');
  // Existing threat intel is authoritative for risk checks; no speculative
  // charge into a lane when the caller cannot demonstrate acceptable exposure.
  const next={x:mv.x+ux*1.7,y:mv.y,z:mv.z+uz*1.7};
  if(typeof policy.exposureAllowed!=='function'||!policy.exposureAllowed(next))return reset('exposed');
  note('owner-applied','short-approach');
  return {x:ux,z:uz,reason:'macro-owner-approach',macroOwner:'approach',goalId:id};
}
