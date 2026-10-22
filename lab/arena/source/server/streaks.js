// SCORESTREAKS (server). Owns every streak entity (planes, devices, shells, missiles, chopper, ODIN) and the "views" (Predator / Chopper camera).
//  earning : Game.award() -> onScore(); score of the CURRENT life fills the loadout streaks, dying clears the score but keeps earned streaks
//  using   : input `streak` = slot 0..2 (keys 1 / 2 / 3) -> activate()
//  hits    : combat.js / abilities.js ask hostileEnts() so regular bullets can destroy streak entities (HP from shared/streaks.js)
//  kills made by a streak are credited to its owner for only +25 ("Scorestreaks kill")
import { STREAKS, SK, SPECIAL_THROWS, STREAK_SLOTS } from '../shared/streaks.js';
import { PLAYER, DT } from '../shared/constants.js';
import { forwardVec, rayWorld, raySphere, rayAABB, mulberry32 } from '../shared/geometry.js';
import { eyeOf } from './combat.js';
import { ServerPlayer } from './player.js';
import { BotBrain } from './bot.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const GRAV = 20, PHONE = ['uav', 'echelon', 'odin'];                          // streaks that play the radio / phone animation
const ZERO_INPUT = ['forward', 'backward', 'left', 'right', 'jump', 'slide', 'crouch', 'prone', 'fire', 'aim', 'reload', 'plate', 'skill', 'throw', 'use', 'interact'];

