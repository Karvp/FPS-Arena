// Server-side hit detection with lag compensation. The server NEVER trusts client damage or origins:
// it uses its own position + the (yaw,pitch) the client aimed with, spreads deterministically, rewinds targets.
import { PLAYER, LAG_COMP_MAX, LEAN } from '../shared/constants.js';
import { WEAPONS, damageAt, spreadFor } from '../shared/weapons.js';
import { forwardVec, spreadDir, mulberry32, hashSeq, rayWorld, rayAABB, raySphere, clamp } from '../shared/geometry.js';
import { eyeHeightOf } from '../shared/movement.js';
import { curGun } from '../shared/weaponstate.js';

// camera / muzzle origin: includes the sideways offset of leaning
export function eyeOf(p) {
  const l = (p.lean || 0) * LEAN.offset;
  return [p.x + Math.cos(p.yaw) * l, p.y + eyeHeightOf(p), p.z - Math.sin(p.yaw) * l];
}
export function recordHistory(game) {
  for (const p of game.players.values()) {
    if (!p.alive) continue;
    p.history.push({ t: game.now, x: p.x, y: p.y, z: p.z, s: p.slideT > 0, st: p.stance || 0, l: p.lean || 0, yaw: p.yaw });
    if (p.history.length > 45) p.history.shift();
  }
}
const cur = (p) => ({ x: p.x, y: p.y, z: p.z, s: p.slideT > 0, st: p.stance || 0, l: p.lean || 0, yaw: p.yaw || 0 });
function poseAt(p, t) {
  const h = p.history;
  if (!h || !h.length || t >= h[h.length - 1].t) return cur(p);
  if (t <= h[0].t) return h[0];
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i - 1].t <= t) {
      const a = h[i - 1], b = h[i], k = (t - a.t) / ((b.t - a.t) || 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, s: k < 0.5 ? a.s : b.s, st: k < 0.5 ? a.st : b.st, l: a.l + (b.l - a.l) * k, yaw: b.yaw };
    }
  }
  return h[0];
}

// Melee: the nearest enemy within reach and inside a ~65 degree cone in front of the player (not behind a wall) takes the weapon's damage.
function meleeStrike(game, shooter, w, eye, dir, targets) {
  let best = null, bd = Infinity; const world = game.worldBoxes();
  for (const t of targets) {
    const p = t.pose, cx = p.x, cy = p.y + (p.s || p.st === 2 ? 0.45 : 1.0), cz = p.z, dx = cx - eye[0], dy = cy - eye[1], dz = cz - eye[2], d = Math.hypot(dx, dy, dz);
    if (d > w.reach || d < 1e-3) continue;
    if ((dx * dir[0] + dy * dir[1] + dz * dir[2]) / d < 0.42) continue;                      // outside the cone in front of you
    if (rayWorld(eye, [dx / d, dy / d, dz / d], world, d) < d - 0.25) continue;               // a wall in between
    if (d < bd) { bd = d; best = t; }
  }
  game.emitAll('melee', { id: shooter.id });
  if (!best) return;
  const q = best.q; if (game.players.get(q.id) === q) game.damage(q, shooter, w.dmg[0], { weapon: w.id }); else game.mode.hitZombie(q, shooter, w.dmg[0], { weapon: w.id });
}
export function fireWeapon(game, shooter, inp) {
  const w = WEAPONS[curGun(shooter.ws).id];
  const eye = eyeOf(shooter);
  const base = forwardVec(shooter.yaw, shooter.pitch);
  const spread = spreadFor(w, shooter.aim, shooter.onGround);
  const lt = clamp(Number.isFinite(inp.lt) ? inp.lt : game.now, game.now - LAG_COMP_MAX, game.now);
  const targets = [];
  for (const q of game.players.values()) if (q !== shooter && q.alive && game.hostile(shooter, q)) targets.push({ q, pose: poseAt(q, lt) });
  const zs = game.mode && game.mode.zombies; if (zs) for (const z of zs) if (z.alive) targets.push({ q: z, pose: poseAt(z, lt) });
  if (w.melee) return meleeStrike(game, shooter, w, eye, base, targets);                       // knife: no bullets, a short-range slash
  const world = game.worldBoxes();
  const hits = new Map(), ends = [], entHits = new Map();
  for (let i = 0; i < w.pellets; i++) {
    const dir = spreadDir(base, shooter.yaw, spread, mulberry32(hashSeq(inp.seq, i)));
    let best = rayWorld(eye, dir, world, w.maxRange), hit = null, head = false;
    for (const t of targets) {
      const { x, y, z, s, st, l, yaw } = t.pose;
      const bh = s ? PLAYER.slideBodyHeight : PLAYER.bodyH[st], hy = s ? PLAYER.slideHeadY : PLAYER.headYs[st], hw = st === 2 ? 0.55 : PLAYER.bodyHalf;
      const sx = Math.cos(yaw) * l * LEAN.offset, sz = -Math.sin(yaw) * l * LEAN.offset;           // a leaning body is shifted sideways
      const tb = rayAABB(eye, dir, x + sx * 0.5 - hw, y, z + sz * 0.5 - hw, x + sx * 0.5 + hw, y + bh, z + sz * 0.5 + hw, best);
      const th = raySphere(eye, dir, x + sx, y + hy, z + sz, PLAYER.headRadius, best);
      if (th < Infinity && th <= tb + 0.2) { if (th < best) { best = th; hit = t; head = true; } }
      else if (tb < best) { best = tb; hit = t; head = false; }
    }
    if (game.streaks) for (const e of game.streaks.hostileEnts(shooter.team)) {                              // planes / devices / chopper can be shot down
      const t = raySphere(eye, dir, e.x, e.y, e.z, e.r, best); if (t < best) { best = t; hit = { ent: e }; head = false; }
    }
    if (ends.length < 3) { const d = Math.min(best, w.tracerRange); ends.push([eye[0] + dir[0] * d, eye[1] + dir[1] * d, eye[2] + dir[2] * d]); }
    if (hit && hit.ent) { const d = damageAt(w, best), a = entHits.get(hit.ent) || 0; entHits.set(hit.ent, a + d); }
    else if (hit) {
      let d = damageAt(w, best); if (head) d *= w.headMul;
      const acc = hits.get(hit.q) || { dmg: 0, head: false };
      acc.dmg += d; acc.head = acc.head || head; hits.set(hit.q, acc);
    }
  }
  game.emitAll('shot', { id: shooter.id, w: w.id, o: eye, e: ends });
  for (const [e, d] of entHits) game.streaks.damageEnt(e, shooter, d);
  for (const [q, acc] of hits) { if (game.players.get(q.id) === q) game.damage(q, shooter, acc.dmg, { head: acc.head, weapon: w.id }); else game.mode.hitZombie(q, shooter, acc.dmg, { head: acc.head, weapon: w.id }); }
}
