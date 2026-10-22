// FPS Arena skill-use policy. Server remains authoritative: this module only
// decides whether to send a single legal T-key edge on the existing input.
// It never changes energy, cooldowns, or damage; one equipped skill per life.
export const SKILL_REASONS = Object.freeze({
  hook:'hook-safe-traverse', exo:'exo-prep-engagement', kinetic:'kinetic-under-fire',
  polter:'polter-disengage', pad:'pad-escape', annih:'annih-finisher', pulse:'pulse-scan'
});
const skillDist=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.z||0)-(b?.z||0));
const skillFinite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
function skillNearby(game,range){
  const here=game?.local?.mv || game?.pos;
  const own=game?.you?.tm;
  const people=(game?.remotes?.list||[]).filter(r=>r?.alive!==false && skillFinite(r.pos) &&
    (own==null || (r.team!==own && r.team!==game.local?.team)) && !r.data?.dn)
    .map(r=>({type:'player',id:r.id,d:skillDist(here,r.pos),pos:r.pos,visible:!r.invisible}));
  if(game?.modeState?.type!=='zm')return people.filter(r=>r.d<range);
  return people.concat((game?.zremotes?.list||[]).filter(r=>r?.alive!==false&&skillFinite(r.pos))
    .map(r=>({type:'zombie',id:r.id,d:skillDist(here,r.pos),pos:r.pos,visible:true})))
    .filter(r=>r.d<range);
}
export function skillDecision(game,input,context={},memory={},catalog={},helpers={}){
  const state=game?.you?.sk, id=state?.id;
  const out={...input,skill:false};
  const now=Number.isFinite(context.now)?context.now:0;
  // Server is edge-triggered. A true input MUST be followed by false before
  // another cast, even if snapshots are delayed or an attempt is rejected.
  if(memory.pressed){memory.pressed=false;return {input:out,reason:'skill-key-release'};}
  if(context.enabled===false || !catalog[id] || !Number.isFinite(state.e) ||
     state.e+0.001<catalog[id].cost || !game?.local?.alive || game?.local?.down ||
     game?.local?.frozen || game?.you?.fz || game?.phase!=='match' ||
     game?.local?.mv?.air || game?.local?.mv?.heli || game?.local?.mv?.hk ||
     game?.you?.ss?.view || game?.you?.fxs?.charge || state.ch>0 ||
     (id==='exo'&&game.you?.fxs?.exo) || (id==='kinetic'&&game.you?.fxs?.ka) ||
     (id==='polter'&&Number(state.a)>0) || (id==='annih'&&game.you?.fxs?.annih) ||
     input.use || input.interact || input.plate || input.slot>=0 ||
     now<(memory.nextAttempt||0))return {input:out,reason:'skill-not-eligible'};
  const threats=skillNearby(game,60).sort((a,b)=>a.d-b.d);
  const nearest=threats[0]?.d??Infinity;
  const count12=threats.filter(t=>t.d<12).length;
  const count22=threats.filter(t=>t.d<22).length;
  const hp=Number(game.local?.hp??100),armor=Number(game.local?.armor??0);
  const mv=game.local.mv, dir=context.direction;
  const directional=skillFinite(dir)&&Math.hypot(dir.x,dir.z)>0.5;
  const range=Number.isFinite(context.targetDistance)?context.targetDistance:Infinity;
  let use=false, reason=SKILL_REASONS[id];
  switch(id){
    case 'kinetic':
      use=(count22>0 && (armor<55 || hp<72 || count12>=2)) ||
          (game.modeState?.type==='zm' && count12>=3);
      break;
    case 'exo':
      // 1s windup locks gun use, so prepare before contact, not while being bitten.
      use=nearest>14 && nearest<52 && !input.reload && !game.local.ws?.reloading &&
        (range<55 || threats.some(t=>t.d<52));
      break;
    case 'polter':
      // Stealth ends on fire, so don't spend it while firing or interacting.
      use=(hp<55 || armor<18 || count22>=2) && nearest>=8 && nearest<35 &&
        !input.fire && !input.reload && !context.ringUrgent;
      break;
    case 'pulse':
      // Pulse's 24m sphere is most valuable where line of sight is uncertain.
      use=threats.some(t=>t.type==='player' && t.d<23) &&
        (!context.targetVisible || count22>=2);
      break;
    case 'annih':
      // After one shot, the user is unarmed for 3 seconds. Avoid crowds,
      // long-range speculative shots and critical BR rotations.
      use=game.modeState?.type!=='zm' && range<24 && range>2.5 &&
        context.targetVisible===true && count12<=1 && !context.ringUrgent &&
        (game.local.ws?.guns?.[game.local.ws.slot]?.mag===0 || hp<50);
      break;
    case 'pad': {
      // Leap follows camera forward: verify landing corridor, no blind wall leap.
      const escape=(nearest<9 || context.ringUrgent || (game.modeState?.type==='zm'&&count12>=2));
      if(!escape || !directional || typeof helpers.safeDirection!=='function')break;
      const l=Math.hypot(dir.x,dir.z),dx=dir.x/l,dz=dir.z/l;
      const dest={x:mv.x+dx*10,z:mv.z+dz*10};
      const ringOk=typeof helpers.ringAllowed!=='function'||helpers.ringAllowed(dest);
      if(ringOk && helpers.safeDirection(dx,dz,6.5)){
        use=true;out.forward=true;out.backward=false;out.left=false;out.right=false;
        out.aim=false;out.fire=false;
        out.__skillYaw=Math.atan2(-dx,-dz);out.__skillPitch=0;
      }
      break;
    }
    case 'hook': {
      // Grapple only when a skillNearby reachable wall anchor can be verified. No
      // speculative activation at empty sky or into an unsafe BR destination.
      if(!(context.ringUrgent || (nearest<12 && hp<55)) || !directional ||
         typeof helpers.rayWorld!=='function' || typeof helpers.ringAllowed!=='function')break;
      const l=Math.hypot(dir.x,dir.z),dx=dir.x/l,dz=dir.z/l;
      const origin=[mv.x,mv.y+1.5,mv.z],vec=[dx,0,dz];
      const hit=helpers.rayWorld(origin,vec,game.map?.boxes||[],40);
      const end={x:mv.x+dx*Math.max(0,hit-1),z:mv.z+dz*Math.max(0,hit-1)};
      if(Number.isFinite(hit)&&hit>5&&hit<39 && helpers.ringAllowed(end)){
        use=true;out.aim=false;out.fire=false;
        out.__skillYaw=Math.atan2(-dx,-dz);out.__skillPitch=0;
      }
      break;
    }
  }
  if(!use)return {input:out,reason:'skill-not-needed'};
  memory.pressed=true;
  memory.nextAttempt=now+(id==='pad'?0.75:id==='pulse'?1.0:1.35);
  memory.casts=(memory.casts||0)+1;
  memory.lastSkill=id;memory.lastCastAt=now;
  out.skill=true;
  return {input:out,reason,skill:id};
}
