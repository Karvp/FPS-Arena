// Tactical macro-action coordinator (v2.8.9 experimental).
// Separates the decision to continue a *specific* safe pursuit from the
// reactive cover/peek actuator. All inputs are publicly observable snapshots.
// Unlike heading locks, every candidate must remain geometrically traversable.
export function macroGoalDecision(game,target,approach,reactive,contacts=[],now=0,memory={},policy={}) {
  const chosen=reactive||approach;
  const mv=game?.local?.mv,ws=game?.local?.ws;
  if(!mv||!ws||!target||!chosen)return chosen;
  const phase=chosen.reason||'';
  const base=approach?.reason||'';
  const targetId=String(target.id??'');
  const targetDist=Math.hypot(target.point?.x-mv.x||0,target.point?.z-mv.z||0);
  const recovery=ws.reloading || ws.plateT>0 || (ws.guns?.[ws.slot]?.mag??0)<=0;
  const emergency=policy.emergency || policy.rotatingRing || policy.loot || policy.objective || recovery ||
    (game.local.hp??0)<78 || (game.local.armor??0)<20 ||
    (Number.isFinite(policy.lastDamage) && now-policy.lastDamage<2.0);
  const eligible=!emergency && target.visible===false && targetDist>30 &&
    (base==='pro-rotate'||base==='pathfinding'||base==='engagement-sightline') &&
    (phase==='peek-reposition-cover'||phase==='camera-peek-hide');
  if(!eligible || !Array.isArray(contacts) || !contacts.length || !policy.isSafe){
    memory.active=false;memory.goalId=null;
    return chosen;
  }
  const norm=Math.hypot(approach.x,approach.z),back=Math.hypot(chosen.x,chosen.z);
  if(norm<.25 || back<.3 || (approach.x*chosen.x+approach.z*chosen.z)/(norm*back)>-.25){
    memory.active=false;return chosen;
  }
  // We only arbitrate actual *opposing* locomotion orders, not arbitrary
  // movement: normal sidesteps, shooting peeks, and covered reload are untouched.
  const dx=approach.x/norm,dz=approach.z/norm;
  if(!policy.isSafe(dx,dz,1.8)){memory.active=false;return chosen;}
  if(memory.goalId!==targetId){
    memory.active=false;memory.goalId=targetId;memory.bestDist=targetDist;
    memory.progressAt=now;memory.startedAt=now;
  }
  if(targetDist<(memory.bestDist??Infinity)-.4){memory.bestDist=targetDist;memory.progressAt=now;}
  // A stalled macro is aborted to let the lower-level routing / cover planner
  // generate a new waypoint. Never hold an outdated objective indefinitely.
  if(now-(memory.progressAt??now)>1.05 || now-(memory.startedAt??now)>2.7){
    memory.active=false;memory.suspendedUntil=now+.9;return chosen;
  }
  if(now<(memory.suspendedUntil??-Infinity))return chosen;
  // Additional geometric exposure check is supplied by caller, so the macro
  // cannot substitute a nominal forward goal for actual protection.
  if(typeof policy.exposureSafe==='function' && !policy.exposureSafe({x:mv.x+dx*2.4,y:mv.y||0,z:mv.z+dz*2.4},contacts)){
    memory.active=false;return chosen;
  }
  memory.active=true;
  return {...approach,reason:'macro-safe-advance',macroGoal:targetId};
}

// Movement-only hidden opponent selection. The camera/weapon still acquires a
// newly visible enemy immediately; a blind navigation goal is never an aim or
// fire command. This prevents a small camera-angle score difference from
// sending the strategic path back and forth between opponents every tick.
export function macroChooseHiddenGoal(candidate, remotes, ownPos, now=0, memory={}, options={}) {
  if(!candidate || candidate.visible || !Number.isFinite(now) || !ownPos){
    memory.goalId=null;memory.since=null;
    return candidate;
  }
  const id=String(candidate.id??'');
  if(!id)return candidate;
  const dist=(p)=>Math.hypot(p.x-ownPos.x,p.z-ownPos.z);
  const currentDist=dist(candidate.point);
  if(memory.goalId && memory.goalId!==id && Number.isFinite(memory.since) && now-memory.since<2.3){
    const previous=(remotes||[]).find(r=>r && `${r.kind||'p'}:${r.id}`===memory.goalId &&
      r.alive && !r.invisible && Number.isFinite(r.pos?.x) && Number.isFinite(r.pos?.z) &&
      !r.friendly);
    if(previous){
      const oldPoint={x:previous.pos.x,y:previous.pos.y+(memory.aimOffset||1.35),z:previous.pos.z};
      const oldDist=dist(oldPoint);
      // Do not commit to a dramatically worse or departed opponent.
      if(oldDist<=Math.max(60,currentDist*1.35) && oldDist<=Math.max(70,options.maxDistance||300)){
        const best=memory.bestDist;
        if(!Number.isFinite(best)||oldDist<best-.65){memory.bestDist=oldDist;memory.progressAt=now;}
        if(now-(memory.progressAt??now)<1.6){
          return {...candidate,id:memory.goalId,point:oldPoint,remote:previous,
            distance:oldDist,visible:false,macroRetained:true};
        }
      }
    }
  }
  if(memory.goalId!==id){
    memory.goalId=id;memory.since=now;memory.progressAt=now;
    memory.bestDist=currentDist;
    memory.aimOffset=Number.isFinite(candidate.point?.y-candidate.remote?.pos?.y)?
      candidate.point.y-candidate.remote.pos.y:1.35;
  }
  return candidate;
}
