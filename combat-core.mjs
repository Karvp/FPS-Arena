import {gunDuelPlan} from './weapon-duel.mjs';
import {decideAutopilotAds} from './ads-tactics.mjs';
import {opponents} from './aim-core.mjs';
import {zombieKite} from './loot-core.mjs';
import {weaponProfile,targetDistance,weaponCanEngage} from './weapon-tactics.mjs';
import {preferredZombieSlot} from './zombie-weapon-choice.mjs';
// Pure tactical routines for the FPS Arena client-side training/QA assistant.
// No network access and no mutation of game state in this file.
const minmax = (v, a, b) => Math.min(b, Math.max(a, v));

// Gliding enemies have 15 m/s free fall and can dive at 34 m/s.
// They are not yet ground-level threats when far above a loot corridor.
export function isAirborneOpponent(remote, reference, clearance=10) {
  return !!remote?.data?.air && Number.isFinite(remote?.pos?.y) &&
    Number.isFinite(reference?.y) && remote.pos.y-reference.y>clearance;
}
export function remoteVelocity(remote) {
  const b = remote?.buf;
  if (!Array.isArray(b) || b.length < 2) return {x:0,y:0,z:0};
  const a = b[b.length-2], c = b[b.length-1], dt = c?.t-a?.t;
  if (!(dt > .008 && dt < .8) || ![a.x,a.y,a.z,c.x,c.y,c.z].every(Number.isFinite)) return {x:0,y:0,z:0};
  const vx = (c.x-a.x)/dt, vy=(c.y-a.y)/dt, vz=(c.z-a.z)/dt;
  // A glider can descend faster than a sprint and then slow abruptly. Reject
  // teleports separately in the vertical and horizontal axes, while keeping
  // exactly the existing 24 m/s guard for grounded opponents.
  const airborne=!!remote?.data?.air;
  if (airborne) {
    if(Math.hypot(vx,vz)>23 || Math.abs(vy)>42)return {x:0,y:0,z:0};
    return {x:vx,y:vy,z:vz};
  }
  if (Math.hypot(vx,vy,vz)>24) return {x:0,y:0,z:0};
  return {x:vx,y:vy,z:vz};
}
export function predictedPoint(point, remote, seconds) {
  if (!point) return null;
  const d = remoteVelocity(remote), t = minmax(Number.isFinite(seconds) ? seconds : 0,0,.18);
  return {x:point.x+d.x*t,y:point.y+d.y*t,z:point.z+d.z*t};
}
export function targetThreat(remote, distance) {
  const health = Number.isFinite(remote?.data?.hp) ? remote.data.hp : 100;
  return (remote?.data?.aim ? .45 : 0) + (remote?.data?.w === 'l115a3' ? .18 : 0) +
    minmax(1 - distance / 65,0,1)*.6 + minmax((100-health)/140,0,.65);
}
export function lineClear(game, point, helpers) {
  if (!game?.map?.boxes || !game?.pos || !point) return false;
  const mv=game.local?.mv, yaw=game.rig?.yaw || 0;
  const lean=(mv?.lean || 0)*(helpers.leanOffset || .35);
  const origin=[game.pos.x+Math.cos(yaw)*lean, game.pos.y+helpers.eyeHeightOf(mv),game.pos.z-Math.sin(yaw)*lean];
  const diff=[point.x-origin[0],point.y-origin[1],point.z-origin[2]];
  const d=Math.hypot(...diff);
  if (!(d>.1) || !Number.isFinite(d)) return false;
  return helpers.rayWorld(origin,diff.map(x=>x/d),game.map.boxes,d) >= d-.12;
}
export function sightError(yaw,pitch,target) {
  if (!target) return Infinity;
  const diffYaw = ((target.yaw-yaw+Math.PI)%(Math.PI*2)+2*Math.PI)%(2*Math.PI)-Math.PI;
  return Math.hypot(diffYaw*Math.cos(pitch),target.pitch-pitch);
}
export function shouldTrigger(game, target, helpers, toleranceDeg = .65) {
  if (!game?.running || game.phase!=='match' || !game?.local?.alive || !game.input?.locked || !target) return false;
  const ws=game.local.ws, gun=ws?.guns?.[ws.slot];
  if (!ws || !gun || (ws.reloading && !(game.local.weapon?.shellReload>0 && gun.mag>0 && targetDistance(game,target)<12)) || ws.plateT>0 || ws.switchT>0 || ws.wind>0 || (ws.cd||0)>1/60) return false;
  if (!game.local.weapon || game.local.weapon.unarmed || (!game.local.weapon.infinite && gun.mag<=0)) return false;
  // The head/body entry surface can be visible while the geometric centre is
  // behind the wall. findTarget verifies the authoritative hitbox first.
  if (!target.hitboxVisible && !lineClear(game,target.point,helpers)) return false;
  return sightError(game.rig.yaw,game.rig.pitch,target) <= minmax(toleranceDeg,.1,3)*Math.PI/180;
}
// In Zombies every living zombie may be visible for minutes. Visibility alone
// must not permanently prohibit the reload needed to survive a wave.
// Compute whether a moving reload can finish with a melee margin, using the
// actual active weapon's reload duration and the nearest living zombie.
export function zombieReloadOpportunity(game, weapon, {empty=false}={}) {
  if(game?.modeState?.type!=='zm')return {safe:false,nearest:Infinity};
  const mv=game?.local?.mv;
  if(!mv)return {safe:false,nearest:0};
  let nearest=Infinity;
  for(const z of game.zremotes?.list||[]){
    if(!z?.alive || !z.pos)continue;
    const d=Math.hypot(z.pos.x-mv.x,z.pos.z-mv.z);
    if(Number.isFinite(d))nearest=Math.min(nearest,d);
  }
  // Keep at least 1 second of emergency reaction, and budget up to 7.25 m/s
  // zombie approach. When moving away, the available window will be larger.
  const seconds=Number.isFinite(weapon?.reload) ? weapon.reload : 2.2;
  // Sprinting away can keep a zombie from closing the gap during a reload.
  // Use relative radial velocity, NOT only a stationary zombie speed.
  const moving=Math.hypot(mv.vx||0,mv.vz||0);
  let relativeClosing=7.25;
  if(nearest<Infinity && moving>.1){
    const close=(game.zremotes?.list||[]).filter(z=>z?.alive&&z.pos)
      .sort((a,b)=>Math.hypot(a.pos.x-mv.x,a.pos.z-mv.z)-Math.hypot(b.pos.x-mv.x,b.pos.z-mv.z))[0];
    if(close){
      const dx=mv.x-close.pos.x,dz=mv.z-close.pos.z,d=Math.max(.01,Math.hypot(dx,dz));
      const outward=((mv.vx||0)*dx+(mv.vz||0)*dz)/d;
      relativeClosing=Math.max(.4,7.25-outward);
    }
  }
  // If retreat is impossible, do not call this a safe reload window.
  const threshold=Math.max(empty?10.5:13,Math.min(42,relativeClosing*(seconds+.5)+6));
  return {safe:nearest>=threshold,nearest,threshold,relativeClosing};
}

// Travelling towards loot is not itself a reason to drop a valid shot. Only
// a *nearby interaction* should pause fire so F is processed deterministically.
export function arbitrateLootCombat(sampled, lootPlan, {autonomous=true,shootable=false}={}) {
  if(!autonomous || !lootPlan)return sampled;
  if(lootPlan.interact)return {...sampled,fire:false,aim:false,reload:false,plate:false};
  if(shootable)return sampled;
  return sampled;
}

// One arbitration function drives firearm cadence and ADS on the 60 Hz client tick.
// Weaponstate requires a new rising fire edge for every semi-auto shot.
export function autoFireInput(game, sampled, target, helpers, options, adsMemo=null, now=0) {
  const w=game?.local?.weapon, ws=game?.local?.ws, profile=weaponProfile(w,options);
  if(!w || !ws)return {...sampled,fire:false,aim:false};
  const d=targetDistance(game,target);
  // Tactical preferred range is not the server's hard hitscan range.
  // Permit accurate opportunistic shots a little beyond the damage-falloff
  // envelope, but never outside maxRange or with an occluded target.
  const extended=Number.isFinite(w.maxRange) && !w.melee && !w.unarmed &&
    d<=w.maxRange &&
    target?.visible===true && target.hitboxVisible===true;
  const aligned=(weaponCanEngage(game,target,profile)||extended) && shouldTrigger(game,target,helpers,
    w.sniper || profile.style==='marksman' ? .42 : profile.style==='rush' ? 1.7 : .85);
  const semiNeedsRelease=profile.semi && !!ws.prevFire && !(ws.burstLeft>0);
  // ADS is a tactical posture, not a requirement for shooting. The game
  // permits hip-fire: weigh spread, pellets and speed loss with hysteresis.
  const stance=decideAutopilotAds(w,d,sampled,target,
    {...options,airborne:game.local?.mv?.onGround===false},adsMemo,now);
  const visible=!!target && d <= (w.maxRange||profile.fire) &&
    (target.hitboxVisible===true || lineClear(game,target.point,helpers));
  const wantsAim=visible && stance.aim && !ws.reloading && !ws.plateT && !ws.switchT;
  // Snipers have extreme unaimed dispersion. Keep scope acquisition when
  // necessary, but allow a truly point-blank emergency hip shot.
  const scopedReady=!(w.sniper||profile.style==='sniper') || !wantsAim ||
    !Number.isFinite(game.ads?.e) || game.ads.e>=0.65;
  return {...sampled,fire:!!aligned && !semiNeedsRelease && scopedReady,
    aim:!!wantsAim};
}

