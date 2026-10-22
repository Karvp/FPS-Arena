import {predictedPoint,targetThreat} from './combat-core.mjs';
// FPS Arena aim geometry, independent of browser or Three.js runtime.
export const DEFAULTS = Object.freeze({
  enabled: false, activation: 'ads', holdKey: 'KeyH', switchWeaponKey: 'KeyV', target: 'head',
  fov: 15, smoothing: 90, maxDistance: 130,
  visibility: true, sticky: true, showRing: true,
  esp: false, espDistance: 120, espNames: true, dodge: false, dodgeRange: 45, smartCover:true, enemyAmmoAwareness:true,cameraTactics:true,reloadCover:true,peekLongDelay:true,adaptivePeek:true,
  mode: 'assist', prediction: false, predictionMs: 65, lagCompensatedAim:true, priority: 'crosshair', trigger: false, recoil: false,
  radar: false, radarRange: 90, tactical: false, autoPeek: false, autoReload: false, autoSwitch: false,
  autoArmor: false, autoSkills:true, autoThrowables:true, sidearmEmergencyRange:10,proMovement:true, autoSlide:true, autoCrouch:true, evasiveCrouch:true, fastAim:true, adaptiveADS:true, armorQuietSeconds:5, reloadQuietSeconds:3.5,autoLoot:true,lootRange:55,zombieSpacing:22,brAggression:80,brLeadSeconds:24, weaponTactics: true, teamCoordination:true, teamFlankExperiment:false, combatSightline:false, combatDodgeCommit:false, routeCommitment:true, occludedPursuitLab:false,peekCacheLab:false,macroRoutingLab:false,macroTargetLab:false,macroActuationLab:false,macroTargetCommitment:true, macroCombat2:false, macroVantageLab:false, macroTemporalLab:false, macroOwnershipLab:false, tacticalDirectorShadow:false, tacticalDirectorActive:false, tacticalDirectorConservative:false, tacticalDirectorOpportunityGuard:false, tacticalDirectorEngagementWindow:false, tacticalDirectorEngagementTrial:false, tacticalDirectorEngagementProbe:false, tacticalDirectorOpportunityExpansion:false,tacticalDirectorEngagementRecovery:false,tacticalDirectorShotProbeCoverage:false,tacticalDirectorMainWeaponStatsLab:false,tacticalDirectorBallisticLab:false,tacticalDirectorMotionLab:false,tacticalDirectorExplorationLab:false, macroOptionsShadow:false, macroOptionsActive:false, goalAwareShadow:false, goalAwareActive:false, macroCoverApproach:false, predictiveEvasion:false, combatCoverPressure:false, stanceMixup:false, sprintEvasion:false, preemptiveCover:false, exposureAwareStrafe:false, reverseHoldMs:380, grenadeAssist: false, recordMatches:false, multiTarget: false, engageRange: 16, pathfinding: false,
});
const PI = Math.PI;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const wrapAngle = (a) => ((a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;

export function normaliseOptions(input) {
  const o = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const enumOr = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
  const num = (v, fallback, lo, hi) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
  return {
    enabled: o.enabled === true,
    activation: enumOr(o.activation, ['ads', 'hold', 'always'], DEFAULTS.activation),
    holdKey: enumOr(o.holdKey, ['KeyH', 'KeyB', 'KeyJ', 'AltLeft', 'ShiftRight'], DEFAULTS.holdKey),
    switchWeaponKey: enumOr(o.switchWeaponKey, ['KeyV','KeyX','KeyY','KeyN','Backquote','None'], DEFAULTS.switchWeaponKey),
    target: enumOr(o.target, ['head', 'body'], DEFAULTS.target),
    fov: num(o.fov, DEFAULTS.fov, 1, 45),
    smoothing: num(o.smoothing, DEFAULTS.smoothing, 0, 500),
    maxDistance: num(o.maxDistance, DEFAULTS.maxDistance, 5, 420),
    visibility: o.visibility !== false,
    sticky: o.sticky !== false,
    showRing: o.showRing !== false,
    esp: o.esp === true,
    espNames: o.espNames !== false,
    espDistance: num(o.espDistance, DEFAULTS.espDistance, 10, 250),
    dodge: o.dodge === true,
    dodgeRange: num(o.dodgeRange, DEFAULTS.dodgeRange, 10, 85),
    smartCover:o.smartCover!==false,enemyAmmoAwareness:o.enemyAmmoAwareness!==false,cameraTactics:o.cameraTactics!==false,reloadCover:o.reloadCover!==false,peekLongDelay:o.peekLongDelay!==false,adaptivePeek:o.adaptivePeek!==false,
    mode: enumOr(o.mode, ['assist','autopilot'], DEFAULTS.mode),
    prediction: o.prediction === true, predictionMs: num(o.predictionMs,DEFAULTS.predictionMs,0,180), lagCompensatedAim:o.lagCompensatedAim !== false,
    priority: enumOr(o.priority,['crosshair','threat','low-health','nearest'],DEFAULTS.priority),
    trigger: o.trigger === true, recoil: o.recoil === true, radar: o.radar === true,
    radarRange: num(o.radarRange,DEFAULTS.radarRange,20,250), tactical: o.tactical === true,
    autoPeek: o.autoPeek === true, autoReload: o.autoReload === true, autoSwitch: o.autoSwitch === true,
    autoArmor: o.autoArmor === true,autoSkills:o.autoSkills!==false,autoThrowables:o.autoThrowables!==false,sidearmEmergencyRange:num(o.sidearmEmergencyRange,10,5,15),proMovement:o.proMovement !== false, autoSlide:o.autoSlide !== false, autoCrouch:o.autoCrouch !== false, evasiveCrouch:o.evasiveCrouch !== false, fastAim:o.fastAim !== false, adaptiveADS:o.adaptiveADS!==false, armorQuietSeconds:num(o.armorQuietSeconds,5,4,15), reloadQuietSeconds:num(o.reloadQuietSeconds,3.5,1,12), autoLoot:o.autoLoot!==false,lootRange:num(o.lootRange,55,12,100),zombieSpacing:num(o.zombieSpacing,22,12,34),brAggression:num(o.brAggression,80,0,100),brLeadSeconds:num(o.brLeadSeconds,24,10,42), weaponTactics: o.weaponTactics !== false, teamCoordination:o.teamCoordination!==false,teamFlankExperiment:o.teamFlankExperiment===true, combatSightline:o.combatSightline===true,combatDodgeCommit:o.combatDodgeCommit===true, routeCommitment:o.routeCommitment!==false, occludedPursuitLab:o.occludedPursuitLab===true, peekCacheLab:o.peekCacheLab===true, macroRoutingLab:o.macroRoutingLab===true, macroTargetLab:o.macroTargetLab===true, macroActuationLab:o.macroActuationLab===true, macroTargetCommitment:o.macroTargetCommitment!==false, macroCombat2:o.macroCombat2===true, macroVantageLab:o.macroVantageLab===true, macroTemporalLab:o.macroTemporalLab===true, macroOwnershipLab:o.macroOwnershipLab===true, tacticalDirectorShadow:o.tacticalDirectorShadow===true, tacticalDirectorActive:o.tacticalDirectorActive===true, tacticalDirectorConservative:o.tacticalDirectorConservative===true, tacticalDirectorOpportunityGuard:o.tacticalDirectorOpportunityGuard===true, tacticalDirectorEngagementWindow:o.tacticalDirectorEngagementWindow===true, tacticalDirectorEngagementTrial:o.tacticalDirectorEngagementTrial===true, tacticalDirectorEngagementProbe:o.tacticalDirectorEngagementProbe===true,tacticalDirectorOpportunityExpansion:o.tacticalDirectorOpportunityExpansion===true,tacticalDirectorEngagementRecovery:o.tacticalDirectorEngagementRecovery===true,tacticalDirectorShotProbeCoverage:o.tacticalDirectorShotProbeCoverage===true,tacticalDirectorMainWeaponStatsLab:o.tacticalDirectorMainWeaponStatsLab===true,tacticalDirectorBallisticLab:o.tacticalDirectorBallisticLab===true,tacticalDirectorMotionLab:o.tacticalDirectorMotionLab===true,tacticalDirectorExplorationLab:o.tacticalDirectorExplorationLab===true, macroOptionsShadow:o.macroOptionsShadow===true, macroOptionsActive:o.macroOptionsActive===true, goalAwareShadow:o.goalAwareShadow===true, goalAwareActive:o.goalAwareActive===true, macroCoverApproach:o.macroCoverApproach===true, predictiveEvasion:o.predictiveEvasion===true, combatCoverPressure:o.combatCoverPressure===true, stanceMixup:o.stanceMixup===true, sprintEvasion:o.sprintEvasion===true, preemptiveCover:o.preemptiveCover===true, exposureAwareStrafe:o.exposureAwareStrafe===true, reverseHoldMs:num(o.reverseHoldMs,380,250,1100), grenadeAssist: o.grenadeAssist === true, recordMatches:o.recordMatches===true, multiTarget: o.multiTarget === true,
    engageRange: num(o.engageRange,DEFAULTS.engageRange,6,40), pathfinding: o.pathfinding === true,
  };
}

// The 2026-10-09 game snapshot uses numeric team indexes 0..3.
// LocalPlayer.team is a string, while the authoritative snapshot has you.tm.
// Prefer the authoritative snapshot to keep BR squadmates and Classic allies safe.
export function ownTeamIndex(game) {
  const live = game?.you?.tm;
  if (Number.isInteger(live) && live >= 0 && live <= 3) return live;
  const local = game?.local?.team;
  if (Number.isInteger(local) && local >= 0 && local <= 3) return local;
  return ({red:0, blue:1, green:2, gold:3})[local] ?? null;
}

// Scorestreak cameras and BR helicopter insertion override the ordinary player camera.
// Input modifications in these states can disrupt camera control and streak action keys.
export function avatarControllable(game) {
  const L = game?.local;
  return !!(game?.running && game.phase === 'match' && L?.alive && !L.down &&
    !L.inView && !game.you?.ss?.view && !L.mv?.heli && !L.mv?.air &&
    !L.frozen && game.input?.locked && game.input?.enabled);
}

// The server stores and rewinds lean as part of each authoritative pose.
// Head sphere is offset by 100% of lean; body AABB by 50% (server/combat.js).
// The latest remotely rendered lean can lag an abrupt Q/E transition, so retain
// a small, bounded two-snapshot estimate instead of trusting model rotation.
const leanObservations = new WeakMap();
const boundedLean = n => Number.isFinite(n) ? clamp(n,-1,1) : 0;
export function observeLeanSnapshot(game, snapshot) {
  if (!game || !snapshot || !Array.isArray(snapshot.pl)) return;
  const tick=Number(snapshot.t);
  if (!Number.isFinite(tick)) return;
  let state=leanObservations.get(game);
  if(!state){state=new Map();leanObservations.set(game,state);}
  const seen=new Set();
  for(const p of snapshot.pl){
    if(!p || p.id==null || !Number.isFinite(p.ln))continue;
    const id=String(p.id),l=boundedLean(p.ln),prev=state.get(id);
    seen.add(id);
    if(prev && tick>prev.time && tick-prev.time<.5){
      state.set(id,{lean:l,time:tick,priorLean:prev.lean,priorTime:prev.time});
    }else state.set(id,{lean:l,time:tick,priorLean:l,priorTime:tick});
  }
  for(const id of state.keys())if(!seen.has(id))state.delete(id);
}
export function leanRate(game, remote){
  const obs=leanObservations.get(game)?.get(String(remote?.id));
  const dt=obs ? obs.time-obs.priorTime : 0;
  return dt>.008 && dt<.3 ? clamp((obs.lean-obs.priorLean)/dt,-7,7) : 0;
}
export function estimateRemoteLean(game, remote, seconds=0.025){
  // A network snapshot includes ln; the remote object may not have updated its
  // interpolated pose yet. Prefer the authoritative newest observed value.
  const obs=leanObservations.get(game)?.get(String(remote?.id));
  const value=obs?.lean ?? boundedLean(remote?.data?.ln ?? remote?.lean);
  if(!obs)return boundedLean(value);
  const dt=obs.time-obs.priorTime;
  if(!(dt>.008 && dt<.3))return boundedLean(value);
  const rate=clamp((obs.lean-obs.priorLean)/dt,-7,7);
  // Limit extrapolation: snapshot time represents a historical pose and Q/E
  // can reverse immediately; never project a full sprint of lean motion.
  const horizon=clamp(Number.isFinite(seconds)?seconds:0,0,.055);
  return boundedLean(value+rate*horizon);
}
export function getAimPoint(r, target, player, leanOverride = null, leanOffset = .35) {
  if (!r?.pos || !player)return null;
  const stance=r.sliding ? 0 : Math.max(0,Math.min(2,r.stance|0));
  const head=target==='head';
  const height=head
    ? (r.sliding ? player.slideHeadY : player.headYs[stance])
    : (r.sliding ? player.slideBodyHeight*.53 : player.bodyH[stance]*.52);
  if(!Number.isFinite(height))return null;
  const lean=boundedLean(leanOverride ?? r.data?.ln ?? r.lean),
    offset=lean*leanOffset*(head?1:.5),yaw=Number.isFinite(r.yaw)?r.yaw:0;
  return {x:r.pos.x+Math.cos(yaw)*offset,y:r.pos.y+height,
    z:r.pos.z-Math.sin(yaw)*offset};
}

// Server-authoritative collision test: head is a sphere, body is an AABB.
// Aiming at the centre is not sufficient when a wall clips the far half of a
// head. Decide visibility against the *first hit surface*, not the centre.
export function candidateHitDistance(kind, eye, unit, remote, player, lean, offset, helpers){
  if(typeof helpers?.raySphere!=='function' || typeof helpers?.rayAABB!=='function')return null;
  const yaw=Number.isFinite(remote.yaw)?remote.yaw:0;
  const shift=boundedLean(lean)*offset;
  const sx=Math.cos(yaw)*shift,sz=-Math.sin(yaw)*shift;
  const stance=remote.sliding?0:Math.max(0,Math.min(2,remote.stance|0));
  if(kind==='head'){
    const h=remote.sliding?player.slideHeadY:player.headYs[stance];
    return helpers.raySphere(eye,unit,remote.pos.x+sx,remote.pos.y+h,remote.pos.z+sz,
      player.headRadius??.24,Infinity);
  }
  const h=remote.sliding?player.slideBodyHeight:player.bodyH[stance],
    hw=stance===2?.55:(player.bodyHalf??.36);
  return helpers.rayAABB(eye,unit,
    remote.pos.x+sx*.5-hw,remote.pos.y,remote.pos.z+sz*.5-hw,
    remote.pos.x+sx*.5+hw,remote.pos.y+h,remote.pos.z+sz*.5+hw,Infinity);
}

// A nearby zombie that can melee within the next second must beat a distant
// zombie, even when the latter sits close to the crosshair.  Penalize angle
// softly; FOV/LOS are still checked independently by findTarget.
export function zombieTargetPriority(distance, angle, closingSpeed=0) {
  if(!Number.isFinite(distance) || distance<0)return Infinity;
  const speed=Math.max(0,Math.min(7.25,Number.isFinite(closingSpeed)?closingSpeed:0));
  const contactSeconds=Math.max(0,(distance-1.45)/Math.max(1.0,speed));
  const emergency=distance<6 ? 3.6 : distance<11 ? 1.65 : distance<18 ? .50 : 0;
  const imminent=contactSeconds<1.0 ? 1.25*(1.0-contactSeconds) : 0;
  return distance*.046+angle*.13-emergency-imminent;
}

// Returns an aim proposal; never changes the game or performs a network request.
export function findTarget(game, options, helpers, previousId = null) {
  if (!game?.running || !game?.local?.alive || !game?.modeState || !game?.rig || !game?.map?.boxes) return null;
  const mode = game.modeState.type;
  if (!['tdm', 'snd', 'hp', 'br', 'zm'].includes(mode)) return null;
  // TDM hitscan is evaluated against the pose rewound by the server to the
  // input timestamp. A further fixed lead caused systematic over-leading.
  // Keep the existing configurable lead elsewhere until validated per mode.
  const leadMs=mode==='tdm' && options.mode==='autopilot' && options.lagCompensatedAim!==false
    ? 0 : options.predictionMs;
  const yaw = game.rig.yaw, pitch = game.rig.pitch;
  const eyeShift = (game.local.mv?.lean || 0) * (helpers.leanOffset || 0.35);
  const eye = [
    game.pos.x + Math.cos(yaw) * eyeShift,
    game.pos.y + helpers.eyeHeightOf(game.local.mv),
    game.pos.z - Math.sin(yaw) * eyeShift,
  ];
  const forward = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const team = ownTeamIndex(game);
  const sources = [];
  if (mode === 'zm') sources.push(['z', game.zremotes?.list || []]);
  else {
    sources.push(['p', game.remotes?.list || []]);
    sources.push(['b', game.bremotes?.list || []]);
  }
  let best = null;
  for (const [kind, remotes] of sources) for (const r of remotes) {
    if (!r?.alive || r.invisible || !r.pos || r.id === game.net?.id) continue;
    if (kind === 'b' && r.data?.owner === game.net?.id) continue;
    if (mode !== 'zm' && (team === null || r.team === team)) continue;
    const airborne=mode==='br' && !!r.data?.air;
    // Rendered remote positions are intentionally interpolated behind the
    // server's snapshots. For falling targets use the newest valid snapshot;
    // otherwise a 34 m/s dive produces metres of vertical lag.
    const last=r.buf?.at(-1);
    const observed=airborne && last && [last.x,last.y,last.z].every(Number.isFinite) &&
      Math.hypot(last.x-r.pos.x,last.y-r.pos.y,last.z-r.pos.z)<12
      ? {...r,pos:{x:last.x,y:last.y,z:last.z}} : r;
    const predictedLean=estimateRemoteLean(game,r,
      options.prediction ? Math.min(.05,leadMs/1000) : .025);
    const offset=helpers.leanOffset??.35;
    // During a very rapid Q/E reversal, the wide torso is a more reliable
    // hit than a tiny head whose future sideways position is uncertain.
    const fastLean=Math.abs(leanRate(game,r))>=4.5 && kind==='p';
    // A falling player presents a much safer torso target than a tiny head,
    // especially during vertical dive/slow transitions.
    const choices=airborne || fastLean ? ['body','head'] :
      options.target==='head'?['head','body']:['body','head'];
    let selected=null;
    for(const hitRegion of choices){
      const original=getAimPoint(observed,hitRegion,helpers.player,predictedLean,offset);
      const lead=airborne && options.mode==='autopilot' ? Math.max(.04,leadMs/1000) : leadMs/1000;
      const point=(options.prediction || airborne && options.mode==='autopilot')
        ? predictedPoint(original,r,lead) : original;
      if(!point)continue;
      const dx=point.x-eye[0],dy=point.y-eye[1],dz=point.z-eye[2];
      const distance=Math.hypot(dx,dy,dz);
      if(!(distance>.001) || distance>options.maxDistance)continue;
      const unit=[dx/distance,dy/distance,dz/distance];
      const dot=clamp(unit[0]*forward[0]+unit[1]*forward[1]+unit[2]*forward[2],-1,1);
      const angle=Math.acos(dot);
      if(angle>options.fov*PI/180)continue;
      let hitboxVisible=false;
      if(options.visibility){
        // With prediction enabled, remote motion is only an estimate. Use the
        // centre LOS fallback when the precise geometry is no longer centred
        // on the extrapolated target; don't invent a shoot-through-wall ray.
        const entry=options.prediction || airborne && options.mode==='autopilot' ? null : candidateHitDistance(
          hitRegion,eye,unit,observed,helpers.player,predictedLean,offset,helpers);
        if(entry!==null){
          if(!Number.isFinite(entry))continue;
          const hitWall=helpers.rayWorld(eye,unit,game.map.boxes,Math.min(distance,entry+.05));
          if(hitWall<entry-.025)continue;
          hitboxVisible=true;
        }else{
          const limit=distance-.06;
          if(limit>0 && helpers.rayWorld(eye,unit,game.map.boxes,limit)<limit-1e-5)continue;
        }
      }
      selected={point,distance,angle,dx,dy,dz,hitRegion,hitboxVisible};
      break;
    }
    if(!selected)continue;
    const {point,distance,angle,dx,dy,dz,hitRegion,hitboxVisible}=selected;
    const id = `${kind}:${r.id}`;
    let score = angle + distance * 0.00018;
    if(mode==='zm'){
      const velocity=r?.buf && r.buf.length>=2 ? (()=>{
        const a=r.buf[r.buf.length-2],b=r.buf[r.buf.length-1];
        const dt=b?.t-a?.t;
        if(!(dt>.008&&dt<.8))return 0;
        const vx=(b.x-a.x)/dt,vz=(b.z-a.z)/dt;
        const toward=(eye[0]-r.pos.x)*vx+(eye[2]-r.pos.z)*vz;
        return Math.max(0,toward/Math.max(1,distance));
      })() : 0;
      score=zombieTargetPriority(distance,angle,velocity);
    }
    if(mode!=='zm' && options.priority === 'threat') score -= targetThreat(r,distance)*.32;
    else if(mode!=='zm' && options.priority === 'low-health' && Number.isFinite(r.data?.hp)) score -= Math.max(0,100-r.data.hp)*.001;
    else if(mode!=='zm' && options.priority === 'nearest') score = distance*.003 + angle*.06;
    if(options.sticky && previousId===id)score-= options.multiTarget ? .005 : .024;
    if (!best || score < best.score) {
      best = { id, point, remote:r, distance, angle, score, hitRegion,hitboxVisible,
        yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    }
  }
  return best;
}

// Visibility-first selection for 60 Hz combat decisions. Occluded opponents
// are still available as a navigation goal, but cannot steal a shootable target.
export function acquireCombatTarget(game, settings, helpers, previousId=null){
  // The generic 130 m UI acquisition cap was shorter than sniper engagement
  // distance. The autopilot scans farther for long-range weapons, without
  // extending the range for SMGs, shotguns or human-assisted aiming.
  const w=game?.local?.weapon;
  const precision=w?.sniper || w?.cat==='Sniper' || w?.cat==='Marksman';
  const extra=w?.sniper || w?.cat==='Sniper' ? 400 : w?.cat==='Marksman'?300 : Math.min(200,w?.maxRange||200);
  const q={...settings, fov:180, visibility:true,
    maxDistance:settings.mode==='autopilot' ? Math.min(420,Math.max(settings.maxDistance||130,extra)) : settings.maxDistance,
    priority:settings.priority==='crosshair'?'threat':settings.priority};
  const visible=findTarget(game,q,helpers,previousId);
  if(visible)return {...visible,visible:true};
  const hidden=findTarget(game,{...q,visibility:false},helpers,previousId);
  return hidden ? {...hidden,visible:false} : null;
}

// Exponential damping gives the same behaviour across 30/60/144 Hz monitors.
export function aimStep(yaw, pitch, target, dt, smoothing, pitchMax) {
  const deltaT = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const k = smoothing <= 0 ? 1 : 1 - Math.exp(-1000 * deltaT / smoothing);
  return {
    yaw: wrapAngle(yaw + wrapAngle(target.yaw - yaw) * k),
    pitch: clamp(pitch + (target.pitch - pitch) * k, -pitchMax, pitchMax),
  };
}

// Read-only opponent collection shared by ESP and threat prediction.
export function opponents(game) {
  const mode = game?.modeState?.type;
  if (!['tdm', 'snd', 'hp', 'br', 'zm'].includes(mode)) return [];
  const self = game.net?.id, ownTeam = ownTeamIndex(game);
  const sources = mode === 'zm' ? [['z', game.zremotes?.list || []]] : [['p', game.remotes?.list || []], ['b', game.bremotes?.list || []]];
  const result = [];
  for (const [kind, list] of sources) for (const remote of list) {
    if (!remote?.alive || !remote.pos || remote.id === self) continue;
    if (kind === 'b' && remote.data?.owner === self) continue;
    if (mode !== 'zm' && (ownTeam === null || remote.team === ownTeam)) continue;
    result.push({kind, remote, id: `${kind}:${remote.id}`});
  }
  return result;
}

// Projects a world coordinate using Three's camera matrices, no raycast/depth test.
// This is deliberately independent of camera.fieldOfView, zoom and camera roll.
export function projectToScreen(point, camera, width, height) {
  const m = camera?.matrixWorldInverse?.elements, p = camera?.projectionMatrix?.elements;
  if (!m || !p || !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(point?.z)) return null;
  const x = point.x, y = point.y, z = point.z;
  const vx = m[0]*x + m[4]*y + m[8]*z + m[12];
  const vy = m[1]*x + m[5]*y + m[9]*z + m[13];
  const vz = m[2]*x + m[6]*y + m[10]*z + m[14];
  const vw = m[3]*x + m[7]*y + m[11]*z + m[15];
  const w = p[3]*vx + p[7]*vy + p[11]*vz + p[15]*vw;
  if (!(w > 0.01) || !Number.isFinite(w)) return null;
  const nx = (p[0]*vx + p[4]*vy + p[8]*vz + p[12]*vw) / w;
  const ny = (p[1]*vx + p[5]*vy + p[9]*vz + p[13]*vw) / w;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return { x: (nx + 1)*width/2, y: (1 - ny)*height/2, inside: Math.abs(nx) <= 1.2 && Math.abs(ny) <= 1.2 };
}

// Predict threats, then return one movement recommendation (or null).
// Bullets in FPS Arena are hitscan; enemy sight-lines are anticipatory, not projectile interception.
// Projectile samples are provided by snapshots and must be recent to avoid stale predictions.
export function predictDodge(game, samples, helpers, settings, previousDirection = null, now = 0) {
  if (!game?.running || game.phase !== 'match' || !game.local?.alive || !game.input?.locked || !game.input?.enabled || !game.map?.boxes) return null;
  const px = game.local.mv.x, pz = game.local.mv.z, py = game.local.mv.y + helpers.eyeHeightOf(game.local.mv);
  if (![px,pz,py].every(Number.isFinite)) return null;
  const origins = [];
  for (const {remote:r} of opponents(game)) {
    if (r.invisible || !r.data?.aim || !Number.isFinite(r.data.pitch)) continue;
    const ex = r.pos.x, ez = r.pos.z, ey = r.pos.y + (helpers.player.headY || 1.6);
    const dx = px - ex, dy = py - ey, dz = pz - ez, distance = Math.hypot(dx,dy,dz);
    if (distance < 1 || distance > settings.dodgeRange) continue;
    const yaw = r.yaw || 0, pitch = r.data.pitch;
    const dir = [-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch)];
    const along = dx*dir[0] + dy*dir[1] + dz*dir[2];
    if (along <= 0 || along >= settings.dodgeRange) continue;
    const miss = Math.hypot(dx - dir[0]*along, dy-dir[1]*along, dz-dir[2]*along);
    if (miss > 1.35) continue;
    if (helpers.rayWorld([ex,ey,ez],dir,game.map.boxes,along) < along - .15) continue;
    // Push across enemy's fire line, not backwards along it.
    let sx = dir[2], sz = -dir[0];
    const sign = previousDirection && (sx*previousDirection.x + sz*previousDirection.z) < 0 ? -1 : 1;
    sx *= sign; sz *= sign;
    origins.push({x:sx,z:sz,weight:Math.max(.1, (1.35-miss)*(.6 + 14/distance))});
  }
  for (const s of samples || []) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z) || now - s.time > .5) continue;
    if (s.kind !== 'frag' && s.kind !== 'impact' && s.kind !== 'cryo' && s.kind !== 'flash' && s.kind !== 'gas' && s.kind !== 'discharger') continue;
    const dx = px - s.x, dz = pz - s.z, d = Math.hypot(dx,dz);
    const dangerR = s.kind === 'frag' ? 9.5 : s.kind === 'impact' ? 6.2 : 4.5;
    let impactSoon = !!s.stuck && s.fuse >= 0 && s.fuse < 1.65;
    if (!s.stuck && Number.isFinite(s.vx) && Number.isFinite(s.vz) && Math.hypot(s.vx,s.vz) > 2) {
      const v2 = s.vx*s.vx + s.vz*s.vz;
      const time = Math.max(0, Math.min(1.2, (dx*s.vx + dz*s.vz)/v2));
      const miss = Math.hypot(s.x + s.vx*time - px,s.z + s.vz*time - pz);
      impactSoon ||= time > 0 && miss < dangerR;
    }
    if (!impactSoon || d > dangerR + 1.5) continue;
    const norm = Math.max(.2,d);
    origins.push({x:dx/norm, z:dz/norm,weight:1 + Math.max(0,dangerR - d)*.8});
  }
  if (!origins.length) return null;
  // Two opposing sight-lines can cancel exactly. Fall back to the strongest
  // threat instead of freezing and waiting to be hit.
  let x = origins.reduce((n,t)=>n+t.x*t.weight,0);
  let z = origins.reduce((n,t)=>n+t.z*t.weight,0);
  let len=Math.hypot(x,z);
  if(len<.01){const strongest=origins.reduce((a,b)=>a.weight>b.weight?a:b);x=strongest.x;z=strongest.z;len=Math.hypot(x,z);}
  if(len<.01)return null;
  const vx=x/len,vz=z/len;
  const candidates=[];
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,ca=Math.cos(a),sa=Math.sin(a);
    candidates.push({x:vx*ca-vz*sa,z:vx*sa+vz*ca});
  }
  if(previousDirection && Math.hypot(previousDirection.x,previousDirection.z)>.1)
    candidates.push(previousDirection);
  const bound=game.map.bound||68;
  let choice=null,best=-Infinity;
  for(const c of candidates){
    const d=Math.hypot(c.x,c.z);
    if(d<.01)continue;
    const dx=c.x/d,dz=c.z/d;
    const reach=2.6,ex=px+dx*reach,ez=pz+dz*reach;
    if(Math.abs(ex)>=bound-.9||Math.abs(ez)>=bound-.9)continue;
    // Test head/hip and body radius over the movement corridor; a single
    // center-ray check let the previous evasive AI steer into wall corners.
    let clear=true;
    for(const height of [.6,1.25]){
      for(const offset of [-.36,0,.36]){
        const origin=[px-dz*offset,game.local.mv.y+height,pz+dx*offset];
        if(helpers.rayWorld(origin,[dx,0,dz],game.map.boxes,reach+.15)<reach+.05){clear=false;break;}
      }
      if(!clear)break;
    }
    if(!clear)continue;
    const dot=dx*vx+dz*vz;
    const continuity=previousDirection ?
      .23*(dx*previousDirection.x+dz*previousDirection.z) : 0;
    let crowd=0;
    if(game.modeState?.type==='zm')for(const zr of game.zremotes?.list||[]){
      if(!zr?.alive||!zr.pos)continue;
      const gap=Math.hypot(ex-zr.pos.x,ez-zr.pos.z);
      if(gap<11)crowd+=(11-gap)*.22;
    }
    const score=dot*1.5+continuity-crowd;
    if(score>best){best=score;choice={x:dx,z:dz};}
  }
  return choice;
}

export function dodgeMovement(direction, yaw, sampled) {
  if (!direction) return sampled;
  const fw = -Math.sin(yaw)*direction.x - Math.cos(yaw)*direction.z;
  const rt = Math.cos(yaw)*direction.x - Math.sin(yaw)*direction.z;
  // Preserve firing, aiming, abilities and all non-movement actions.
  return {...sampled,forward:fw>.24,backward:fw<-.24,right:rt>.24,left:rt<-.24};
}
