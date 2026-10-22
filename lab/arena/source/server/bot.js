// AI BOT BRAIN. A bot is a regular ServerPlayer; every tick its brain produces an ordinary input object that goes through the
// same queue / processInput / stepMove / fireWeapon path as a human's, so bots obey every rule (damage, downed, ring, loot ...).
//
// Behaviour (Battle Royale): jump out of the helicopter after a short random delay, glide to a crate (or into the ring),
// open crates (F) and pick up a weapon, then follow the navigation graph (the pre-computed path network of the map) toward
// the nearest enemy while avoiding the ring. Near an enemy it faces it, fires without aiming down sights, and strafes left / right.
// It jumps and slides every few seconds, drinks armor plates when safe, uses a Self-Revive Kit when downed and revives teammates.
import { getNav } from '../shared/nav.js';
import { BR, DOWN } from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { ITEM } from '../shared/loot.js';
import { eyeHeightOf } from '../shared/movement.js';
import { rayWorld } from '../shared/geometry.js';

const FIGHT_RANGE = 60, STRAFE_RANGE = 45, KEEP_DISTANCE = 9, rnd = (a, b) => a + Math.random() * (b - a);
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);                 // forward at yaw 0 is -z
const armed = (p) => p.ws.guns.some(g => !WEAPONS[g.id].unarmed);

export class BotBrain {
  constructor(game, opts = {}) {
    this.g = game; this.seq = 1; this.opts = opts;
    this.heliAt = 0; this.jumpAt = 0; this.slideAt = 0; this.slideUntil = 0; this.strafeDir = 1; this.strafeAt = 0;
    this.goal = null; this.goalAt = 0; this.field = null; this.fieldNode = -2; this.fieldAt = -9; this.lastPos = null; this.lastPosT = 0; this.unstickUntil = 0; this.unstickDir = 1; this.useToggle = 0; this.landing = null;
  }
  get nav() { return getNav(this.g.map); }