export function safeDirection(game, x, z, helpers, distance=2) {
  const mv=game?.local?.mv;
  if (!mv || !game?.map?.boxes || ![x,z,mv.x,mv.y,mv.z].every(Number.isFinite)) return false;
  const d=Math.hypot(x,z); if (d<.001) return false;
  const ux=x/d, uz=z/d;
  const bound=game.map.bound || 68, nx=mv.x+ux*distance, nz=mv.z+uz*distance;
  if (Math.abs(nx)>=bound-.8 || Math.abs(nz)>=bound-.8) return false;
  for (const height of [.45,1.1]) {
    const origin=[mv.x,mv.y+height,mv.z], v=[ux,0,uz];
    for (const offset of [-.36,0,.36]) {
      const eye=[origin[0]-uz*offset,origin[1],origin[2]+ux*offset];
      if (helpers.rayWorld(eye,v,game.map.boxes,distance+.2)<distance+.12) return false;
    }
  }
  return true;
}
export function nearCover(game, target, helpers) {
  const mv=game?.local?.mv;
  if (!mv || !target?.point || !game?.map?.boxes) return null;
  let best=null;
  const ex=target.point.x,ez=target.point.z;
  for (const b of game.map.boxes) {
    // Tall static cover in local vicinity. Ground and overhead platforms are excluded.
    if (b.y1 < mv.y+1.25 || b.y0 > mv.y+.7) continue;
    const cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
    const d=Math.hypot(cx-mv.x,cz-mv.z);
    if (!(d>.8 && d<9)) continue;
    const tx=cx-ex,tz=cz-ez, len=Math.hypot(tx,tz);
    if(len<1)continue;
    const safeX=cx+(tx/len)*(Math.max(b.x1-b.x0,b.z1-b.z0)*.5+1.25);
    const safeZ=cz+(tz/len)*(Math.max(b.x1-b.x0,b.z1-b.z0)*.5+1.25);
    const sd=Math.hypot(safeX-mv.x,safeZ-mv.z);
    if (sd>12 || sd<.5 || !safeDirection(game,safeX-mv.x,safeZ-mv.z,helpers,Math.min(2,sd))) continue;
    // Prefer small cover moves when hp is low.
    const score=sd+Math.hypot(ex-safeX,ez-safeZ)*.015;
    if(!best || score<best.score)best={x:safeX,z:safeZ,score};
  }
  return best;
}
export function planMovement(game, target, helpers, settings, now=0) {
  if (!game?.running || game.phase !== 'match' || !game?.local?.alive || !target?.point) return null;
  const mv=game.local.mv, dx=target.point.x-mv.x, dz=target.point.z-mv.z, dist=Math.hypot(dx,dz);
  if (!(dist>.05)) return null;
  const toward={x:dx/dist,z:dz/dist}, side={x:-toward.z,z:toward.x};
  const profile=weaponProfile(settings?.strategicPrimaryWeapon || game.local.weapon,settings);
  const recovering=!!game.local.ws?.reloading || (!!game.local.ws?.guns?.[game.local.ws.slot] &&
    game.local.ws.guns[game.local.ws.slot].mag===0 && !game.local.weapon?.infinite);
  const cover = (settings.autoPeek || recovering) && nearCover(game,target,helpers);
  const low=game.local.hp<45 || (game.local.armor<10 && game.local.hp<65);
  const desiredDistance=profile.distance;
  // Reload and low HP take precedence over approaching an enemy.
  const candidates=[];
  if(recovering){
    if(cover)candidates.push({x:cover.x-mv.x,z:cover.z-mv.z,reason:'reload-cover'});
    candidates.push({x:-toward.x,z:-toward.z,reason:'reload-retreat'});
  }else{
    const peekPhase=(now%2.5)<.72;
    if(cover && (low || !peekPhase || profile.style==='suppress'))
      candidates.push({x:cover.x-mv.x,z:cover.z-mv.z,reason:'cover'});
    if(cover && peekPhase && !low && profile.style!=='suppress')
      candidates.push({x:side.x,z:side.z,reason:'peek'});
    if(dist>desiredDistance+(profile.style==='rush'?1.2:3))
      candidates.push({x:toward.x,z:toward.z,reason:profile.style==='rush'?'close-gap':'advance'});
    else if(dist<Math.max(profile.style==='melee'?1:5,desiredDistance*.65))
      candidates.push({x:-toward.x,z:-toward.z,reason:'retreat'});
    // LMG/sniper should hold their shooting lane instead of jittering sideways.
    if(profile.strafe){
      const sideSign=Math.floor(now/(profile.style==='flank'?1.7:2.8))%2?-1:1;
      candidates.push({x:side.x*sideSign,z:side.z*sideSign,reason:'strafe'});
      candidates.push({x:-side.x*sideSign,z:-side.z*sideSign,reason:'reverse-strafe'});
    }else if(dist<=desiredDistance*1.3 && dist>=desiredDistance*.75){
      return {x:0,z:0,reason:'hold-angle'};
    }
    candidates.push({x:-toward.x,z:-toward.z,reason:'fallback'});
  }
  for(const c of candidates) if(safeDirection(game,c.x,c.z,helpers,1.35))return c;
  return null;
}
// Tactics are grounded in this game's acceleration and sprint/slide implementation,
// not CS-style instant-stop assumptions. All timings are seconds.
export function planProMovement(game, target, helpers, settings, now=0, previous={}) {
  if(!game?.local?.mv || !target?.point || !game?.local?.alive) return null;
  const mv=game.local.mv, ws=game.local.ws || {}, profile=weaponProfile(settings?.strategicPrimaryWeapon || game.local.weapon,settings);
  const dx=target.point.x-mv.x,dz=target.point.z-mv.z,dist=Math.hypot(dx,dz);
  if(!(dist>.05))return null;
  const toward={x:dx/dist,z:dz/dist},side={x:-dz/dist,z:dx/dist};
  const eye=helpers?lineClear(game,target.point,helpers):false;
  const gun=ws.guns?.[ws.slot], recovering=ws.reloading||ws.plateT>0||(gun?.mag===0&&!game.local.weapon?.infinite);
  const low=game.local.hp<42||(game.local.hp<70&&game.local.armor<16);
  const risk=assessThreats(game,helpers,target);
  const cover=settings.autoPeek!==false?nearCover(game,target,helpers):null;
  const state=previous;
  // Aperiodic side choice and independent stance/exposure windows. A fixed
  // alternating A/D timer is simple to pre-aim, especially against snipers.
  const roll=()=>Math.random();
  if(state.targetId!==target.id || !Number.isFinite(state.changeAt) || now>=state.changeAt){
    state.targetId=target.id;
    state.sign=(roll()<.38 && (state.sign===1||state.sign===-1))?state.sign:
      (state.sign===1?-1:1);
    state.changeAt=now+.35+roll()*(profile.style==='sniper'?2.0:1.35);
    state.exposeUntil=now+.17+roll()*.55;
  }
  const sign=state.sign;
  const cadence=profile.style==='sniper'?2.5:profile.style==='marksman'?1.8:profile.style==='rush'?.9:1.15;
  const isScoped=['sniper','marksman'].includes(profile.style);
  const speed=Math.hypot(mv.vx||0,mv.vz||0);
  const out=(x,z,reason,extras={})=>({x,z,reason,...extras});
  const can=(x,z,reach=1.25)=>safeDirection(game,x,z,helpers,reach);
  // Zombie kiting has higher priority than the selected weapon's ideal engagement
  // distance: even snipers and shotguns must avoid a 7.25m/s melee swarm.
  if(game.modeState?.type==='zm') {
    const escape=zombieKite(game,helpers,settings,now);
    if(escape)return escape;
  }
  // Never attack while plating; get behind hard cover or break LOS instead.
  if(recovering||low){
    if(cover&&can(cover.x-mv.x,cover.z-mv.z))return out(cover.x-mv.x,cover.z-mv.z,'pro-disengage-cover',{crouch:!!ws.plateT});
    if(can(-toward.x,-toward.z))return out(-toward.x,-toward.z,'pro-break-contact');
    if(can(side.x*sign,side.z*sign))return out(side.x*sign,side.z*sign,'pro-emergency-sidestep');
    return out(0,0,'pro-hold-no-exit');
  }
  // Every named enemy firearm (not only its category) gets a distance/DPS
  // response. Cover routes retain their own geometric validation. The model
  // never suppresses shots that are already server-valid.
  const opponentGun=settings?.enemyWeapon;
  const duel=opponentGun ? gunDuelPlan(settings?.strategicPrimaryWeapon||game.local.weapon,
    opponentGun,dist,{ownArmor:game.local.armor||0,ownHealth:game.local.hp||100}) : null;
  if(duel && eye && (duel.action==='approach-covered'||duel.action==='cover')){
    if(cover&&can(cover.x-mv.x,cover.z-mv.z))
      return out(cover.x-mv.x,cover.z-mv.z,'duel-weapon-cover');
    // A distant rifle/sniper lane has no safe straight-line rush. Seek a
    // validated perpendicular corridor until navigation finds hard cover.
    if(duel.danger && dist>32 && duel.action==='approach-covered'){
      if(can(side.x*sign+toward.x*.36,side.z*sign+toward.z*.36))
        return out(side.x*sign+toward.x*.36,side.z*sign+toward.z*.36,'duel-lateral-approach');
      if(can(-side.x*sign+toward.x*.36,-side.z*sign+toward.z*.36))
        return out(-side.x*sign+toward.x*.36,-side.z*sign+toward.z*.36,'duel-lateral-approach');
    }
  }
  if(duel && eye && duel.action==='extend' && dist<duel.desiredDistance-12 &&
     !duel.outranged && opponentGun.cat!=='Shotgun' &&
     (opponentGun.maxRange||200)<(game.local.weapon?.maxRange||200)*.7){
    if(can(-toward.x,-toward.z))return out(-toward.x,-toward.z,'duel-retreat-range');
  }
  // Opponent category counterplay. Only act on the actual published gun ID;
  // absence of this information falls back to ordinary spacing.
  const counterCat=settings?.enemyWeapon?.cat;
  if(counterCat==='Shotgun' && dist<20 && profile.style!=='rush'){
    for(const v of [{x:-toward.x+side.x*.55,z:-toward.z+side.z*.55},
      {x:-toward.x-side.x*.55,z:-toward.z-side.z*.55},
      {x:-toward.x,z:-toward.z}])if(can(v.x,v.z))return out(v.x,v.z,'counter-shotgun-range');
  }
  if(counterCat==='Sniper' && dist>25 && eye && profile.style!=='sniper'){
    if(cover && can(cover.x-mv.x,cover.z-mv.z))
      return out(cover.x-mv.x,cover.z-mv.z,'counter-sniper-cover');
    for(const v of [{x:side.x*sign,z:side.z*sign},{x:-side.x*sign,z:-side.z*sign}])
      if(can(v.x,v.z))return out(v.x,v.z,'counter-sniper-lateral');
  }
  if(counterCat==='LMG' && eye && dist>15 && cover && can(cover.x-mv.x,cover.z-mv.z))
    return out(cover.x-mv.x,cover.z-mv.z,'counter-lmg-cover');
  // Do not brake into a shotgun's preferred range. A precision rifle already
  // inside its spacing floor must backpedal first, even while moving.
  if(isScoped && dist<profile.distance*.88){
    for(const v of [{x:-toward.x,z:-toward.z},
      {x:-toward.x+side.x*.65,z:-toward.z+side.z*.65},
      {x:-toward.x-side.x*.65,z:-toward.z-side.z*.65}])
      if(can(v.x,v.z))return out(v.x,v.z,'pro-spacing');
  }
  // Precision weapons benefit from pre-aim and firing once stationary. This game's
  // spread penalizes airborne fire, but it does NOT implement CS2's moving-spread penalty.
  if(isScoped && eye && dist<profile.fire && speed>2.1 && mv.onGround!==false){
    // FPS Arena does not penalize grounded lateral velocity with extra spread.
    // Braking can be useful to hold a lane, but never withhold a valid shot.
    if(can(-(mv.vx||0),-(mv.vz||0),.55))return out(-(mv.vx||0),-(mv.vz||0),'pro-brake');
  }
  if(isScoped && eye && dist>profile.fire+2 && can(toward.x,toward.z)) {
    return out(toward.x,toward.z,'pro-long-range-close',{sprint:false});
  }
  // If a sniper already has enough range, circle for sightlines rather than
  // blindly pushing to the other side of occluding geometry.
  if(isScoped && dist<=profile.fire && !eye){
    if(can(side.x*sign,side.z*sign))return out(side.x*sign,side.z*sign,'pro-precision-flank');
    if(can(-side.x*sign,-side.z*sign))return out(-side.x*sign,-side.z*sign,'pro-precision-flank');
    return out(0,0,'pro-hold-no-lane');
  }
  // Shotgun/SMG close gap out of LOS, but never blindly sprint into visible crossfire.
  const tooFar=dist>profile.distance+(profile.style==='rush'?1.4:4);
  if(tooFar && (!eye || (profile.style==='rush' && dist>profile.distance+6))){
    if(risk.visible>0 && risk.close>0 && cover && can(cover.x-mv.x,cover.z-mv.z))
      return out(cover.x-mv.x,cover.z-mv.z,'pro-stage-cover');
    if(can(toward.x,toward.z)) {
      const sprint=mv.onGround && !eye && dist>profile.distance+12 && mv.slideCd<=0 && mv.stance===0;
      return out(toward.x,toward.z,'pro-rotate',{sprint:!!sprint,slide:!!sprint&&!!mv.sprint&&mv.slideT<=0&&!mv.slidePrev});
    }
  }
  // Precision rifles must not rush within SMG range. Holding scope range is more
  // valuable than strafing at 12-25m; retreat when possible, even if LOS is lost.
  const minimumSpacing=isScoped ? profile.distance*.88 : Math.max(4,profile.distance*.55);
  if(dist<minimumSpacing && profile.style!=='rush'){
    const retreat=[{x:-toward.x,z:-toward.z},{x:-toward.x+side.x*.6,z:-toward.z+side.z*.6},
      {x:-toward.x-side.x*.6,z:-toward.z-side.z*.6}];
    for(const r of retreat)if(can(r.x,r.z))return out(r.x,r.z,'pro-spacing');
  }
  // Peek from side of cover, return behind it after each brief exposure.
  if(cover && (low || risk.close>1 || profile.style==='suppress' || isScoped)) {
    const exposing=now<(state.exposeUntil||0);
    if(!exposing && can(cover.x-mv.x,cover.z-mv.z))
      return out(cover.x-mv.x,cover.z-mv.z,'pro-reset-cover',{crouch:true});
    if(exposing && can(side.x*sign,side.z*sign,.7))
      return out(side.x*sign,side.z*sign,'pro-angle-peek',{lean:sign,peek:true});
  }
  // LMG holds the firing lane; snipers keep scoped when aimed and stable.
  if((profile.style==='suppress'||isScoped)&&eye&&Math.abs(dist-profile.distance)<profile.distance*.48)
    return out(0,0,'pro-hold-sightline',{crouch:profile.style==='suppress'});
  // Periodically change side and duration. No per-frame A/D oscillation.
  const lateral=sign, push=dist>profile.distance+2?.20:dist<profile.distance-2?-.30:0;
  const x=side.x*lateral+toward.x*push,z=side.z*lateral+toward.z*push;
  if(can(x,z))return out(x,z,eye?'pro-combat-strafe':'pro-angle-clear',{lean:0});
  if(can(-x,-z))return out(-x,-z,'pro-reverse-strafe');
  if(cover&&can(cover.x-mv.x,cover.z-mv.z))return out(cover.x-mv.x,cover.z-mv.z,'pro-fallback-cover');
  return out(0,0,'pro-hold-no-path');
}