export class Streaks {
  constructor(game) { this.g = game; this.ents = []; this.nid = 1; this.odin = null; this.echN = 0; }
  reset() { for (const p of this.g.players.values()) this.clearView(p, true); for (const p of [...this.g.players.values()]) if (p.echelonOwner) this.g.players.delete(p.id); this.ents.length = 0; this.odin = null; }
  tm(team) { return team === 'red' ? 0 : 1; }
  // ---------------------------------------------------------------- earning
  onScore(p) {
    if (!p.streakSet) return;
    for (const id of p.streakSet) {
      if (p.streakGot.has(id) || p.lifeScore < STREAKS[id].cost) continue;
      p.streakGot.add(id); if (!p.streakHave.includes(id)) { p.streakHave.push(id); this.g.emitTo(p, 'streak:ready', { id }); }
    }
  }
  onDeath(p) { p.lifeScore = 0; p.streakGot.clear(); p.special = null; this.clearView(p, true); }
  // applied at every spawn: the loadout of the next life (earned streaks that are no longer in the loadout are dropped)
  applyLoadout(p) {
    p.streakSet = (p.nextStreaks || []).filter(id => STREAKS[id]).slice(0, STREAK_SLOTS);
    p.streakHave = p.streakHave.filter(id => p.streakSet.includes(id));
  }
  // ---------------------------------------------------------------- input (called by Game.processInput BEFORE movement / weapons)
  handleInput(p, inp) {
    if (p.echelonOwner) { this.echelonFire(p, inp); inp.fire = false; return; }
    const v = p.view, g = this.g;
    if (v) {                                                                // camera views: the body stays put, the mouse aims the camera
      v.fire = !!inp.fire; v.fireEdge = v.fire && !v.firePrev; v.firePrev = v.fire; v.useEdge = !!inp.use && !v.usePrev; v.usePrev = !!inp.use;
      for (const k of ZERO_INPUT) inp[k] = false; inp.slot = -1; return;
    }
    if (inp.streak >= 0 && inp.streak !== p.streakPrevSlot) this.useSlot(p, inp.streak);
    p.streakPrevSlot = inp.streak;
    if (p.special) {                                                        // a Trophy / Charger / Beacon is in your hands: G throws it instead of a normal throwable
      const edge = !!inp.throw && !p.skThrowPrev; p.skThrowPrev = !!inp.throw; inp.throw = false;
      if (edge && p.alive && !p.down && !p.air && p.empT <= 0) this.throwSpecial(p);
    }
  }
  useSlot(p, slot) {
    const g = this.g, id = p.streakSet && p.streakSet[slot];
    if (!id || !p.streakHave.includes(id) || g.phase !== 'match' || !g.combatOn() || !p.alive || p.down || p.air || p.heli || p.view || p.empT > 0) return false;
    if (SPECIAL_THROWS.includes(id) && p.special) return false;
    if (id === 'odin' && this.odin) return false;
    if (!this.activate(p, id)) return false;
    p.streakHave.splice(p.streakHave.indexOf(id), 1);
    g.emitTo(p, 'streak:use', { id, anim: PHONE.includes(id) ? 1 : 0 });
    return true;
  }
  activate(p, id) {
    const g = this.g;
    switch (id) {
      case 'uav': this.spawnPlane(p, 'uav'); return true;
      case 'predator': { const e = this.spawnPlane(p, 'predator'); p.view = { kind: 'predator', ent: e, t: 0, left: SK.predator.missiles, ph: 'cam', missile: null, exitT: 0, fire: false, firePrev: true, usePrev: true }; return true; }
      case 'artillery': case 'trophy': case 'charger': p.special = id; return true;
      case 'chopper': return this.startChopper(p);
      case 'emp': this.emp(p); return true;
      case 'odin': this.odin = { owner: p, t: 0, id: this.nid++ }; g.emitAll('odin:start', { time: SK.odin.time, by: p.team, name: p.name }); return true;
      case 'echelon': this.spawnEchelon(p); return true;
    }
    return false;
  }
  // ---------------------------------------------------------------- entities
  add(kind, owner, props) { const S = STREAKS[kind], e = { id: this.nid++, kind, owner, team: owner.team, x: 0, y: 0, z: 0, hp: S ? S.hp || 0 : 0, maxHp: S ? S.hp || 0 : 0, r: 1.2, t: 0, hd: 0, ...props }; this.ents.push(e); return e; }
  remove(e) { const i = this.ents.indexOf(e); if (i >= 0) this.ents.splice(i, 1); }
  // enemy entities that bullets / explosions can hit: anything with hit points (planes, devices, chopper) - not shells, missiles or ODIN
  hostileEnts(team) { return this.ents.filter(e => e.maxHp > 0 && e.team !== team); }
  damageEnt(e, att, dmg) {
    if (!this.ents.includes(e) || e.maxHp <= 0) return;
    e.hp -= dmg; if (e.hp <= 0) this.destroy(e, att);
  }
  destroy(e, att) {
    this.remove(e); this.g.emitAll('boom', { k: 'streak', x: e.x, y: e.y, z: e.z, r: e.kind === 'chopper' ? 9 : e.kind === 'uav' || e.kind === 'predator' ? 7 : 3 });
    this.g.emitAll('streak:down', { kind: e.kind, by: att ? att.name : '' });
  }
  spawnPlane(p, kind) {
    const B = this.g.map.bound || 68, a = Math.random() * Math.PI * 2, R = B * 1.15, alt = SK[kind].alt;
    return this.add(kind, p, { sx: Math.cos(a) * R, sz: Math.sin(a) * R, ex: -Math.cos(a) * R, ez: -Math.sin(a) * R, y: alt, x: Math.cos(a) * R, z: Math.sin(a) * R, life: SK[kind].life + (kind === 'predator' ? SK.predator.exitHold : 0), r: 3.6, pings: 0, hd: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }
  // ---------------------------------------------------------------- special throws (Trophy / Charger / Beacon)
  throwSpecial(p) {
    const id = p.special; p.special = null;
    const e = eyeOf(p), d = forwardVec(p.yaw, p.pitch), s = SK.throwSpeed;
    this.add('sthrow', p, { what: id, x: e[0] + d[0] * 0.5, y: e[1] + d[1] * 0.5 - 0.1, z: e[2] + d[2] * 0.5, vx: d[0] * s + p.vx * 0.4, vy: d[1] * s + 4, vz: d[2] * s + p.vz * 0.4, r: 0.15 });
    this.g.emitTo(p, 'throw', { kind: 'frag' });
  }
  stepThrow(e, dt, boxes) {
    e.t += dt; e.vy -= GRAV * dt; const R = 0.15;
    for (const ax of ['x', 'y', 'z']) {
      const d = e['v' + ax] * dt; e[ax] += d; let hit = false;
      if (ax === 'y' && e.y < R) { e.y = R; hit = true; }
      else for (const b of boxes) if (e.x + R > b.x0 && e.x - R < b.x1 && e.y + R > b.y0 && e.y - R < b.y1 && e.z + R > b.z0 && e.z - R < b.z1) { e[ax] = d > 0 ? b[ax + '0'] - R - 1e-3 : b[ax + '1'] + R + 1e-3; hit = true; break; }
      if (hit) return this.land(e);
    }
    const B = this.g.map.bound || 68; e.x = Math.max(-B, Math.min(B, e.x)); e.z = Math.max(-B, Math.min(B, e.z));
    if (e.t > 6) this.remove(e);
  }
  land(e) {
    this.remove(e); const o = e.owner, y = e.y, id = e.what;
    if (id === 'artillery') this.add('beacon', o, { x: e.x, y, z: e.z, shells: SK.artillery.shells, next: SK.artillery.delay, fog: 0 });
    else if (id === 'trophy') this.add('trophy', o, { x: e.x, y: y + 0.2, z: e.z, r: 0.7, zaps: 0, life: SK.trophy.life });
    else if (id === 'charger') this.add('charger', o, { x: e.x, y: y + 0.2, z: e.z, r: 0.9, life: SK.charger.life, acc: 0 });
  }
  // ---------------------------------------------------------------- shared hitscan (Attack Chopper minigun, Reserved Echelon)
  shoot(att, origin, dir, dmg, name, hostile, range = 160) {
    const g = this.g, world = g.worldBoxes(); let best = rayWorld(origin, dir, world, range), hit = null, head = false;
    for (const q of g.players.values()) {
      if (q === att || !q.alive || q.heli || !hostile(q)) continue;
      const st = q.stance || 0, s = q.slideT > 0, bh = s ? PLAYER.slideBodyHeight : PLAYER.bodyH[st], hy = s ? PLAYER.slideHeadY : PLAYER.headYs[st], hw = st === 2 ? 0.55 : PLAYER.bodyHalf;
      const tb = rayAABB(origin, dir, q.x - hw, q.y, q.z - hw, q.x + hw, q.y + bh, q.z + hw, best), th = raySphere(origin, dir, q.x, q.y + hy, q.z, PLAYER.headRadius, best);
      if (th < Infinity && th <= tb + 0.2) { if (th < best) { best = th; hit = q; head = true; } } else if (tb < best) { best = tb; hit = q; head = false; }
    }
    let ent = null;
    for (const e of this.ents) { if (e.maxHp <= 0 || e.team === att.team) continue; const t = raySphere(origin, dir, e.x, e.y, e.z, e.r, best); if (t < best) { best = t; ent = e; hit = null; } }
    if (hit) g.damage(hit, att, head ? dmg * 1.5 : dmg, { head, weapon: '', wn: name, streak: true });
    else if (ent) this.damageEnt(ent, att, dmg);
    return { end: [origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best], hit };
  }
  // ---------------------------------------------------------------- Attack Chopper
  startChopper(p) {
    const B = this.g.map.bound || 68, a = Math.random() * Math.PI * 2, R = B * 0.5;
    const e = this.add('chopper', p, { ang: a, cx: 0, cz: 0, rad: R, y: SK.chopper.alt, x: Math.cos(a) * R, z: Math.sin(a) * R, r: 4.5, life: SK.chopper.life });
    p.view = { kind: 'chopper', ent: e, t: 0, ammo: SK.chopper.ammo, cd: 0, shots: 0, saved: { x: p.x, y: p.y, z: p.z }, fire: false, firePrev: true, useEdge: false, usePrev: true, protect: p.protectUntil };
    p.heli = true; p.protectUntil = Infinity; p.vx = p.vy = p.vz = 0; p.x = e.x; p.y = e.y; p.z = e.z; return true;
  }
  clearView(p, destroyEnt) {
    const v = p.view; if (!v) return; p.view = null;
    if (v.kind === 'chopper') { p.heli = false; p.protectUntil = v.protect || 0; if (p.alive) { p.x = v.saved.x; p.y = v.saved.y; p.z = v.saved.z; p.vx = p.vy = p.vz = 0; p.onGround = true; } }
    if (destroyEnt) { if (v.ent && this.ents.includes(v.ent)) this.destroy(v.ent, null); if (v.missile) this.remove(v.missile); }
    this.g.emitTo(p, 'view:end', { kind: v.kind });
  }
  // ---------------------------------------------------------------- EMP
  emp(owner) {
    const g = this.g;
    for (const e of this.ents.slice()) if (e.team !== owner.team && e.kind !== 'beacon' && e.kind !== 'shell' && e.kind !== 'sthrow' && e.kind !== 'missile') this.destroy(e, owner);        // every enemy scorestreak
    for (const q of g.players.values()) if (q.alive && g.mode.hostile(owner, q)) { q.empT = SK.emp.time; q.special = null; }
    g.emitAll('emp', { by: owner.team, time: SK.emp.time });
  }
  // ---------------------------------------------------------------- Reserved Echelon
  spawnEchelon(owner) {
    const g = this.g, B = g.map.bound || 68, E = SK.echelon;
    for (let i = 0; i < E.count; i++) {
      const id = `ech${++this.echN}`, b = new ServerPlayer(id, 'Echelon', { emit() {}, on() {} });
      b.team = owner.team; b.echelonOwner = owner; b.bot = new BotBrain(g, { loot: false, slow: true }); g.players.set(id, b); g.spawnPlayer(b, { protect: 0 });
      const a = i / E.count * Math.PI * 2 + Math.random(), r = rnd(4, 16);
      b.x = Math.cos(a) * r; b.z = Math.sin(a) * r; b.y = 70 + i * 3; b.air = true; b.onGround = false; b.vx = b.vz = 0; b.vy = 0;
      b.hp = E.hp; b.armor = E.armor; b.maxArmor = E.armor; b.eT = 0; b.eCd = 0;
      b.bot.landing = { x: b.x * 0.4, z: b.z * 0.4, y: 0, t: g.now + 1e6 };
    }
  }
  echelonFire(p, inp) {
    const g = this.g, E = SK.echelon;
    p.ws.guns[p.ws.slot].mag = 99; p.ws.guns[p.ws.slot].reserve = 999;
    p.eCd -= DT; if (!inp.fire || p.eCd > 0 || p.air || !g.combatOn()) return;
    p.eCd = E.shotEvery;
    const o = eyeOf(p), d = forwardVec(p.yaw, p.pitch);
    if (Math.random() < E.miss) { d[0] += rnd(-0.12, 0.12); d[1] += rnd(0.08, 0.15); d[2] += rnd(-0.12, 0.12); }                    // 35 % of the shots miss
    const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
    const r = this.shoot(p, o, d, E.dmg, 'Reserved Echelon', (q) => g.mode.hostile(p, q), 90);
    g.emitAll('shot', { id: p.id, w: p.ws.guns[p.ws.slot].id, o, e: [r.end] });
  }
  echelonDied(a, v, o) {
    v.alive = false; v.hp = 0; const g = this.g;
    g.emitAll('kill', { k: a ? a.id : null, kn: a ? a.name : '', kt: a ? a.team : '', v: v.id, vn: 'Echelon', vt: v.team, w: o.weapon || '', wn: o.wn || '', h: false });
    g.players.delete(v.id);
  }
  // ---------------------------------------------------------------- tick
  tick(dt) {
    const g = this.g; if (g.phase !== 'match') return;
    for (const p of g.players.values()) { if (p.empT > 0) p.empT = Math.max(0, p.empT - dt); if (p.echelonOwner) this.tickEchelon(p, dt); }
    const boxes = g.worldBoxes(), abil = g.abil;
    for (const e of this.ents.slice()) {
      if (!this.ents.includes(e)) continue;
      switch (e.kind) {
        case 'sthrow': this.stepThrow(e, dt, boxes); break;
        case 'uav': case 'predator': this.tickPlane(e, dt); break;
        case 'beacon': this.tickBeacon(e, dt); break;
        case 'shell': this.tickShell(e, dt, boxes); break;
        case 'trophy': this.tickTrophy(e, dt); break;
        case 'charger': this.tickCharger(e, dt); break;
        case 'chopper': e.t += dt; e.ang += SK.chopper.omega * dt; e.x = e.cx + Math.cos(e.ang) * e.rad; e.z = e.cz + Math.sin(e.ang) * e.rad; e.hd = Math.atan2(-Math.sin(e.ang), Math.cos(e.ang)) + Math.PI; if (e.t >= e.life && !(e.owner.view && e.owner.view.ent === e)) this.remove(e); break;
        case 'missile': this.tickMissile(e, dt, boxes); break;
      }
    }
    for (const p of g.players.values()) if (p.view) this.tickView(p, dt);
    if (this.odin) this.tickOdin(dt);
  }
  tickEchelon(b, dt) {
    b.eT += dt; if (b.eT > SK.echelon.life) { b.hp -= SK.echelon.drain * dt; if (b.hp <= 0 && b.alive) this.g.kill(null, b, { cause: 'echelon' }); }                // worn out: -10 hp / s
  }
  tickPlane(e, dt) {
    e.t += dt; const k = Math.min(1, e.t / e.life); e.x = e.sx + (e.ex - e.sx) * k; e.z = e.sz + (e.ez - e.sz) * k;
    if (e.kind === 'uav') {
      while (e.pings < SK.uav.pings.length && e.t >= SK.uav.pings[e.pings]) { e.pings++; this.ping(e); }                  // 4 / 8 / 12 / 16 / 20 s: the last ping is the moment it leaves
    }
    if (e.t >= e.life) this.remove(e);
  }
  // UAV ping: every living enemy is marked for markT seconds at their LIVE position (the same marks the Scout Pulse uses: a red silhouette through walls)
  ping(e) {
    const g = this.g, until = g.now + SK.uav.markT, foes = [...g.players.values()].filter(q => q.alive && !q.heli && q.team !== e.team);
    for (const q of g.players.values()) if (q.team === e.team && !q.echelonOwner) { for (const f of foes) q.marks.set(f.id, until); g.emitTo(q, 'uav:ping', { n: foes.length, t: SK.uav.markT }); }
  }
  tickBeacon(e, dt) {
    e.t += dt; const A = SK.artillery;
    if (e.shells > 0) { e.next -= dt; while (e.next <= 0 && e.shells > 0) { e.next += A.interval; e.shells--; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * A.spread; this.add('shell', e.owner, { x: e.x + Math.cos(a) * r, y: e.y + 130, z: e.z + Math.sin(a) * r, r: 0.4 }); } }
    else if (e.t > A.delay + A.shells * A.interval + A.fog) this.remove(e);
  }
  tickShell(e, dt, boxes) {
    const A = SK.artillery, d = A.fall * dt, t = rayWorld([e.x, e.y, e.z], [0, -1, 0], boxes, d + 0.3);
    if (t < d + 0.3 || e.y - d <= 0.05) { const y = t < d + 0.3 ? e.y - t : 0.05; this.remove(e); this.blast(e.owner, { x: e.x, y, z: e.z }, A.blast, A.dmg, 'Artillery Beacon', A.minDmg); return; }
    e.y -= d;
  }
  // explosion that hurts enemies of the owner: `dmg` at the centre falling to `minDmg` at the edge of `radius`
  blast(owner, at, radius, dmg, name, minDmg = dmg * 0.25, kind = 'artillery') { this.g.abil.blast(owner, at, radius, dmg, { name, streak: true, minFrac: minDmg / dmg }); this.g.emitAll('boom', { k: kind, x: at.x, y: at.y, z: at.z, r: radius }); }
  // projectiles the Trophy System can destroy: enemy grenades etc. (abilities.proj), artillery shells and Predator missiles - never ODIN
  tickTrophy(e, dt) {
    e.life -= dt; e.t += dt; if (e.life <= 0) return this.remove(e);
    const R = SK.trophy.range, hit = (x, y, z) => Math.hypot(x - e.x, y - e.y, z - e.z) <= R, abil = this.g.abil;
    const zap = (x, y, z) => { e.zaps++; this.g.emitAll('trophy', { x, y, z, ox: e.x, oy: e.y + 0.8, oz: e.z }); this.blast(e.owner, { x, y, z }, SK.trophy.blast, SK.trophy.dmg, 'Trophy System', SK.trophy.minDmg, 'trophy'); };       // white beam + a small blast (10-30 damage) where the projectile dies
    for (const pr of abil.proj.slice()) { if (e.zaps >= SK.trophy.shots) break; if (pr.stuck || !pr.owner || pr.owner.team === e.team || !hit(pr.x, pr.y, pr.z)) continue; abil.proj.splice(abil.proj.indexOf(pr), 1); zap(pr.x, pr.y, pr.z); }
    for (const o of this.ents.slice()) { if (e.zaps >= SK.trophy.shots) break; if ((o.kind !== 'shell' && o.kind !== 'missile' && o.kind !== 'sthrow') || o.team === e.team || !hit(o.x, o.y, o.z)) continue; this.remove(o); zap(o.x, o.y, o.z); }
    if (e.zaps >= SK.trophy.shots) this.remove(e);
  }
  tickCharger(e, dt) {
    e.life -= dt; if (e.life <= 0) return this.remove(e);
    e.acc += dt; while (e.acc >= SK.charger.every) { e.acc -= SK.charger.every; for (const q of this.g.players.values()) if (q.alive && !q.down && q.team === e.team && !q.echelonOwner && Math.hypot(q.x - e.x, q.z - e.z) <= SK.charger.range && Math.abs(q.y - e.y) < 3) { q.armor = Math.min(q.maxArmor, q.armor + SK.charger.armor); q.hp = Math.min(PLAYER.maxHealth, q.hp + SK.charger.health); } }
  }
  // ---------------------------------------------------------------- Predator: camera + 2 guided missiles
  tickView(p, dt) {
    const v = p.view, g = this.g;
    if (!p.alive) return this.clearView(p, true);
    v.t += dt;
    if (v.kind === 'chopper') {
      const e = v.ent; if (!this.ents.includes(e) || v.t >= SK.chopper.life || v.useEdge) return this.clearView(p, true);
      p.x = e.x; p.y = e.y; p.z = e.z;
      if (v.fire && v.ammo > 0) {
        v.cd -= dt; const per = 60 / SK.chopper.rpm, o = [e.x, e.y - 1.8, e.z], rng = mulberry32((p.simT * 1000 | 0) + v.shots);
        while (v.cd <= 0 && v.ammo > 0) {
          v.cd += per; v.ammo--; v.shots++;
          const d = forwardVec(p.yaw, Math.min(0.05, p.pitch)); d[0] += (rng() - 0.5) * SK.chopper.spread * 2; d[1] += (rng() - 0.5) * SK.chopper.spread * 2; d[2] += (rng() - 0.5) * SK.chopper.spread * 2;
          const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
          const r = this.shoot(p, o, d, SK.chopper.dmg, 'Attack Chopper', (q) => g.mode.hostile(p, q), 220);
          g.emitAll('shot', { id: p.id, w: 'm134', o, e: [r.end] });                                                 // every round: tracer + sound for everybody else
        }
      } else v.cd = Math.min(0, v.cd);
      return;
    }
    // predator
    const S = SK.predator;
    if (v.exitT > 0) { v.exitT -= dt; if (v.exitT <= 0) this.clearView(p, true); return; }
    if (!this.ents.includes(v.ent)) return this.clearView(p, true);                                               // the UAV was shot down: the view ends at once
    if (v.ph === 'missile') {
      if (!v.missile || !this.ents.includes(v.missile)) { v.missile = null; v.left--; v.ph = 'cam'; if (v.left <= 0) v.exitT = S.exitHold; }                  // missile exploded (or was destroyed)
    } else if (v.fireEdge && v.left > 0 && v.t < S.life) {
      const d = forwardVec(p.yaw, Math.min(-0.12, p.pitch)), e = v.ent;
      v.missile = this.add('missile', p, { x: e.x, y: e.y - 1, z: e.z, dx: d[0], dy: d[1], dz: d[2], r: 0.5, life: 14 }); v.ph = 'missile';
    }
    if (v.t >= S.life && v.exitT <= 0) v.exitT = S.exitHold;                                                       // fuel is gone: 2 more seconds in the camera, then back to the game
    v.fireEdge = false;
  }
  tickMissile(e, dt, boxes) {
    const S = SK.predator, o = e.owner, v = o.view; e.life -= dt;
    if (v && v.missile === e && o.alive) {                                                                          // steer toward where the mouse points
      const w = forwardVec(o.yaw, o.pitch), k = Math.min(1, S.turn * dt);
      let dx = e.dx + (w[0] - e.dx) * k, dy = e.dy + (w[1] - e.dy) * k, dz = e.dz + (w[2] - e.dz) * k; const l = Math.hypot(dx, dy, dz) || 1; e.dx = dx / l; e.dy = dy / l; e.dz = dz / l;
    }
    const step = S.missileSpeed * dt, t = rayWorld([e.x, e.y, e.z], [e.dx, e.dy, e.dz], boxes, step + 0.4);
    let boom = e.life <= 0 || t < step + 0.4 || e.y < 0.2;
    if (!boom) for (const q of this.g.players.values()) if (q.alive && !q.heli && this.g.mode.hostile(o, q) && Math.hypot(q.x - e.x, q.y + 0.9 - e.y, q.z - e.z) < 1.3) { boom = true; break; }
    if (!boom) for (const q of this.hostileEnts(o.team)) if (Math.hypot(q.x - e.x, q.y - e.y, q.z - e.z) < q.r + 0.5) { boom = true; this.damageEnt(q, o, S.dmg); break; }
    if (boom) { this.remove(e); this.blast(o, { x: e.x + e.dx * Math.min(step, t), y: e.y + e.dy * Math.min(step, t), z: e.z + e.dz * Math.min(step, t) }, S.blast, S.dmg, 'UAV Predator', S.minDmg); return; }
    e.x += e.dx * step; e.y += e.dy * step; e.z += e.dz * step;
  }
  // ---------------------------------------------------------------- ODIN
  // impact at 0 -> `afterglow` seconds of violent shake + white-out (clients) -> THEN the match ends with the caller's team winning
  tickOdin(dt) {
    const o = this.odin, g = this.g; o.t += dt;
    if (o.t < SK.odin.time) return;
    if (!o.hit) { o.hit = true; o.hitT = 0; g.emitAll('odin:boom', { time: SK.odin.afterglow }); return; }
    o.hitT += dt; if (o.hitT < SK.odin.afterglow) return;
    this.odin = null;
    g.endMatch(o.owner.team, `${o.owner.name} called in the Orbital Defense Initiative`);
    for (const p of g.players.values()) if (p.alive) { p.alive = false; p.hp = 0; p.deaths++; this.clearView(p, true); }               // everybody dies; the caller's team wins
  }
  // ---------------------------------------------------------------- snapshot data
  snap() {
    const o = this.odin;
    return {
      sk: this.ents.map(e => ({ id: e.id, k: e.kind, x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2), hp: e.maxHp ? +(e.hp / e.maxHp).toFixed(2) : 1, tm: this.tm(e.team), hd: +(e.hd || 0).toFixed(2), w: e.what || '', dx: e.dx === undefined ? 0 : +e.dx.toFixed(2), dy: e.dy === undefined ? 0 : +e.dy.toFixed(2), dz: e.dz === undefined ? 0 : +e.dz.toFixed(2), n: e.zaps || 0 })),
      odin: o ? { left: +Math.max(0, SK.odin.time - o.t).toFixed(2), alt: SK.odin.alt, by: o.owner.team, name: o.owner.name, hit: !!o.hit } : null,
    };
  }
  you(p) {
    const v = p.view, S = SK.predator;
    return { have: p.streakHave, set: p.streakSet, ls: p.lifeScore, sp: p.special, emp: +p.empT.toFixed(1),
      view: v ? (v.kind === 'chopper' ? { k: 'chopper', x: v.ent.x, y: v.ent.y, z: v.ent.z, fuel: +Math.max(0, 1 - v.t / SK.chopper.life).toFixed(3), ammo: v.ammo }
        : { k: 'predator', ph: v.ph, fuel: +Math.max(0, 1 - v.t / S.life).toFixed(3), left: v.left, ex: v.exitT > 0 ? 1 : 0, x: v.ent.x, y: v.ent.y, z: v.ent.z, m: v.missile ? [+v.missile.x.toFixed(2), +v.missile.y.toFixed(2), +v.missile.z.toFixed(2), +v.missile.dx.toFixed(3), +v.missile.dy.toFixed(3), +v.missile.dz.toFixed(3)] : null }) : null };
  }
}
