// Deterministic movement + collision. The SAME code runs on the client (prediction / replay) and server (authority).
// Features: AABB collision, auto step-up (stairs), sprint, slide (only from a sprint), crouch, prone + dive, leaning, jump,
// ziplines (F), grappling hook + Pneumatic leap (skills), battle-royale air glide, wading / mud slow zones.
import { MOVE, BOUND, ZIP, BR, SPRINT, STANCE_H, STANCE_EYE, STANCE_SPEED, LEAN, DIVE, HOOK, PAD } from './constants.js';
import { forwardVec, rayWorld } from './geometry.js';

export const STEP = 0.6;                       // max ledge height walked up automatically
export function newMoveState(x = 0, y = 0, z = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, slideT: 0, slideCd: 0, slideDx: 0, slideDz: 0, slidePrev: false, zl: 0, zt: 0, zd: 1, usePrev: false, air: false, heli: false,
    stance: 0, sprint: false, lean: 0, pronePrev: false, skillPrev: false, dive: 0, hk: 0, hx: 0, hy: 0, hz: 0, hT: 0, skEv: 0 };
}
export const MOVE_KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'onGround', 'slideT', 'slideCd', 'slideDx', 'slideDz', 'slidePrev', 'zl', 'zt', 'zd', 'usePrev', 'air', 'heli',
  'stance', 'sprint', 'lean', 'pronePrev', 'skillPrev', 'dive', 'hk', 'hx', 'hy', 'hz', 'hT'];
export function copyMove(dst, src) { for (const k of MOVE_KEYS) dst[k] = src[k]; return dst; }
export const eyeHeightOf = (s) => (s.slideT > 0 ? MOVE.slideEyeHeight : STANCE_EYE[s.stance || 0]);
export const heightOf = (s) => (s.slideT > 0 ? MOVE.slideHeight : STANCE_H[s.stance || 0]);
const EPS = 1e-4;
const NOFX = { speed: 1, anim: 1, lock: false, noSprint: false, skill: null, skillAct: false };

function overlaps(s, b, r, h) {
  return s.x + r > b.x0 + EPS && s.x - r < b.x1 - EPS &&
         s.z + r > b.z0 + EPS && s.z - r < b.z1 - EPS &&
         s.y + h > b.y0 + EPS && s.y < b.y1 - EPS;
}
function anyOverlap(s, boxes, r, h) { for (let i = 0; i < boxes.length; i++) if (overlaps(s, boxes[i], r, h)) return true; return false; }

function moveAxis(s, axis, d, boxes, r, h, wasGround) {
  if (d === 0) return;
  s[axis] += d;
  if (axis !== 'y') {
    let top = -Infinity, any = false;
    for (let i = 0; i < boxes.length; i++) if (overlaps(s, boxes[i], r, h)) { any = true; if (boxes[i].y1 > top) top = boxes[i].y1; }
    if (!any) return;
    if (wasGround) {                                              // walk up stairs / low ledges
      const rise = top - s.y;
      if (rise > 0 && rise <= STEP) { const oy = s.y; s.y = top; if (!anyOverlap(s, boxes, r, h)) return; s.y = oy; }
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!overlaps(s, b, r, h)) continue;
    if (axis === 'x') { s.x = d > 0 ? b.x0 - r - EPS : b.x1 + r + EPS; s.vx = 0; }
    else if (axis === 'z') { s.z = d > 0 ? b.z0 - r - EPS : b.z1 + r + EPS; s.vz = 0; }
    else if (d > 0) { s.y = b.y0 - h - EPS; if (s.vy > 0) s.vy = 0; }
    else { s.y = b.y1; s.vy = 0; s.onGround = true; }
  }
}
// how far (0..1) can we lean toward `dir` (+1 right / -1 left) before the camera would poke into a wall?
function leanClear(s, sy, cy, dir, boxes) {
  const ey = s.y + eyeHeightOf(s);
  for (const a of [1, 0.75, 0.5, 0.25]) {
    const off = (a * LEAN.offset + 0.2) * dir, px = s.x + cy * off, pz = s.z - sy * off;
    let hit = false; for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1 && ey > b.y0 && ey < b.y1) { hit = true; break; } }
    if (!hit) return a;
  }
  return 0;
}

