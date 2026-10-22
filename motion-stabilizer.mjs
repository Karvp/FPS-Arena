// Damp small navigation corrections without delaying emergencies or barrier ingress.
// Hold a direction for a short minimum interval; never override obstacles or safety.
export function stabilizeMovement(sampled, proposed, yaw, now, memory={}, settings={}) {
  if (!proposed || !Number.isFinite(proposed.x) || !Number.isFinite(proposed.z)) {
    // A short pause must not erase steering history. Camera/cover planners can
    // return one neutral tick between opposite micro-corrections.
    if (Number.isFinite(now) && (!Number.isFinite(memory.idleSince))) memory.idleSince=now;
    if (Number.isFinite(memory.idleSince) && now-memory.idleSince>.48) memory.heading=null;
    return {...sampled,forward:false,backward:false,left:false,right:false};
  }
  const magnitude=Math.hypot(proposed.x,proposed.z);
  if(magnitude<.09){
    // A short pause must not erase steering history. Camera/cover planners can
    // return one neutral tick between opposite micro-corrections.
    if (Number.isFinite(now) && (!Number.isFinite(memory.idleSince))) memory.idleSince=now;
    if (Number.isFinite(memory.idleSince) && now-memory.idleSince>.48) memory.heading=null;
    return {...sampled,forward:false,backward:false,left:false,right:false};
  }
  memory.idleSince=null;
  const requested={x:proposed.x/magnitude,z:proposed.z/magnitude};
  const reason=String(proposed.reason||'');
  const emergency=!!(proposed.emergency || proposed.ringPlan?.urgent || settings.ringPriority ||
    reason.startsWith('br-ring-escape') || reason.startsWith('br-next-ring-urgent') ||
    reason.includes('explosive') || reason.includes('evade') || reason.includes('dodge') ||
    reason.includes('escape'));
  let desired=requested;
  if(!emergency && memory.heading && Number.isFinite(memory.time)) {
    const prev=memory.heading;
    const dot=prev.x*requested.x+prev.z*requested.z;
    const age=now-memory.time;
    // Reject a transient 180-degree correction for 240ms (typical 12-15 ticks).
    // Movement can still change immediately if the previous heading is obstructed.
    const available=typeof settings.safePrevious==='function'?settings.safePrevious(prev):true;
    if(dot<-.4 && age<(settings.reverseHoldMs??380)/1000 && available) desired=prev;
    else if(dot>.05 && dot<.99) {
      const w=.28; const x=prev.x*(1-w)+requested.x*w,z=prev.z*(1-w)+requested.z*w;
      const len=Math.hypot(x,z)||1;desired={x:x/len,z:z/len};
    }
  }
  // Clock starts when a new direction is accepted, not each tiny rotation;
  // otherwise constant camera corrections can prevent legitimate turns.
  if(!memory.heading || memory.heading.x*desired.x+memory.heading.z*desired.z<.35 || emergency)
    memory.time=now;
  memory.heading=desired;
  const forward=-Math.sin(yaw)*desired.x-Math.cos(yaw)*desired.z;
  const right=Math.cos(yaw)*desired.x-Math.sin(yaw)*desired.z;
  // Larger dead-band reduces key flicker near forward/side diagonal boundaries.
  return {...sampled,forward:forward>.28,backward:forward<-.28,right:right>.28,left:right<-.28};
}