// Search a nearby ring-safe firing position rather than strafing forever into
// the same blocked lane. Only executed for long-range weapons with no current LOS;
// the page agent caches the chosen position/route to avoid frame-time spikes.
export function planPrecisionSightline(game,target,helpers,settings={}) {
  if(!game?.local?.mv || !target?.point || target.visible!==false || !helpers?.rayWorld || !game?.map?.boxes)return null;
  const w=settings?.strategicPrimaryWeapon || game.local.weapon, style=weaponProfile(w,settings).style;
  if(style!=='sniper' && style!=='marksman' && settings.combatSightline!==true)return null;
  const mv=game.local.mv, ownY=game.pos?.y??mv.y;
  const dx=target.point.x-mv.x,dz=target.point.z-mv.z;
  const dist=Math.hypot(dx,dz);if(dist<.1)return null;
  const tx=dx/dist,tz=dz/dist, sx=-tz,sz=tx;
  // Non-precision firearms search shorter offset corridors. A valid firing
  // position must restore sight to the actual target without rushing its body.
  const precision=style==='sniper'||style==='marksman';
  const radius=precision?[5,9,13]:[4,7,11];let best=null,score=Infinity;
  const candidates=[];
  for(const r of radius)for(const side of [-1,1])for(const forward of [0,.65])
    candidates.push({x:mv.x+(sx*side+tx*forward)*r,z:mv.z+(sz*side+tz*forward)*r});
  for(const p of candidates){
    if(!brRingDestinationAllowed(game,p,settings))continue;
    const px=p.x-mv.x,pz=p.z-mv.z;
    if(!safeDirection(game,px,pz,helpers,1.3))continue;
    const origin=[p.x,ownY+(helpers.eyeHeightOf?.(mv)??1.6),p.z];
    const ray=[target.point.x-origin[0],target.point.y-origin[1],target.point.z-origin[2]];
    const len=Math.hypot(...ray);if(len<.1)continue;
    if(helpers.rayWorld(origin,ray.map(v=>v/len),game.map.boxes,len)<len-.15)continue;
    // Avoid over-pushing a visible sniper to close range once it acquires LOS.
    const travel=Math.hypot(px,pz);
    const penalty=precision?(len<24?(24-len)*3:0):
      len<Math.min(9,weaponProfile(w,settings).distance*.45)?(10-len)*1.8:0;
    const rank=travel+penalty+Math.max(0,len-weaponProfile(w,settings).fire)*.35;
    if(rank<score){score=rank;best={...p,y:mv.y};}
  }
  return best;
}

