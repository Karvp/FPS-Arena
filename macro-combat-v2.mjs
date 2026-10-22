// Goal-oriented close-weapon combat arbiter. Pure state machine: it chooses
// when to keep approaching, never synthesizes a route through geometry or
// changes the authoritative gun/shot rules.
const mcDistance=(a,b)=>Math.hypot((a?.x??0)-(b?.x??0),(a?.z??0)-(b?.z??0));
export function macroCombatPhase(game,target,weapon,now=0,memory={}) {
  const mv=game?.local?.mv,ws=game?.local?.ws;
  const cat=weapon?.cat;
  if(!mv||!ws||!game.local.alive||!target?.point || !['Shotgun','SMG'].includes(cat)){
    memory.phase='idle';memory.target=null;
    return {phase:'idle',distance:Infinity,engageAt:0};
  }
  const d=mcDistance(mv,target.point);
  const max=Number.isFinite(weapon.maxRange)?weapon.maxRange:(cat==='Shotgun'?32:120);
  const engageAt=cat==='Shotgun'?Math.min(13,Math.max(7,max*.36)):
    Math.min(29,Math.max(16,max*.25));
  const active=ws.guns?.[ws.slot];
  const recover=ws.reloading||ws.plateT>0||active?.mag===0||game.local.hp<48;
  const id=String(target.id??'');
  const same=memory.target===id;
  let phase=recover?'recover':d>engageAt+(same&&memory.phase==='approach'?-1:4)?'approach':
    target.visible?'engage':'reposition';
  if(same && memory.phase==='engage' && d<engageAt+4 && !recover && target.visible)
    phase='engage';
  if(!same){memory.target=id;memory.progressAt=now;memory.bestDist=d;memory.phaseAt=now;memory.suspendedUntil=-Infinity;}
  if(phase==='approach' && d<(memory.bestDist??Infinity)-.65){memory.bestDist=d;memory.progressAt=now;}
  if(phase!=='approach'){
    memory.progressAt=now;memory.bestDist=d;memory.suspendedUntil=-Infinity;
  }
  if(memory.phase!==phase){memory.phase=phase;memory.phaseAt=now;}
  if(phase==='approach' && now-(memory.progressAt??now)>1.35){
    memory.suspendedUntil=now+1.0;
    memory.bestDist=d;memory.progressAt=now;
  }
  return {phase,distance:d,engageAt,weaponClass:cat,suspended:now<(memory.suspendedUntil??-Infinity),targetId:id};
}
// Runs AFTER camera/peek but BEFORE world-space locomotion smoothing. Never
// overrides escape, reload, ring, objective, crate acquisition or safe cover
// if the pursuit step is not demonstrably traversable and improving spacing.
export function macroCombatArbitrate(game,target,phase,pursuit,reactive,policy={}) {
  if(phase?.phase!=='approach'||phase.suspended||!pursuit || !target?.point)return reactive;
  if(policy.emergency||policy.ring||policy.loot||policy.objective||policy.recovery||policy.dodge)return reactive;
  if(game.local.hp<55||game.local.ws?.reloading||game.local.ws?.plateT>0)return reactive;
  // SMGs already trade effectively at medium range; tests showed forcing a
  // push from ~30m reduced survival. Intervene only when well outside range.
  if(phase.distance<(phase.weaponClass==='SMG'?60:phase.engageAt+2))return reactive;
  const goodRoute=/^(?:pathfinding|pro-rotate|pro-long-range-close|duel-lateral-approach|engagement-sightline|macro-safe-advance)$/.test(pursuit.reason||'');
  const coverActuation=/^(?:camera-peek-hide|peek-reposition-cover|camera-cover-path|camera-peek-hold)$/.test(reactive?.reason||'');
  if(!goodRoute || !coverActuation)return reactive;
  const norm=Math.hypot(pursuit.x,pursuit.z);
  if(norm<.3)return reactive;
  const ux=pursuit.x/norm,uz=pursuit.z/norm;
  const mv=game.local.mv, before=mcDistance(mv,target.point);
  const next={x:mv.x+ux*1.8,y:mv.y,z:mv.z+uz*1.8};
  if(before-mcDistance(next,target.point)<.24)return reactive;
  if(typeof policy.canStep!=='function'||!policy.canStep(ux,uz,1.65))return reactive;
  // The planner may forbid crossing a live firing lane even when collision free.
  if(typeof policy.exposureAllowed==='function'&&!policy.exposureAllowed(next))return reactive;
  return {...pursuit,reason:'macro-range-approach',macroPhase:'approach'};
}