// world: map object {boxes, bound?, ziplines?, water?, slow?} OR a plain boxes array.
// inp: {forward,backward,left,right,jump,crouch|slide,prone,lean(-1|0|1),fire,aim,skill,use,yaw,pitch}
// fx: {speed, anim, lock, noSprint, skill ('hook'|'pad'|null), skillAct}   (see shared/skills.js fxOf)
export function stepMove(s, inp, dt, mul, world, frozen = false, fx = NOFX) {
  const isArr = Array.isArray(world), boxes = isArr ? world : world.boxes;
  const bound = (!isArr && world.bound) || BOUND, zips = !isArr ? world.ziplines : null;
  const wasGround = s.onGround, adt = dt * (fx.anim || 1), lock = !!fx.lock;
  const useEdge = !!inp.use && !s.usePrev; s.usePrev = !!inp.use;
  const crouchKey = !!(inp.crouch ?? inp.slide) && !lock, crouchEdge = crouchKey && !s.slidePrev; s.slidePrev = crouchKey;
  const proneEdge = !!inp.prone && !lock && !s.pronePrev; s.pronePrev = !!inp.prone;
  const skillEdge = !!inp.skill && !s.skillPrev; s.skillPrev = !!inp.skill;
  s.skEv = 0; s.slideCd = Math.max(0, s.slideCd - dt);
  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  // seated in the Battle Royale helicopter: the server pins the position; you can only look around (leaving is decided by the server)
  if (s.heli) { s.vx = s.vy = s.vz = 0; s.onGround = false; s.sprint = false; s.slideT = 0; s.lean = 0; s.stance = 0; return; }

  // ---------------- zipline riding (no collision, no ADS, F / jump to let go)
  if (s.zl > 0) {
    const z = zips && zips[s.zl - 1];
    if (!z) s.zl = 0;
    else {
      const dx = z.b[0] - z.a[0], dy = z.b[1] - z.a[1], dz = z.b[2] - z.a[2], len = Math.hypot(dx, dy, dz);
      s.zt += s.zd * ZIP.speed * dt / len;
      const done = s.zt <= 0 || s.zt >= 1; s.zt = Math.max(0, Math.min(1, s.zt));
      s.x = z.a[0] + dx * s.zt; s.y = z.a[1] + dy * s.zt - ZIP.hang; s.z = z.a[2] + dz * s.zt;
      s.vx = dx / len * ZIP.speed * s.zd; s.vz = dz / len * ZIP.speed * s.zd; s.vy = 0; s.onGround = false; s.slideT = 0; s.sprint = false; s.lean = 0; s.stance = 0;
      if (done || inp.jump || useEdge) { s.zl = 0; if (!done) s.vy = 3; }
      return;
    }
  }
  const ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), iz = (inp.forward ? 1 : 0) - (inp.backward ? 1 : 0);
  let wx = -sy * iz + cy * ix, wz = -cy * iz - sy * ix;
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx /= len; wz /= len; }
  if (frozen) { wx = 0; wz = 0; }
  const r = MOVE.radius;

  // ---------------- grappling hook (personal zipline): pulled to the target, WASD steers
  if (s.hk) {
    const dx = s.hx - s.x, dy = s.hy - (s.y + 0.9), dz = s.hz - s.z, d = Math.hypot(dx, dy, dz);
    if (d < HOOK.arrive || s.hT <= 0) { s.hk = 0; s.vx *= 0.7; s.vz *= 0.7; s.vy *= 0.5; }
    else {
      s.vx = dx / d * HOOK.speed + wx * HOOK.steer; s.vy = dy / d * HOOK.speed; s.vz = dz / d * HOOK.speed + wz * HOOK.steer;
      s.hT -= dt; s.onGround = false; s.slideT = 0; s.sprint = false; s.lean = 0;
      const x0 = s.x, y0 = s.y, z0 = s.z, h = heightOf(s);
      moveAxis(s, 'x', s.vx * dt, boxes, r, h, false); moveAxis(s, 'z', s.vz * dt, boxes, r, h, false);
      s.x = Math.max(-bound + r, Math.min(bound - r, s.x)); s.z = Math.max(-bound + r, Math.min(bound - r, s.z));
      moveAxis(s, 'y', s.vy * dt, boxes, r, h, false); if (s.y < 0) s.y = 0;
      if (Math.hypot(s.x - x0, s.y - y0, s.z - z0) < HOOK.speed * dt * 0.25) s.hk = 0;      // blocked: let go
      return;
    }
  }
  if (useEdge && zips && !s.air && !frozen && !lock) {            // attach to the nearest zipline within reach
    let bi = -1, bd = ZIP.attach, bt = 0;
    for (let i = 0; i < zips.length; i++) {
      const z = zips[i], ax = z.b[0] - z.a[0], ay = z.b[1] - z.a[1], az = z.b[2] - z.a[2], l2 = ax * ax + ay * ay + az * az;
      const px = s.x - z.a[0], py = s.y + 1.8 - z.a[1], pz = s.z - z.a[2];
      const t = Math.max(0, Math.min(1, (px * ax + py * ay + pz * az) / l2));
      const d = Math.hypot(px - ax * t, py - ay * t, pz - az * t);
      if (d < bd) { bd = d; bi = i; bt = t; }
    }
    if (bi >= 0) { const z = zips[bi]; s.zl = bi + 1; s.zt = bt; s.zd = (-sy * (z.b[0] - z.a[0]) - cy * (z.b[2] - z.a[2])) >= 0 ? 1 : -1; s.slideT = 0; s.sprint = false; s.lean = 0; s.stance = 0; return; }
  }

  // ---------------- sprint / stance / slide / dive / lean
  const leanIn = lock ? 0 : (inp.lean > 0 ? 1 : inp.lean < 0 ? -1 : 0);
  let sliding = s.slideT > 0;
  // auto-sprint while moving; firing, aiming and leaning drop it immediately
  s.sprint = len > 0 && iz >= 0 && !inp.fire && !inp.aim && leanIn === 0 && s.stance === 0 && !sliding && !frozen && !lock && !fx.noSprint && !s.air;
  const canH = (h) => !anyOverlap({ x: s.x, y: s.y, z: s.z }, boxes, r, h);
  let jumpUsed = false;
  if (!frozen && !lock && !s.air) {
    if (crouchEdge && s.sprint && s.onGround && !sliding && s.slideCd <= 0) {                      // crouch while sprinting = slide
      s.slideT = MOVE.slideDuration; s.slideCd = MOVE.slideCooldown; s.slideDx = wx; s.slideDz = wz; sliding = true; s.lean = 0;
    } else if (proneEdge) {
      if (s.stance === 2) { if (canH(STANCE_H[0])) s.stance = 0; else if (canH(STANCE_H[1])) s.stance = 1; }
      else if (s.sprint && s.onGround && !sliding) {                                               // prone while sprinting = dive forward
        s.stance = 2; s.dive = 1; s.onGround = false; s.vy = DIVE.vy; s.vx = wx * DIVE.speed; s.vz = wz * DIVE.speed; s.sprint = false;
      } else if (s.onGround && !sliding) s.stance = 2;
    } else if (s.stance === 2) {
      if (crouchEdge) s.stance = canH(STANCE_H[1]) ? 1 : 2;
      else if (inp.jump && s.onGround) { if (canH(STANCE_H[0])) s.stance = 0; else if (canH(STANCE_H[1])) s.stance = 1; jumpUsed = true; }
    }
    if (s.stance !== 2 && !sliding && !(proneEdge && s.stance === 2)) {
      const want = crouchKey ? 1 : 0;
      if (want !== s.stance && (want > s.stance || canH(STANCE_H[want]))) s.stance = want;
    }
  }
  // lean: allowed while jumping, never while sliding (a slide cancels it)
  let ltgt = sliding || frozen ? 0 : leanIn;
  if (sliding) s.lean = 0;
  if (ltgt !== 0) ltgt *= leanClear(s, sy, cy, ltgt, boxes);
  const dl = ltgt - s.lean, st = LEAN.rate * dt; s.lean = Math.abs(dl) <= st ? ltgt : s.lean + Math.sign(dl) * st;

  // ---------------- skills that move the player (the caller decided that the activation is allowed)
  if (skillEdge && fx.skillAct && !lock && !frozen && !s.air) {
    if (fx.skill === 'hook') {
      const eye = [s.x, s.y + eyeHeightOf(s), s.z], dir = forwardVec(inp.yaw, inp.pitch ?? 0), t = rayWorld(eye, dir, boxes, HOOK.range);
      if (t < HOOK.range - 0.01 && t > 2) {
        s.hk = 1; s.hx = eye[0] + dir[0] * (t - 0.4); s.hy = eye[1] + dir[1] * (t - 0.4); s.hz = eye[2] + dir[2] * (t - 0.4); s.hT = t / HOOK.speed + 0.8;
        s.onGround = false; s.slideT = 0; s.sprint = false; s.skEv = 1; s.vx = s.vy = s.vz = 0; return;
      }
    } else if (fx.skill === 'pad') {
      s.vx = -sy * PAD.speed; s.vz = -cy * PAD.speed; s.vy = PAD.vy; s.onGround = false; s.slideT = 0; s.dive = 0; if (s.stance && canH(STANCE_H[0])) s.stance = 0; s.skEv = 2;
    }
  }

  // ---------------- speed modifiers
  let m = mul * (fx.speed || 1) * STANCE_SPEED[s.stance || 0] * (s.sprint ? SPRINT : 1);
  if (!isArr) {                                                   // wading / mud
    if (world.water && wasGround && s.y <= 0.05) m *= 0.75;
    if (world.slow && s.y < 0.6) for (const q of world.slow) if (s.x > q.x0 && s.x < q.x1 && s.z > q.z0 && s.z < q.z1) { m *= q.m; break; }
  }

  if (s.air) {                                                    // battle royale: free glide down from altitude
    s.vx = wx * BR.glide; s.vz = wz * BR.glide;
    s.vy = -(inp.jump ? BR.dive : inp.slide ? BR.slow : BR.fall);
  } else {
    if (s.slideT > 0) {
      s.slideT = Math.max(0, s.slideT - adt);
      const k = 1 - s.slideT / MOVE.slideDuration;                // 0 -> 1
      const sp = MOVE.slideSpeed + (MOVE.speed * 0.6 - MOVE.slideSpeed) * (k * k);
      s.vx = s.slideDx * sp; s.vz = s.slideDz * sp;
    } else {
      const target = MOVE.speed * m;
      const tx = wx * target, tz = wz * target;
      const acc = (len === 0 ? MOVE.groundFriction : s.onGround ? MOVE.groundAccel : MOVE.airAccel) * dt;
      const dx = tx - s.vx, dz = tz - s.vz, dd = Math.hypot(dx, dz);
      if ((len === 0 || s.dive) && !s.onGround) { /* keep air momentum (dive keeps its leap) */ }
      else if (dd <= acc) { s.vx = tx; s.vz = tz; }
      else { s.vx += dx / dd * acc; s.vz += dz / dd * acc; }
    }
    if (inp.jump && !jumpUsed && s.onGround && !frozen && !lock && s.stance !== 2) { s.vy = MOVE.jumpSpeed; s.onGround = false; s.slideT = 0; }
    s.vy -= MOVE.gravity * adt;
  }

  const h = heightOf(s);
  s.onGround = false;
  moveAxis(s, 'x', s.vx * dt, boxes, r, h, wasGround);
  moveAxis(s, 'z', s.vz * dt, boxes, r, h, wasGround);
  s.x = Math.max(-bound + r, Math.min(bound - r, s.x));
  s.z = Math.max(-bound + r, Math.min(bound - r, s.z));
  moveAxis(s, 'y', s.vy * adt, boxes, r, h, wasGround);
  if (s.y <= 0) { s.y = 0; if (s.vy < 0) s.vy = 0; s.onGround = true; }
  if (s.onGround) s.dive = 0;
  if (s.air && s.onGround) s.air = false;
}

// true if a standing player at (x,z) on the floor collides with any box
export function blockedAt(x, z, boxes, y = 0) {
  const s = { x, y, z };
  for (const b of boxes) if (overlaps(s, b, MOVE.radius, MOVE.height)) return true;
  return false;
}