export function brRingDestinationAllowed(game,point,settings={}) {
  if(game?.modeState?.type!=='br' || !point)return true;
  const ring=game.modeState?.ring;
  if(!ring || !Number.isFinite(ring.r))return true;
  if(Math.hypot(point.x-ring.cx,point.z-ring.cz)>Math.max(0,ring.r-3))return false;
  const next=ring.nxt;
  if(!next || !Number.isFinite(next.r) || !Number.isFinite(ring.next))return true;
  const mv=game.local?.mv;if(!mv)return false;
  const t=Math.max(0,Math.hypot(mv.x-next.cx,mv.z-next.cz)-Math.max(0,next.r-5))/4.7;
  return (ring.phase!=='shrinking' && ring.next>t+(settings.brLeadSeconds??24)) ||
    Math.hypot(point.x-next.cx,point.z-next.cz)<Math.max(0,next.r-3);
}

// BR pursuit is not a perpetual sidestep: close distance with suitable weapons,
// keep shooting when aligned, and refuse pushes that cross a near-future ring edge.
// Uses only the published map/player snapshot and normal input vectors.
export function planBattleRoyalePush(game,target,helpers,settings={},now=0) {
  if(game?.modeState?.type!=='br' || !game.local?.alive || !game.local.mv || !target?.point || !helpers)return null;
  const mv=game.local.mv,gun=game.local.ws?.guns?.[game.local.ws.slot], weapon=game.local.weapon;
  // Never use a temporarily equipped pistol's close-range profile to plan an
  // aggressive BR charge while a long gun is waiting to be reloaded.
  if(game.local.ws?.slot===1 && settings?.strategicPrimaryWeapon)return null;
  if(!gun || !weapon || weapon.unarmed || weapon.melee || (!weapon.infinite && gun.mag<=0) ||
    game.local.ws.reloading || game.local.ws.plateT>0 || game.local.ws.switchT>0)return null;
  const risk=assessThreats(game,helpers,target);
  const hp=game.local.hp??100,armor=game.local.armor??0;
  if(hp<45 || (hp<67 && armor<16) || risk.close>=3 || (risk.visible>=2 && hp<78))return null;
  const enemyCat=settings?.enemyWeapon?.cat;
  // Do not charge through a scoped firing lane in the open or press into a
  // shotgun's point-blank advantage. Pro movement may still use nearby cover.
  if(target.visible && enemyCat==='Sniper')return null;
  const profile=weaponProfile(weapon,settings);
  const distance=Math.hypot(target.point.x-mv.x,target.point.z-mv.z);
  if(distance<.1 || distance>profile.fire*1.8)return null;
  // Precision weapons maintain engagement range; shotguns/SMGs pressure closer.
  const aggression=Math.max(0,Math.min(100,settings.brAggression??80))/100;
  if(aggression<.2)return null;
  // Long-range platforms hold a firing lane instead of sprinting into rifle range.
  // A scoped/long-range rifle should hold a 50-150m lane, not obey a generic
  // BR aggression slider by closing from 80m to pistol/SMG distance.
  if(['sniper','marksman'].includes(profile.style) && distance<=profile.fire*.88)return null;
  if(profile.style==='suppress' && target.visible &&
     distance<Math.max(profile.distance+3,profile.fire*.45))return null;
  const desired=profile.distance * (1-(aggression-.5)*.32);
  if(distance<=desired+Math.max(1.1,4-aggression*3))return null;
  const dx=(target.point.x-mv.x)/distance,dz=(target.point.z-mv.z)/distance;
  const ring=game.modeState?.ring;
  // Never chase a gunfight across the CURRENT safe-zone edge. When the next
  // circle is imminent, decline pushes away from it before they become lethal.
  const inside=(circle,point,margin=3)=>Math.hypot(point.x-circle.cx,point.z-circle.cz) <= circle.r-margin;
  const lookAhead=Math.min(7,Math.max(2,distance-desired));
  const projected={x:mv.x+dx*lookAhead,z:mv.z+dz*lookAhead};
  if(ring && Number.isFinite(ring.r) && !inside(ring,projected,Math.min(4,ring.r*.18)))return null;
  const next=ring?.nxt;
  if(next && Number.isFinite(next.r) && Number.isFinite(ring.next)){
    const eta=Math.max(0,Math.hypot(mv.x-next.cx,mv.z-next.cz)-Math.max(0,next.r-5))/4.7;
    if(ring.phase==='shrinking' || ring.next<eta+(settings.brLeadSeconds??24)) {
      if(!inside(next,projected,Math.min(4,next.r*.18)))return null;
    }
  }
  const visible=!!target.visible && lineClear(game,target.point,helpers);
  // Avoid straight, predictable charges while under an open sightline.
  const phase=(Math.floor(now/2.0)%2)?1:-1;
  const weave=visible? Math.min(.38,.12+.30*aggression):0;
  const proposals=[{x:dx-dz*phase*weave,z:dz+dx*phase*weave},
    {x:dx+dz*phase*weave,z:dz-dx*phase*weave}, {x:dx,z:dz}];
  for(const p of proposals){
    const len=Math.hypot(p.x,p.z);if(len<.01)continue;
    const projectedTurn={x:mv.x+p.x/len*2,z:mv.z+p.z/len*2};
    if(ring&&Number.isFinite(ring.r)&&!inside(ring,projectedTurn,Math.min(3,ring.r*.18)))continue;
    if(safeDirection(game,p.x,p.z,helpers,1.65))return {...p,reason:'br-pressure-advance',sprint:!visible && distance>desired+12};
  }
  return null;
}