  // ---- helpers
  enemies(p) { const out = []; for (const q of this.g.players.values()) if (q !== p && q.alive && !q.heli && !q.air && this.g.mode.hostile(p, q)) out.push(q); return out; }
  nearest(p, list) { let b = null, bd = Infinity; for (const q of list) { const d = Math.hypot(q.x - p.x, q.z - p.z) + Math.abs(q.y - p.y) * 2; if (d < bd) { bd = d; b = q; } } return b ? { o: b, d: bd } : null; }
  ringInfo() { const m = this.g.mode; return m.ring || (m.ringAt ? m.ringAt(this.g.now - m.t0) : null); }
  // clear line of sight to an enemy? (walls block it; a bot behind cover keeps walking around it instead of standing still)
  los(p, q) {
    const now = this.g.now; if (this.losT && now - this.losT < 0.2 && this.losQ === q) return this.losV;
    const o = [p.x, p.y + eyeHeightOf(p), p.z], t = [q.x, q.y + 1.0, q.z], d = [t[0] - o[0], t[1] - o[1], t[2] - o[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
    this.losV = rayWorld(o, [d[0] / l, d[1] / l, d[2] / l], this.g.worldBoxes(), l) >= l - 0.4; this.losT = now; this.losQ = q; return this.losV;
  }
  // direction (world x/z) to walk toward a point along the navigation graph; straight line when there is no path info
  follow(p, tx, ty, tz) {
    const nav = this.nav, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz); if (d < 1.2) return [dx / (d || 1), dz / (d || 1), d];
    const tn = nav.nodeAt(tx, ty, tz), pn = nav.nodeAt(p.x, p.y, p.z), now = this.g.now;
    if (tn < 0 || pn < 0) return [dx / d, dz / d, d];
    if (tn !== this.fieldNode && now - this.fieldAt > 1) { this.field = nav.field(tn); this.fieldNode = tn; this.fieldAt = now; }
    if (!this.field || this.fieldNode !== tn || this.field[pn] >= 65535) return [dx / d, dz / d, d];
    const nx = nav.pos(nav.next(pn, this.field, 2)), ex = nx[0] - p.x, ez = nx[2] - p.z, el = Math.hypot(ex, ez);
    return el > 0.05 ? [ex / el, ez / el, d] : [dx / d, dz / d, d];
  }
  // ---- choose where to go (re-evaluated twice a second)
  pickGoal(p) {
    const g = this.g, m = g.mode, ring = this.ringInfo(), loot = m.loot;
    if (ring) {                                                       // 1) the ring always wins
      const dc = Math.hypot(p.x - ring.cx, p.z - ring.cz), edge = ring.r - dc;
      const t = ring.nxt && ring.phase !== 'closing' ? ring.nxt : ring; const dn = Math.hypot(p.x - t.cx, p.z - t.cz);
      if (edge < 0 || edge < 12 || (ring.nxt && ring.next < 20 && dn > t.r * 0.8)) return { type: 'zone', x: t.cx, y: 0, z: t.cz, r: 0 };
    }
    if (p.down) return null;
    const mates = [...g.players.values()].filter(q => q !== p && q.alive && q.down && q.team === p.team && Math.hypot(q.x - p.x, q.z - p.z) < 30);   // 2) revive a downed teammate
    const foe = this.nearest(p, this.enemies(p));
    if (mates.length && (!foe || foe.d > 25)) { const q = this.nearest(p, mates).o; return { type: 'revive', x: q.x, y: q.y, z: q.z, r: 1.5, o: q }; }
    if (loot && this.opts.loot !== false) {                           // 3) no weapon yet -> find one; otherwise grab nearby loot
      const inRing = (o) => !ring || Math.hypot(o.x - ring.cx, o.z - ring.cz) < ring.r - 4;
      const dist = (o) => Math.hypot(o.x - p.x, o.z - p.z) + Math.abs(o.y - p.y) * 2;
      const need = !armed(p), lim = need ? 400 : 28;
      const pick = (arr) => { let b = null, bd = Infinity; for (const o of arr) { const d = dist(o); if (d < bd && d < lim && inRing(o)) { bd = d; b = o; } } return b; };
      const gun = need ? pick(loot.items.filter(i => i.kind === ITEM.GUN)) : null, crate = pick(loot.crates.filter(c => !c.open));
      const it = gun && crate ? (dist(gun) <= dist(crate) ? { t: 'gun', o: gun } : { t: 'crate', o: crate }) : gun ? { t: 'gun', o: gun } : crate ? { t: 'crate', o: crate } : null;
      if (it) return { type: it.t, x: it.o.x, y: it.o.y, z: it.o.z, r: it.t === 'crate' ? 1.6 : 1.3, id: it.o.id };
      if (!need) { const near = pick(loot.items.filter(i => i.kind !== ITEM.GUN)); if (near) return { type: 'item', x: near.x, y: near.y, z: near.z, r: 0.3 }; }
    }
    const obj = m.botGoal ? m.botGoal(p) : null;                      // 4) Classic objectives (Hardpoint zone, S&D sites / bomb) unless an enemy is in close range, then 5) hunt
    if (obj && (!foe || foe.d > 14)) return { type: 'objective', r: 3, ...obj };          // (it keeps shooting at enemies in range while it runs)
    if (foe && foe.d < 400) return { type: 'enemy', x: foe.o.x, y: foe.o.y, z: foe.o.z, r: KEEP_DISTANCE, o: foe.o };
    if (obj) return { type: 'objective', r: 3, ...obj };
    return ring ? { type: 'zone', x: ring.cx, y: 0, z: ring.cz, r: 4 } : null;
  }

  think(p) {
    const g = this.g, now = g.now, inp = { seq: this.seq++, ep: p.epoch, forward: false, backward: false, left: false, right: false, jump: false, slide: false, reload: false, aim: false, interact: false, use: false, fire: false, plate: false, slot: -1, crouch: false, prone: false, lean: 0, skill: false, throw: false, yaw: p.yaw, pitch: 0, lt: now };
    if (!p.alive) return null;
    // -- downed: use a Self-Revive Kit if there is one (hold V), otherwise wait
    if (p.down) { inp.plate = p.kits > 0; return inp; }
    // -- inside the helicopter: jump out after 1-5 s
    if (p.heli) { if (!this.heliAt) this.heliAt = now + rnd(1, 5); inp.jump = now >= this.heliAt; return inp; }
    this.heliAt = 0;
    // -- gliding: steer toward a crate (or the ring), slow down when too far, dive when right above it
    if (p.air) {
      if (!this.landing || now - this.landing.t > 3) {
        const m = g.mode, ring = this.ringInfo(), crates = (m.loot ? m.loot.crates : []).filter(c => !c.open && (!ring || Math.hypot(c.x - ring.cx, c.z - ring.cz) < ring.r - 6));
        let best = null, bd = Infinity; for (const c of crates) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd && d < 260) { bd = d; best = c; } }
        this.landing = best ? { x: best.x, z: best.z, y: best.y, t: now } : ring ? { x: ring.cx, z: ring.cz, y: 0, t: now } : { x: 0, z: 0, y: 0, t: now };
      }
      const L = this.landing, dx = L.x - p.x, dz = L.z - p.z, d = Math.hypot(dx, dz), H = Math.max(1, p.y - L.y), fallT = H / BR.fall, needT = d / BR.glide;
      inp.yaw = yawTo(dx, dz); inp.pitch = 0; inp.forward = d > 1.5; inp.slide = this.opts.slow || needT > fallT * 1.02; inp.jump = !this.opts.slow && !inp.slide && needT < fallT * 0.45 && d < 40 && H > 12;      // Reserved Echelon (opts.slow): a slow descent
      return inp;
    }
    this.landing = null;
    // -- on the ground
    if (!this.goal || now >= this.goalAt) { this.goal = this.pickGoal(p); this.goalAt = now + 0.5; }
    const G = this.goal, foe = this.nearest(p, this.enemies(p)), ey = p.y + eyeHeightOf(p);
    let moveX = 0, moveZ = 0, face = null, lootAim = false, hold = false;
    if (G) {
      const [mx, mz, d] = this.follow(p, G.x, G.y || p.y, G.z);
      const stop = G.type === 'enemy' && !this.los(p, G.o) ? 1 : (G.r || 0.5);                  // no line of sight: keep following the path to the enemy
      if (d > stop) { moveX = mx; moveZ = mz; }
      face = [mx, mz];
      if ((G.type === 'crate' || G.type === 'gun') && d < 3.6) {                                  // look at it and press F (edge-triggered: alternate ticks)
        const tdx = G.x - p.x, tdz = G.z - p.z, ty = G.y + (G.type === 'crate' ? 0.45 : 0.35), hd = Math.hypot(tdx, tdz);
        inp.yaw = yawTo(tdx, tdz); inp.pitch = Math.atan2(ty - ey, hd); face = null; lootAim = true; this.useToggle = (this.useToggle + 1) % 8; inp.use = this.useToggle < 2;
        if (d < 1.4) { moveX = moveZ = 0; }
      }
      if (G.type === 'revive' && d < DOWN.reviveRange - 0.4) { inp.interact = true; inp.use = true; moveX = moveZ = 0; }
      if (G.type === 'objective' && G.interact && d <= (G.ir || 1.5)) { inp.interact = true; inp.use = true; hold = true; moveX = moveZ = 0; }     // hold F and stand still: plant / defuse
    }
    // -- combat: face the enemy, fire without aiming down sights, strafe
    let fighting = false;
    if (foe && foe.d < FIGHT_RANGE && armed(p) && !(lootAim && foe.d >= 20)) {               // (a crate / gun within reach is looted first unless an enemy is close)
      const q = foe.o, dx = q.x - p.x, dz = q.z - p.z, hd = Math.hypot(dx, dz);
      inp.yaw = yawTo(dx, dz); inp.pitch = Math.atan2(q.y + (q.down ? 0.3 : 1.2) - ey, Math.max(0.5, hd)); face = null; fighting = true;
      const gun = p.ws.guns[p.ws.slot], seen = this.los(p, q) || hd < 6;                           // no shooting at walls: without a clear line it just keeps moving along the path
      if (gun.mag <= 0) { if ((gun.reserve || 0) > 0 || WEAPONS[gun.id].infinite) inp.reload = true; } else if (seen) inp.fire = true;
      if (foe.d < STRAFE_RANGE && !hold && seen) {
        if (now >= this.strafeAt) { this.strafeDir = -this.strafeDir; this.strafeAt = now + rnd(0.5, 1.4); }
        const rx = Math.cos(inp.yaw), rz = -Math.sin(inp.yaw); moveX += rx * this.strafeDir * 0.9; moveZ += rz * this.strafeDir * 0.9;
        if (hd < KEEP_DISTANCE && this.los(p, q)) { moveX -= (dx / hd) * 0.8; moveZ -= (dz / hd) * 0.8; }                    // too close: back off a little
      }
    }
    if (face && (face[0] || face[1])) { inp.yaw = yawTo(face[0], face[1]); inp.pitch = 0; }
    // -- stuck? sidestep + jump
    if (hold) { this.unstickUntil = 0; this.lastPos = null; }
    if (!this.lastPos || now - this.lastPosT > 0.6) {
      if (this.lastPos && G && (moveX || moveZ) && Math.hypot(p.x - this.lastPos[0], p.z - this.lastPos[1]) < 0.35) { this.unstickUntil = now + 0.6; this.unstickDir = Math.random() < 0.5 ? -1 : 1; this.fieldAt = -9; }
      this.lastPos = [p.x, p.z]; this.lastPosT = now;
    }
    // -- convert the world movement vector into forward / right keys relative to the facing yaw
    const fx = -Math.sin(inp.yaw), fz = -Math.cos(inp.yaw), rx2 = Math.cos(inp.yaw), rz2 = -Math.sin(inp.yaw);
    let fw = moveX * fx + moveZ * fz, rt = moveX * rx2 + moveZ * rz2;
    if (now < this.unstickUntil) { rt += this.unstickDir; inp.jump = true; }
    inp.forward = fw > 0.25; inp.backward = fw < -0.25; inp.right = rt > 0.25; inp.left = rt < -0.25;
    // -- periodic jump / slide while moving
    const moving = inp.forward || inp.backward || inp.left || inp.right;
    if (moving && p.onGround) {
      if (now >= this.jumpAt) { inp.jump = true; this.jumpAt = now + rnd(2, 4.5); }
      if (now >= this.slideAt && inp.forward) { this.slideUntil = now + 0.5; this.slideAt = now + rnd(6, 10); }
    }
    if (now < this.slideUntil && inp.forward) { inp.slide = true; inp.crouch = true; }
    // -- armor plate when nothing is going on
    if (!fighting && p.plates > 0 && p.armor < p.maxArmor - 20 && !(foe && foe.d < 35)) inp.plate = true;
    return inp;
  }
}
