// Deterministic weapon state machine (fire cooldown, reload, plating, switching, finite ammo).
// Driven by processed INPUTS (1 input = 1/60 s) so client prediction and server truth stay in lock-step.
import { WEAPONS } from './weapons.js';
import { gunStats } from './attachments.js';
import { PLAYER } from './constants.js';

export function makeWeaponState(primary, secondary, attP, attS) {           // Classic: infinite reserve ammo; attP/attS = attachment strings of the two guns (see shared/attachments.js)
  const mk = (id, att) => { const g = { id, mag: gunStats(id, att).magSize }; if (att) g.att = att; return g; };
  return makeGunsState([mk(primary, attP), mk(secondary, attS)], false);
}
// guns: [{id, mag, reserve}, {..}]  (finite = reserve ammo is tracked; used by Battle Royale / Zombies)
export function makeGunsState(guns, finite) {
  return { slot: 0, guns, cd: 0, reloading: false, reloadT: 0, plateT: 0, switchT: 0, prevFire: false, prevPlate: false, burstLeft: 0, finite: !!finite, rev: 0, wind: 0, lock: null };
}
export const curGun = (ws) => ws.guns[ws.slot];
export const curWeapon = (ws) => { const g = ws.guns[ws.slot]; return gunStats(g.id, g.att); };       // the EFFECTIVE stats (attachments applied)
export function cancelActions(ws) { ws.reloading = false; ws.reloadT = 0; ws.plateT = 0; ws.burstLeft = 0; ws.wind = 0; ws.lock = null; }
// Weapons with `fireDelay` (EM2) first run a wind-up during which the AIM IS LOCKED; callers (server processInput / client LocalPlayer.tick) substitute ws.lock for the input angles while this is true.
export const aimLocked = (ws) => ws.wind > 0 && !!ws.lock;

// inp: {fire, reload, plate, slot(-1|0|1), yaw, pitch}; ctx: {alive, frozen, armor, plates, maxArmor, anim (handling speed), rate (fire rate)}
// returns {fired, windStarted, reloadStarted, reloadDone, plateStarted, plateDone, switched, dryFire}
export function stepWeapons(ws, inp, dt, ctx) {
  const out = { fired: false, windStarted: false, reloadStarted: false, reloadDone: false, plateStarted: false, plateDone: false, switched: false, dryFire: false };
  const fireEdge = !!inp.fire && !ws.prevFire, plateEdge = !!inp.plate && !ws.prevPlate;
  ws.prevFire = !!inp.fire; ws.prevPlate = !!inp.plate;
  if (!ctx.alive) { cancelActions(ws); ws.cd = 0; return out; }
  const maxArmor = ctx.maxArmor ?? PLAYER.maxArmor;
  ws.cd = Math.max(0, ws.cd - dt * (ctx.rate || 1));          // fire-rate buffs (Warmonger, Therapeutic wave) drain the cooldown faster
  ws.switchT = Math.max(0, ws.switchT - dt);

  if (inp.slot === 0 || inp.slot === 1) {                       // switching (not while plating)
    if (inp.slot !== ws.slot && ws.plateT <= 0 && !ctx.frozen && !(ws.wind > 0)) {
      ws.slot = inp.slot; ws.reloading = false; ws.reloadT = 0; ws.burstLeft = 0; ws.switchT = 0.4; ws.cd = Math.max(ws.cd, 0.4); out.switched = true;
    }
  }
  const g = curGun(ws), w = gunStats(g.id, g.att);

  if (ws.plateT > 0) {                                          // plating
    ws.plateT -= dt;
    if (ws.plateT <= 0) { ws.plateT = 0; out.plateDone = true; }
  } else if (plateEdge && !ctx.frozen && ctx.armor < maxArmor && ctx.plates > 0 && ws.switchT <= 0 && !(ws.wind > 0)) {
    ws.plateT = PLAYER.plateTime; ws.reloading = false; ws.reloadT = 0; ws.burstLeft = 0; out.plateStarted = true;
  }
  const plating = ws.plateT > 0;
  if (w.unarmed) return out;                                    // nothing to fire / reload

  if (ws.reloading) {                                           // reload (finite ammo takes rounds from the reserve); exoskeleton = faster
    ws.reloadT -= dt * (ctx.anim || 1);
    if (w.shellReload > 0) {
      if (ws.reloadT <= 0) {
        if (ws.finite && g.reserve <= 0) ws.reloading = false;
        else {
          g.mag++; if (ws.finite) g.reserve--;
          if (g.mag >= w.magSize || (ws.finite && g.reserve <= 0)) { ws.reloading = false; out.reloadDone = true; } else ws.reloadT += w.shellReload;
        }
      }
    } else if (ws.reloadT <= 0) {
      const need = w.magSize - g.mag, take = ws.finite ? Math.min(need, g.reserve) : need;
      g.mag += take; if (ws.finite) g.reserve -= take; ws.reloading = false; out.reloadDone = true;
    }
  }
  const canAct = !ctx.frozen && !plating && ws.switchT <= 0;
  const canReload = !w.infinite && !w.noReload && g.mag < w.magSize && (!ws.finite || g.reserve > 0);
  if ((inp.reload || (fireEdge && g.mag <= 0)) && canReload && !ws.reloading && canAct) {
    ws.reloading = true; ws.reloadT = w.shellReload > 0 ? w.shellReload : w.reload; ws.burstLeft = 0; out.reloadStarted = true;
  }

  // firing: a burst weapon keeps shooting its remaining rounds without the trigger being held; shotguns can interrupt shell reloading
  const bursting = (w.burst || 0) > 0 && ws.burstLeft > 0;
  const wantFire = bursting || (inp.fire && (w.auto ? true : fireEdge));
  if (ws.wind > 0) {                                            // wind-up of a delayed weapon: a committed shot, the round leaves the barrel when it ends
    ws.wind = Math.max(0, ws.wind - dt);
    if (ws.wind <= 0) { ws.lock = null; if (g.mag > 0) { g.mag--; out.fired = true; ws.cd = w.interval; } }
  } else if (wantFire && canAct && ws.cd <= 0) {
    if (ws.reloading && w.shellReload > 0 && g.mag > 0) { ws.reloading = false; ws.reloadT = 0; }
    if (!ws.reloading) {
      if (w.infinite || g.mag > 0) {
        if (w.fireDelay > 0) { ws.wind = w.fireDelay; ws.lock = [inp.yaw ?? 0, inp.pitch ?? 0]; out.windStarted = true; }     // the round is spent when the wind-up ends
        else {
        if (!w.infinite) g.mag--;
        out.fired = true;
        if (w.burst) {
          ws.burstLeft = bursting ? ws.burstLeft - 1 : w.burst - 1;
          if (g.mag <= 0 && !w.infinite) ws.burstLeft = 0;
          ws.cd = ws.burstLeft > 0 ? w.burstGap : w.interval;
        } else ws.cd = w.interval;
        }
      } else { ws.burstLeft = 0; if (fireEdge) out.dryFire = true; }
    }
  }
  return out;
}