// The game uses crouch OR slide as the same physical C-edge. A rising edge
// during auto-sprint starts a 0.55s slide; otherwise holding C crouches.
// This arbiter is invoked ONCE per simulation tick after weapon safety decisions.
// It never teleports or writes authoritative state.
export function applyProStance(game, sampled, proposal, now=0, state={}, settings={}, helpers=null, context={}) {
  const out={...sampled},mv=game?.local?.mv;
  if (!mv || !proposal || context.autonomous===false || settings.proMovement===false)return out;
  if (proposal.suppressFire)out.fire=false;
  if (proposal.breakAds)out.aim=false;
  if (proposal.lean && !mv.slideT && !out.fire && !out.aim)out.lean=proposal.lean;
  else if (!sampled.lean)out.lean=0;
  const grounded=mv.onGround===true && mv.stance!==2 && !mv.heli && !mv.air &&
    !mv.hk && !mv.zl && !game?.local?.frozen && !game?.local?.down;
  // Release the bot's artificial C press *immediately* after the slide edge.
  // The engine owns slide velocity and locks direction while slideT>0.
  if(mv.slideT>0){out.crouch=!!sampled.crouch;out.slide=!!sampled.slide;state.crouchUntil=0;return out;}
  const emergency=!!proposal.emergency || proposal.reason==='dodge-threat';
  const rotating=['pro-rotate','br-ring-escape','pathfinding','loot-pathfinding','loot-travel','zombie-kite'].includes(proposal.reason);
  const length=Math.hypot(proposal.x||0,proposal.z||0);
  const canStartSlide=grounded && settings.autoSlide!==false && !out.crouch && !out.slide &&
    !out.reload && !out.plate && !out.jump && !out.prone && !out.use && !out.interact &&
    !game?.local?.ws?.plateT && mv.slideCd<=0 && !mv.slidePrev && mv.stance===0 &&
    !out.backward && length>.25 && now-(state.lastSlideAt??-Infinity)>1.6 &&
    !!helpers && safeDirection(game,proposal.x,proposal.z,helpers,6.5) &&
    (!proposal.goal || Math.hypot(proposal.goal.x-mv.x,proposal.goal.z-mv.z)>8);
  const zombies=game?.modeState?.type==='zm' ?
    (game.zremotes?.list||[]).filter(z=>z?.alive && z.pos) : [];
  const ux=(proposal.x||0)/Math.max(.001,length),uz=(proposal.z||0)/Math.max(.001,length);
  const nearestZombie=zombies.length?Math.min(...zombies.map(z=>Math.hypot(z.pos.x-mv.x,z.pos.z-mv.z))):Infinity;
  // Sliding is safe against a zombie only when the entire 6.5m corridor is
  // clear and the predicted exit is farther from *every* nearby zombie.
  const zombieExitSafe=zombies.every(z=>{
    const start=Math.hypot(z.pos.x-mv.x,z.pos.z-mv.z);
    if(start>18)return true;
    const end=Math.hypot(z.pos.x-(mv.x+ux*6.5),z.pos.z-(mv.z+uz*6.5));
    return end>Math.max(7.5,start+1.3);
  });
  // Pause fire on a single initiation tick only when escape is critical.
  // Zombie escape is allowed if every nearby threat is farther at the endpoint.
  const zombieEscape=proposal.reason==='zombie-kite' && nearestZombie<12 && zombieExitSafe;
  const criticalEscape=(emergency && !!context.critical || zombieEscape) && zombieExitSafe;
  const travelSlide=(rotating || (emergency && !out.fire && !out.aim)) &&
    !!proposal.sprint && !out.fire && !out.aim;
  if(canStartSlide && zombieExitSafe && (criticalEscape || travelSlide)){
    if(criticalEscape){out.fire=false;out.aim=false;out.lean=0;}
    // FPS Arena sprints automatically when moving forward and not firing/ADS.
    // No extra synthetic sprint key is needed.
    out.crouch=true;out.slide=true;state.lastSlideAt=now;state.crouchUntil=0;
    return out;
  }
  // In an active duel, brief duck pulses keep the ability to ADS/shoot. Avoid
  // holding crouch on a full-speed retreat or repeatedly toggling at 60 Hz.
  const duck=settings.evasiveCrouch!==false && settings.autoCrouch!==false &&
    emergency && grounded && !proposal.sprint && !out.reload && !out.plate &&
    !out.jump && !out.prone && !out.use && length>.2 &&
    now-(state.lastDuckAt??-Infinity)>1.15;
  if(duck){state.lastDuckAt=now;state.crouchUntil=now+.28;}
  const holdingCover=settings.autoCrouch!==false && grounded && proposal.crouch &&
    !proposal.sprint && !out.jump && !out.prone;
  if(holdingCover)state.crouchUntil=Math.max(state.crouchUntil??0,now+.16);
  const hold=grounded && settings.autoCrouch!==false && !proposal.sprint &&
    now<(state.crouchUntil??0) && !out.jump && !out.prone &&
    (holdingCover || emergency || length<.25);
  out.crouch=!!sampled.crouch || hold;
  out.slide=!!sampled.slide;
  if(!grounded || proposal.sprint && !emergency)state.crouchUntil=0;
  return out;
}

export function movementFromWorld(direction, yaw, original) {
  if(!direction)return original;
  const d=Math.hypot(direction.x,direction.z);
  if (d<.001)return original;
  const x=direction.x/d,z=direction.z/d;
  const forward=-Math.sin(yaw)*x-Math.cos(yaw)*z;
  const right=Math.cos(yaw)*x-Math.sin(yaw)*z;
  return {...original,forward:forward>.32,backward:forward<-.32,right:right>.32,left:right<-.32};
}
// A plate is a three-second, uninterruptible commitment in FPS Arena.
// A single selected target is NOT evidence that the other angles are safe.
export function assessThreats(game, helpers, selected = null) {
  const origin=game?.local?.mv, boxes=game?.map?.boxes;
  const threats=[];
  if (!origin) return {hot:true, nearest:0, visible:0, close:0, aiming:0, total:0, reason:'no-state'};
  const seen=new Set();
  for (const {id, remote:r} of opponents(game)) {
    if (!r.pos || ![r.pos.x,r.pos.z].every(Number.isFinite)) continue;
    // A freshly respawned glider cannot shoot while airborne (server freezes
    // weapon actions). Do not treat a player 100m above the deck as a close
    // ground pursuer during opening loot/recovery.
    if(game.modeState?.type==='br' && isAirborneOpponent(r,origin,10))continue;
    const d=Math.hypot(origin.x-r.pos.x,origin.z-r.pos.z);
    if(!Number.isFinite(d)||d>120)continue;
    let los=false;
    if (helpers?.rayWorld && Array.isArray(boxes)) {
      const dy=(origin.y+(helpers.eyeHeightOf?.(origin)??1.6))-(r.pos.y+1.4);
      const ray=[origin.x-r.pos.x,dy,origin.z-r.pos.z],len=Math.hypot(...ray);
      if (len>.1) los=helpers.rayWorld([r.pos.x,r.pos.y+1.4,r.pos.z],ray.map(v=>v/len),boxes,len)>=len-.18;
    } else los=true; // Unknown geometry is danger, not permission to recover.
    const aiming=!!r.data?.aim;
    // An aiming opponent may be dangerous even beyond the selected weapon's range.
    const close=d<42, visible=los && d<110, aimed=aiming && d<120;
    threats.push({id, d, close, visible, aimed, hostile:true}); seen.add(id);
  }
  if (selected?.point && !seen.has(selected.id) &&
      !(game.modeState?.type==='br' && isAirborneOpponent(selected.remote,origin,10))) {
    const d=targetDistance(game,selected);
    if (Number.isFinite(d) && d<120) {
      const visible=helpers?lineClear(game,selected.point,helpers):true;
      threats.push({id:'selected',d,close:d<42,visible:visible&&d<110,aimed:false,hostile:true});
    }
  }
  const nearest=threats.length?Math.min(...threats.map(t=>t.d)):Infinity;
  const visible=threats.filter(t=>t.visible).length;
  const close=threats.filter(t=>t.close).length;
  const aiming=threats.filter(t=>t.aimed).length;
  return {hot:close>0||visible>0||aiming>0, nearest, visible, close, aiming,
    total:threats.length, reason:close?'enemy-near':visible?'open-sightline':aiming?'enemy-ads':'clear'};
}

// Remember danger across ticks; transient LOS loss cannot make us plate instantly.
export function updateCombatMemory(game, sampled, now, helpers, selected, prev = {}) {
  const risk=assessThreats(game,helpers,selected);
  const m={...prev}, hp=game?.local?.hp, armor=game?.local?.armor;
  if(!Number.isFinite(m.started))m.started=now;
  if(!Number.isFinite(m.lastDanger))m.lastDanger=now;
  if(!Number.isFinite(m.lastFire))m.lastFire=now;
  if(!Number.isFinite(m.lastDamage))m.lastDamage=now;
  if(risk.hot)m.lastDanger=now;
  if(game?.modeState?.type==='tdm' && risk.total===0){
    if(prev?.risk?.total>0)m.emptySince=now;
  }else m.emptySince=null;
  if(sampled?.fire)m.lastFire=now;
  if((Number.isFinite(hp)&&Number.isFinite(m.hp)&&hp<m.hp-.25)||
     (Number.isFinite(armor)&&Number.isFinite(m.armor)&&armor<m.armor-.25))m.lastDamage=now;
  m.hp=hp;m.armor=armor;m.risk=risk;
  return m;
}

export function armorDecision(game, sampled, options, selected, helpers, context) {
  if(!options?.autoArmor)return {allowed:false,reason:'disabled'};
  const ws=game?.local?.ws,local=game?.local;
  if(!ws||!local?.alive||local.down||local.frozen||!game?.input?.locked || !game?.input?.enabled)
    return {allowed:false,reason:'uncontrollable'};
  if(!local.plates || !(local.maxArmor>0) || local.armor>=local.maxArmor*.55)
    return {allowed:false,reason:'not-needed'};
  if(ws.plateT>0||ws.switchT>0||ws.reloading||ws.wind>0)
    return {allowed:false,reason:'weapon-busy'};
  if(sampled?.fire||sampled?.aim||sampled?.reload||sampled?.slot===0||sampled?.slot===1||
     game.input?.fireHeld||(options.mode!=='autopilot' && game.input?.aimHeld))
    return {allowed:false,reason:'combat-input'};
  // Crucial: never allow auto-plating without an observed, stabilized quiet window.
  if(!context || !Number.isFinite(context.now) || !context.memory)
    return {allowed:false,reason:'no-history'};
  const risk=context.memory.risk || assessThreats(game,helpers,selected);
  if(risk.hot) return {allowed:false,reason:risk.reason};
  // Even a currently hidden enemy nearby could swing during the 3-second plate.
  if(risk.nearest<55) return {allowed:false,reason:'nearby-unknown-angle'};
  const quiet=Math.max(4,Math.min(15,options.armorQuietSeconds??5));
  const m=context.memory;
  // TDM spawns are delayed. A verified empty opposing roster is a brief
  // opportunity to repair armor instead of idling until enemies respawn.
  // Still require a snapshot-stable gap and a pause after the last hit/shot.
  const emptyTDM=game.modeState?.type==='tdm' && risk.total===0 &&
    Number.isFinite(m.emptySince) && context.now-m.emptySince>=.45 &&
    context.now-(m.lastDamage??context.now)>=.8 &&
    context.now-(m.lastFire??context.now)>=.65;
  if(!emptyTDM && context.now-Math.max(m.lastDanger??context.now,m.lastFire??context.now,m.lastDamage??context.now)<quiet)
    return {allowed:false,reason:'cooldown'};
  return {allowed:true,reason:'secure'};
}

export function manageResources(game, sampled, options, target=null, helpers=null, context=null) {
  const ws=game?.local?.ws, gun=ws?.guns?.[ws.slot], weapon=game?.local?.weapon;
  if(!ws || !gun || !weapon || !game.local.alive)return sampled;
  const out={...sampled}, autopilot=options.mode==='autopilot' && options.enabled !== false;
  const autoReload=autopilot || options.autoReload, autoSwitch=autopilot || options.autoSwitch;
  if (!autoReload && !autoSwitch && !options.autoArmor)return out;
  if(out.slot===0 || out.slot===1 || out.reload || out.plate) return out; // manual commands win
  // An empty weapon may be selected by an earlier swap tick.  Recheck the
  // *currently equipped* slot on subsequent 60 Hz ticks; a slot request is
  // not a reload command, and a switch locks weapon actions for 0.4s.
  // Preserve Primary Reload First outside Zombies, while Zombies can have
  // their best wave-clear gun in slot 1.
  if(autopilot && gun.mag<=0 && !weapon.infinite && !weapon.noReload &&
     !weapon.unarmed && !weapon.melee && !weapon.skillWeapon && weapon.magSize>0 &&
     (!ws.finite || gun.reserve>0)) {
    const catalog=context?.catalog||{};
    const zombieMode=game?.modeState?.type==='zm';
    const preferred=zombieMode?preferredZombieSlot(ws,catalog):0;
    const other=ws.guns?.[1-ws.slot];
    const otherDef=other&&(catalog[other.id]||null);
    const otherReady=!!(other && other.mag>0 && !otherDef?.unarmed && !otherDef?.melee);
    const nearest=zombieMode ? Math.min(targetDistance(game,target),context?.memory?.risk?.nearest??Infinity,
      ...(game.zremotes?.list||[]).filter(z=>z?.alive&&z.pos)
        .map(z=>Math.hypot(z.pos.x-game.local.mv.x,z.pos.z-game.local.mv.z))) :
      Math.min(context?.memory?.risk?.nearest??Infinity,targetDistance(game,target));
    const close=nearest<=Math.max(5,Math.min(15,options.sidearmEmergencyRange??10));
    const primary=ws.guns?.[0],primaryDef=primary&&(catalog[primary.id]||null);
    const shouldReturnPrimary=!zombieMode && ws.slot===1 && primary && primaryDef &&
      !primaryDef.unarmed && !primaryDef.melee &&
      (primary.mag>0 || !ws.finite || primary.reserve>0) && !close;
    const betterLoaded=zombieMode && preferred!==ws.slot && otherReady;
    if(!betterLoaded && !shouldReturnPrimary && !(close && otherReady && ws.slot===0)) {
      if(ws.reloading || ws.switchT>0 || ws.wind>0 || ws.plateT>0){
        return {...out,fire:false,aim:false,reload:false};
      }
      return {...out,fire:false,aim:false,reload:true};
    }
  }
  // In Zombies, inventory slot 0 may be a weak pistol. Use the best actual
  // wave-clear weapon instead of enforcing the Classic primary-first invariant.
  if(autopilot && game?.modeState?.type==='zm' && options.weaponTactics!==false){
    const choice=preferredZombieSlot(ws,context?.catalog||{});
    const emergencySidearm=ws.slot===1 && choice===0 && (ws.guns[0]?.mag??0)<=0 &&
      (game.zremotes?.list||[]).some(z=>z?.alive && z.pos &&
        Math.hypot(z.pos.x-game.local.mv.x,z.pos.z-game.local.mv.z)<=
          Math.max(5,Math.min(15,options.sidearmEmergencyRange??10)));
    if(choice!==null && choice!==ws.slot && !emergencySidearm && ws.switchT<=0 && !ws.plateT){
      out.slot=choice;out.fire=false;out.aim=false;out.reload=false;return out;
    }
    if(choice===1 && ws.slot===1){
      const gunDef=(context?.catalog||{})[gun.id]||weapon;
      if(gun.mag<=0 && !ws.reloading && !ws.switchT && !ws.plateT &&
        (gun.reserve>0 || !ws.finite) && !gunDef.infinite && !gunDef.noReload){
        out.reload=true;out.fire=false;out.aim=false;
      }
      // Keep the stronger slot during sustained combat. Maintenance of an
      // inferior slot must never force a swap away from the upgraded firearm.
      return out;
    }
  }
  const profile=weaponProfile(weapon,options);
  const other=ws.guns?.[1-ws.slot];
  // The live catalog is needed to reason about the OTHER slot. Comparing its
  // ID with the active gun does not reveal whether a different sidearm can
  // reload, is infinite, or consumes reserve ammo.
  const catalog=context?.catalog || {};
  const otherWeapon=other ? (catalog[other.id] || (other.id===weapon.id?weapon:null)) : null;
  // "fists" has infinite=true in FPS Arena but zero firearm damage: it must
  // never be mistaken for a loaded backup gun during emergency switching.
  const otherLoaded=!!(other && !otherWeapon?.unarmed && !otherWeapon?.skillWeapon &&
    (other.mag>0 || (otherWeapon?.infinite && !otherWeapon?.melee)));
  // A visible, aiming or nearby opponent is combat, regardless of which target is selected.
  // Never use a selected-target distance as a proxy for global safety.
  const risk=context?.memory?.risk || assessThreats(game,helpers,target);
  const zombieMode=game?.modeState?.type==='zm';
  const zombieWindow=zombieMode ? zombieReloadOpportunity(game,weapon,{empty:gun.mag<=0}) : null;
  // Classic/BR wait for a true quiet interval. Zombie waves rarely become
  // completely quiet, so use the local approach-time safety window instead.
  const unsafe=zombieMode ? !zombieWindow.safe :
    risk.hot || risk.nearest < 55 || (game.local.gas||0)>0 || (game.you?.ringRate||0)>0;
  const quiet=options.reloadQuietSeconds??3.5;
  const recent=context?.memory ? context.now-Math.max(context.memory.lastDanger??context.now,
    context.memory.lastDamage??context.now,context.memory.lastFire??context.now)<quiet : true;
  const emergencyZombieReload=autopilot && zombieMode && gun.mag<=0 &&
    (!ws.finite || gun.reserve>0) && !otherLoaded && zombieWindow.nearest>=8.5 &&
    !ws.plateT && !ws.switchT;
  // When both magazines are empty, staying in the fake combat loop is fatal.
  // The bot can run while reloading; never reload within immediate melee range.
  // A target merely PRESENT in a snapshot is not always an active firefight.
  // When safely behind hard cover, or watching an un-aimed contact far across
  // the map, restore the better long gun after a real firing/damage pause.
  // This exception is for reloading only; never apply it to 3-second armor plating.
  const lastAction=Math.max(context?.memory?.lastFire??context?.now??0,
    context?.memory?.lastDamage??context?.now??0);
  const calmSinceActions=Number.isFinite(context?.now) && context.now-lastAction>=quiet;
  const recoverBehindCover=risk.visible===0 && risk.aiming===0 && risk.nearest>=22;
  const distantQuiet=risk.nearest>=72 && risk.aiming===0 && risk.close===0;
  const emptyTDM=game.modeState?.type==='tdm' && risk.total===0 &&
    Number.isFinite(context?.memory?.emptySince) &&
    context.now-context.memory.emptySince>=.45 &&
    context.now-(context.memory.lastDamage??context.now)>=.8 &&
    context.now-(context.memory.lastFire??context.now)>=.65;
  const tacticalReload=autopilot && !zombieMode && (calmSinceActions||emptyTDM) &&
    !((game.local.gas||0)>0 || (game.you?.ringRate||0)>0) &&
    (recoverBehindCover || distantQuiet);
  const reloadSecure=(!unsafe && (zombieMode || !recent)) || emergencyZombieReload || tacticalReload || emptyTDM;
  // Sidearm maintenance is a multi-tick operation: switch (0.4 s), reload,
  // then return to the primary. Persist it per Game instance via a WeakMap
  // owned by agent-entry.js, never in the authoritative player state.
  const maintenance=autopilot && context?.resourceState;
  const maintenanceBusy=!!context?.suspendMaintenance;
  // Primary recovery is a persistent job, distinct from proactive sidearm
  // maintenance. Classic has infinite *reserve*, not infinite magazine: the
  // primary must still be explicitly reloaded after an emergency sidearm swap.
  const primary=ws.guns?.[0],primaryWeapon=primary &&
    (catalog[primary.id] || (ws.slot===0?weapon:null));
  const primaryReloadable=!!(primary && primaryWeapon && !primaryWeapon.infinite &&
    !primaryWeapon.unarmed && !primaryWeapon.melee && !primaryWeapon.skillWeapon &&
    !primaryWeapon.noReload && primaryWeapon.magSize>0 && (!ws.finite || primary.reserve>0));
  if(maintenance){
    if(maintenance.primaryPending && maintenance.primaryId!==primary?.id){
      maintenance.primaryPending=false;
    }
    if(primaryReloadable && primary.mag<=0){
      maintenance.primaryPending=true;
      maintenance.primaryId=primary.id;
      maintenance.secondaryPending=false;
    }
  }
  const primaryRecovery=!!maintenance?.primaryPending;
  // Slot zero is the strategic default. The backup is not a replacement for
  // the main gun at rifle/sniper distances, even when the magazine is empty.
  const primaryIsFirearm=!!(primary && primaryWeapon && !primaryWeapon.unarmed &&
    !primaryWeapon.melee && !primaryWeapon.skillWeapon);
  const primaryLoaded=primaryIsFirearm && (primary.mag>0 || !!primaryWeapon.infinite);
  // Use the nearest real enemy, not the selected aim target alone. In Zombies
  // the risk report contains player threats only, so scan zombies separately.
  let nearestHostile=Math.min(Number.isFinite(risk.nearest)?risk.nearest:Infinity,
    targetDistance(game,target));
  if(zombieMode)for(const zombie of game.zremotes?.list||[]){
    if(zombie?.alive && zombie.pos)nearestHostile=Math.min(nearestHostile,
      Math.hypot(zombie.pos.x-game.local.mv.x,zombie.pos.z-game.local.mv.z));
  }
  const sidearmEmergencyRange=Math.max(5,Math.min(15,options.sidearmEmergencyRange??10));
  const enemyTooClose=nearestHostile<=sidearmEmergencyRange;
  // Recover a loaded main gun even while an enemy is present; swapping to the
  // primary is never considered low-priority background maintenance.
  const secondaryWeapon=ws.guns?.[1] && (catalog[ws.guns[1].id] || (ws.slot===1?weapon:null));
  const primaryStronger=primaryWeapon && secondaryWeapon && !primaryWeapon.unarmed &&
    ['Sniper','Marksman','Assault Rifle','LMG','SMG','Shotgun'].includes(primaryWeapon.cat) &&
    ['Pistol','Special'].includes(secondaryWeapon.cat);
  // Two-switch reload cancellation for non-shell magazines. Server accepts
  // only a slot switch as an interrupt, then imposes 0.4 s per switch.
  // Prefer completing reload if little time remains; never fake a cancel by
  // clearing ws.reloading locally (server would disagree).
  if(maintenance?.interruptReload){
    if(maintenance.interruptWeapon!==primary?.id || !primaryLoaded){
      maintenance.interruptReload=false;
    }else if(ws.slot===1){
      if(ws.switchT<=0 && !ws.plateT && !game.local.frozen){
        out.slot=0;out.fire=false;out.aim=false;out.reload=false;
        maintenance.interruptReload='returning';return out;
      }
      return {...out,fire:false,aim:false,reload:false};
    }else if(ws.slot===0){
      if(ws.switchT>0)return {...out,fire:false,aim:false,reload:false};
      maintenance.interruptReload=false;
      maintenance.suppressTopUpUntil=(context?.now||0)+2;
    }
  }
  // Critical close-range enemy: reclaim a partially loaded PRIMARY even if
  // a premature full-magazine reload started. Switching away cancels it in
  // authoritative stepWeapons. Do not do this if the remaining reload is
  // already faster than the 0.8s pair of switches.
  if(autopilot && maintenance && ws.slot===0 && ws.reloading &&
     primaryLoaded && !primaryWeapon?.shellReload && enemyTooClose &&
     ws.reloadT>.9 && ws.switchT<=0 && !ws.plateT && !game.local.frozen &&
     ws.guns?.[1] && ws.guns[1].id){
    maintenance.interruptReload='switching';maintenance.interruptWeapon=primary.id;
    out.slot=1;out.fire=false;out.aim=false;out.reload=false;return out;
  }
  if(autopilot && ws.slot===1 && primaryLoaded &&
     !(options.proactiveSecondaryReload===true && maintenance?.secondaryPending) &&
     !ws.plateT && !ws.switchT && !game.local.frozen){
    maintenance.primaryPending=false;maintenance.secondaryPending=false;
    out.slot=0;out.fire=false;out.aim=false;return out;
  }
  // Primary-first policy: an EMPTY main firearm with available reserve should
  // begin reloading immediately, even while a distant enemy remains visible.
  // A close, LOADED sidearm is the sole automatic fallback.  Do not let the
  // quiet-window/loot-maintenance scheduler postpone an essential reload.
  if(autopilot && primaryReloadable && primary.mag<=0 && !ws.plateT && !game.local.frozen){
    if(maintenance){maintenance.primaryPending=true;maintenance.secondaryPending=false;}
    if(ws.slot===1 && !enemyTooClose && ws.switchT<=0){
      out.slot=0;out.fire=false;out.aim=false;out.reload=false;return out;
    }
    if(ws.slot===0){
      if(enemyTooClose && otherLoaded && autoSwitch && ws.switchT<=0){
        out.slot=1;out.fire=false;out.aim=false;out.reload=false;return out;
      }
      if(ws.reloading){out.fire=false;out.aim=false;return out;}
      // Switching, plating and weapon wind-up prohibit starting the reload
      // inside authoritative stepWeapons(), so wait without fake dry firing.
      if(ws.switchT>0 || ws.wind>0){out.fire=false;out.aim=false;return out;}
      out.reload=true;out.fire=false;out.aim=false;return out;
    }
    // Sidearm is already equipped, and a real close contact still threatens.
    // Hold until there is room to return to the primary.
    if(ws.slot===1 && enemyTooClose)return out;
  }
  const primarySafe=!zombieMode || (primaryWeapon &&
    (zombieReloadOpportunity(game,primaryWeapon,{empty:true}).safe ||
      (!otherLoaded && zombieWindow.nearest>=8.5)));
  const recoveryCanAct=reloadSecure && primarySafe &&
    (!maintenanceBusy || (zombieMode && primary?.mag===0)) && !ws.plateT && !game.local.frozen;
  if(primaryRecovery){
    maintenance.secondaryPending=false;
    if(primaryLoaded){
      // A pickup or finished reload can restore the primary while slot 1 is
      // active. Do not pull an unloaded gun out in an active fight.
      if(ws.slot===1 && recoveryCanAct && ws.switchT<=0){
        out.slot=0;out.fire=false;out.aim=false;maintenance.primaryPending=false;
        return out;
      }
      if(ws.slot===0)maintenance.primaryPending=false;
    }else if(recoveryCanAct){
      if(ws.slot!==0 && ws.switchT<=0){
        out.slot=0;out.fire=false;out.aim=false;return out;
      }
      if(ws.slot===0){
        if(ws.reloading){out.fire=false;out.aim=false;return out;}
        if(ws.switchT<=0 && ws.wind<=0){
          out.reload=true;out.fire=false;out.aim=false;return out;
        }
      }
    }
  }
  if (maintenance?.secondaryPending &&
      (!ws.guns?.[1] || ws.guns[1].id!==maintenance.secondaryId ||
       !ws.guns?.[0] || ws.guns[0].id!==maintenance.primaryId)) {
    maintenance.secondaryPending=false; // pickups/slot replacement invalidate job
  }
  if(maintenance?.secondaryPending && (!reloadSecure || maintenanceBusy)) {
    maintenance.secondaryPending=false;
    // Dangerous contact: interrupt an ongoing sidearm reload by switching to
    // a *loaded* primary. Do not switch to an empty weapon.
    if(ws.slot===1 && ws.guns[0]?.mag>0 && !ws.plateT && !ws.switchT){
      out.slot=0;out.fire=false;out.aim=false;return out;
    }
  }
  const ammo=Number.isFinite(gun.mag)?gun.mag:0;
  const canReload=autoReload && !weapon.infinite && !weapon.unarmed && !weapon.melee &&
    !weapon.skillWeapon && !weapon.noReload && weapon.magSize>0 &&
    (!ws.finite || gun.reserve>0) && ammo<weapon.magSize;
  // Do not shoot a faraway enemy with a backup pistol while waiting for a
  // recoverable rifle/sniper. Aim/movement continues, but range spacing follows
  // the primary and the resource manager looks for the next reload window.
  if(autopilot && ws.slot===1 && primaryIsFirearm && !enemyTooClose){
    out.fire=false;out.aim=false;
  }
  const busy=ws.switchT>0 || ws.plateT>0 || ws.wind>0 || game.local.frozen;
  const dist=targetDistance(game,target);
  const exposed=!!target && dist<profile.exposed &&
    (helpers ? lineClear(game,target.point,helpers) : true);
  if(maintenance?.secondaryPending && ws.slot===1 && !ws.reloading &&
     (gun.mag>Math.ceil(weapon.magSize*.65) || !reloadSecure)) {
    maintenance.secondaryPending=false;
    if(ws.guns[0]?.mag>0 && !ws.plateT && !ws.switchT){
      out.slot=0;out.fire=false;out.aim=false;return out;
    }
  }
  if(ws.reloading){
    // Already-started reloads cannot be cancelled by turning off R. The server
    // allows a weapon switch, or a shotgun shot when at least one shell is ready.
    const interrupt=autopilot && profile.shell && ammo>0 && (unsafe || enemyTooClose) && exposed && dist<=profile.fire*.72;
    if(autopilot && !interrupt && unsafe && ws.slot===0 && enemyTooClose &&
       otherLoaded && autoSwitch && !ws.plateT && !ws.switchT &&
       (ammo<=0 || (!maintenance && ws.reloadT>.9))) {
      out.slot=1;out.fire=false;out.aim=false;return out;
    }
    if(autopilot && !interrupt){out.fire=false;out.aim=false;}
    return out;
  }
  if(busy)return out;
  // Prepare a depleted BACKUP weapon during genuinely quiet intervals.
  // The default active-weapon code below cannot reach a pistol left in slot 1.
  // Only Autopilot attempts a slot change; Assist keeps user's selected gun.
  if(options.proactiveSecondaryReload===true && maintenance && reloadSecure &&
     !maintenanceBusy && !out.fire && !out.aim &&
     (!zombieMode || !(game.zremotes?.list||[]).some(z=>z?.alive)) &&
     !maintenance.secondaryPending && !maintenance.primaryPending && ws.slot===0 && ws.guns?.[0]?.mag>0) {
    const backup=ws.guns[1], backupWeapon=catalog[backup?.id];
    const reloadable=!!(backup && backupWeapon &&
      !backupWeapon.infinite && !backupWeapon.unarmed && !backupWeapon.melee &&
      !backupWeapon.skillWeapon && !backupWeapon.noReload && backupWeapon.magSize>0 &&
      (!ws.finite || backup.reserve>0));
    // Preserve a fully reloaded primary as the active weapon. Reloading a
    // merely half-spent sidearm is not worth a disruptive extra swap.
    if(reloadable && backup.mag<=Math.floor(backupWeapon.magSize*.25)) {
      maintenance.secondaryPending=true;
      maintenance.secondaryId=backup.id;maintenance.primaryId=ws.guns[0].id;
      out.slot=1;out.fire=false;out.aim=false;return out;
    }
  }
  // Empty-bore fire edges cause FPS Arena's weaponstate.js to auto-reload,
  // even when reload=false. Block them during combat as well.
  if(ammo<=0 && !weapon.infinite){out.fire=false;out.aim=false;}
  // Emergency ONLY: sidearm for a contact within close pistol/melee range.
  // A distant LOS or a long primary reload does not justify a pistol swap.
  if(autoSwitch && ws.slot===0 && ammo<=0 && otherLoaded && enemyTooClose &&
      !(reloadSecure && canReload && primaryStronger)){
    out.slot=1-ws.slot;out.fire=false;out.aim=false;return out;
  }
  const threshold=Math.max(1,Math.ceil((weapon.magSize||1)*profile.reload));
  const lowAmmo=ammo<=threshold;
  const shellTopUp=profile.shell && ammo<weapon.magSize;
  const backupTopUp=!!(maintenance?.secondaryPending && ws.slot===1 &&
    ammo<=Math.ceil(weapon.magSize*.65));
  // A nearby attacker outranks proactive topping-off while the gun still
  // contains ammunition. Preserve trigger edges for semi-auto weapons.
  const topUpBlocked=autopilot && ammo>0 &&
    (enemyTooClose || (maintenance?.suppressTopUpUntil||0)>(context?.now||0));
  if(canReload && reloadSecure && !topUpBlocked && !out.fire && (ammo===0 ||
      (zombieMode ? (lowAmmo && zombieWindow.nearest>zombieWindow.threshold+7) : (lowAmmo || shellTopUp || backupTopUp)))){
    out.reload=true;
    if(autopilot){out.fire=false;out.aim=false;}
    return out;
  }
  if(autoSwitch && ws.slot===0 && ammo<=0 && otherLoaded && enemyTooClose){
    out.slot=1;out.fire=false;out.aim=false;return out;
  }
  if(armorDecision(game,out,options,target,helpers,context).allowed)out.plate=true;
  return out;
}
// Solution for unobstructed, no-bounce initial grenade flight (gravity 20, vertical speed boost 4.5).
// The server applies collisions and deflections, so this is guidance only.
export function grenadeGuide(game,target,helpers,throwables,defaultSpeed=25) {
  const thr=game?.local?.thr;
  if(!thr?.id || thr.n<=0 || !target?.point || !game?.pos) return null;
  const throwDef=throwables?.[thr.id]||{}, speed=throwDef.speed||defaultSpeed;
  const dx=target.point.x-game.pos.x,dz=target.point.z-game.pos.z,dist=Math.hypot(dx,dz);
  if(dist<2 || dist>50)return null;
  const eye=game.pos.y+helpers.eyeHeightOf(game.local.mv);
  const height=target.point.y-(eye-.1), azimuth=Math.atan2(-dx,-dz);
  let best=null;
  for(let n=-8;n<=72;n+=.5){
    const pitch=n*Math.PI/180,hv=speed*Math.cos(pitch);
    if (hv<=1)continue;
    const t=Math.max(0,dist-.5)/hv;
    const landing=(speed*Math.sin(pitch)+4.5)*t-10*t*t;
    const err=Math.abs(landing-height);
    if(!best||err<best.error)best={yaw:azimuth,pitch,range:dist,error:err,kind:thr.id};
  }
  return best?.error<1.5?best:null;
}
export function radarContacts(game,maxRange=90) {
  const loc=game?.local?.mv;
  if(!loc)return [];
  return opponents(game).filter(({remote:r})=>r.pos).map(({id,remote:r})=>{
    const x=r.pos.x-loc.x,z=r.pos.z-loc.z,range=Math.hypot(x,z);
    const angle=Math.atan2(x,-z)+game.rig.yaw;
    return {id,range,angle,threat:targetThreat(r,range),invisible:!!r.invisible,aiming:!!r.data?.aim};
  }).filter(c=>c.range<=maxRange).sort((a,b)=>b.threat-a.threat).slice(0,40);
}
