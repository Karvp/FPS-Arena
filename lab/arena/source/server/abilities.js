// Skills (energy, T) and throwables (G): server-authoritative. Projectile physics, zones (cryo / gas / foam), blasts, scout pulses, timers.
import { SKILLS, THROWABLES, THROW_LIST, THROW_SPEED, fxOf } from '../shared/skills.js';
import { ENERGY } from '../shared/constants.js';
import { forwardVec, rayWorld } from '../shared/geometry.js';
import { eyeOf } from './combat.js';

const G = 20, R = 0.12, KIND = (k) => THROW_LIST.indexOf(k);
const AX = ['x', 'y', 'z'];

export class Abilities {
  constructor(game) { this.g = game; this.proj = []; this.zones = []; this.pulses = []; this.nid = 1; this.foamBoxes = []; }
  reset() { this.proj.length = 0; this.zones.length = 0; this.pulses.length = 0; this.foamBoxes = []; }
  flags(p) { return { exo: p.exoT > 0 && p.exoCharge <= 0, ka: p.kaT > 0, charge: p.exoCharge > 0, stim: p.stimT > 0, cryo: p.cryoT > 0 ? p.cryoSlow : 0, annih: !!p.annih, lift: !!p.lift }; }

  // ---------------------------------------------------------------- skills
  eligible(p, edge) {
    const sk = SKILLS[p.skill];
    return !!(edge && sk && p.alive && !p.down && !(p.empT > 0) && !p.view && this.g.phase === 'match' && this.g.combatOn() && !p.frozen && !p.air && !p.zl && p.energy >= sk.cost && p.exoCharge <= 0 &&
      !(p.skill === 'exo' && p.exoT > 0) && !(p.skill === 'kinetic' && p.kaT > 0) && !(p.skill === 'polter' && p.polterT > 0) && !(p.skill === 'annih' && p.annih));
  }
  fxFor(p, elig) { const mv = p.skill === 'hook' || p.skill === 'pad'; return fxOf(this.flags(p), mv ? p.skill : null, elig && mv); }
  spend(p) { p.energy = Math.max(0, p.energy - SKILLS[p.skill].cost); this.g.emitTo(p, 'skill', { id: p.skill }); }
  afterMove(p, elig) {                                          // called after stepMove: movement skills succeeded only if the aim was valid
    if (!elig) return;
    const sk = SKILLS[p.skill];
    switch (p.skill) {
      case 'hook': if (p.skEv === 1) this.spend(p); break;
      case 'pad': if (p.skEv === 2) this.spend(p); break;
      case 'exo': this.spend(p); p.exoCharge = sk.charge; p.exoT = sk.duration; break;
      case 'kinetic': this.spend(p); if (p.baseMax == null) p.baseMax = p.maxArmor; p.maxArmor = Math.max(p.maxArmor, sk.maxArmor); p.armor = Math.min(p.maxArmor, p.armor + 100); p.kaT = sk.duration; p.kaAcc = 0; break;
      case 'polter': this.spend(p); p.polterT = sk.duration; break;
      case 'annih': this.spend(p); this.equipAnnih(p); break;
      case 'pulse': this.spend(p); this.pulse(p); break;
    }
  }
  endPolter(p) { if (p && p.polterT > 0) p.polterT = 0; }
  equipAnnih(p) {
    const ws = p.ws, slot = ws.slot; p.annih = { saved: ws.guns[slot], slot, state: 'ready', t: 0 };
    ws.guns[slot] = { id: 'annihilator', mag: 1, reserve: 0 }; ws.reloading = false; ws.burstLeft = 0; ws.switchT = 0.3; ws.cd = Math.max(ws.cd, 0.3); ws.rev++;
  }
  annihFired(p) {                                               // one round: now unarmed for 3 s, then the old weapon comes back
    const a = p.annih; if (!a || a.state !== 'ready') return;
    p.ws.guns[a.slot] = { id: 'fists', mag: 0, reserve: 0 }; p.ws.rev++; a.state = 'cool'; a.t = 3;
  }
  pulse(p) {
    this.pulses.push({ owner: p, x: p.x, y: p.y + 1, z: p.z, r: 0, marked: new Set() });
    this.g.emitAll('pulse', { x: p.x, y: p.y + 1, z: p.z, max: SKILLS.pulse.range, speed: 40 });
  }
  onKill(a) {
    if (!a) return;
    if (a.skill === 'pad') a.energy = Math.max(a.energy, SKILLS.pad.cost);        // kills refresh the leap instead of giving energy
    else a.energy = Math.min(ENERGY.max, a.energy + ENERGY.perKill);
    if (a.exoT > 0 && a.exoCharge <= 0) a.exoT += SKILLS.exo.killBonus;
    if (a.kaT > 0) a.kaT += SKILLS.kinetic.killBonus;                                // Kinetic Armor: +3 s per kill
  }
  onDown(v) { this.clearEffects(v); }                               // downed: every active skill / effect ends, energy is kept
  onDeath(v) { this.clearEffects(v); if (this.g.mode && this.g.mode.rules.energyReset) v.energy = 0; }
  clearEffects(v) {
    if (v.baseMax != null) { v.maxArmor = v.baseMax; v.baseMax = null; }
    this.proj = this.proj.filter(pr => !(pr.kind === 'discharger' && pr.owner === v));       // a Discharger vanishes with its owner
    v.exoCharge = v.exoT = v.kaT = v.polterT = v.stimT = v.cryoT = 0; v.cryoSlow = 0; v.cryoAcc = 0; v.gas = 0; v.gasT = 0; v.lift = false; v.annih = null; v.marks.clear();
  }
  onSpawn(p, rules) {
    this.onDeath(p); p.thr = { id: rules.startThrow ? p.nextThrow : null, n: rules.startThrow || 0 }; p.skill = p.nextSkill;
    p.skillPrevS = false; p.throwPrev = false; p.hk = 0; p.skEv = 0;
  }
  // ---------------------------------------------------------------- throwables (G)
  handleThrow(p, inp) {
    const edge = !!inp.throw && !p.throwPrev; p.throwPrev = !!inp.throw;
    if (!edge || !p.alive || p.down || p.frozen || p.air || p.empT > 0 || p.view || !this.g.combatOn()) return;
    const stuck = this.proj.find(q => q.kind === 'discharger' && q.stuck && q.owner === p);
    if (stuck) return this.explode(stuck, null);                  // G again detonates the Pneumatic Discharger
    if (!p.thr.id || p.thr.n <= 0) return;
    const id = p.thr.id; p.thr.n--; const spd = (THROWABLES[id] && THROWABLES[id].speed) || THROW_SPEED;
    if (id === 'stim') { p.stimT = THROWABLES.stim.duration; p.lastDamageT = -99; p.regenAcc = 0; this.g.emitTo(p, 'throw', { kind: 'stim' }); return; }   // injects: speed + immediate health recovery
    const e = eyeOf(p), d = forwardVec(p.yaw, p.pitch);
    this.proj.push({ id: this.nid++, kind: id, owner: p, x: e[0] + d[0] * 0.5, y: e[1] + d[1] * 0.5 - 0.1, z: e[2] + d[2] * 0.5, vx: d[0] * spd + p.vx * 0.4, vy: d[1] * spd + 4.5, vz: d[2] * spd + p.vz * 0.4,
      age: 0, stuck: false, n: null, hd: [d[0], d[2]] });
    this.g.emitTo(p, 'throw', { kind: id });
  }
  targets(owner) {
    const out = [], g = this.g;
    for (const q of g.players.values()) if (q.alive && q !== owner && (!owner || g.mode.hostile(owner, q))) out.push({ p: q, x: q.x, y: q.y, z: q.z });
    if (g.mode.zombies) for (const z of g.mode.zombies) if (z.alive) out.push({ z, x: z.x, y: z.y, z: z.z });
    return out;
  }
  hurt(t, owner, dmg, o) {
    if (t.p) this.g.damage(t.p, owner, dmg, { cause: 'explosive', ...o });
    else this.g.mode.hitZombie(t.z, owner, dmg, { head: false, weapon: '', ...o });
  }
  blast(owner, at, radius, max, o = {}) {
    const world = this.g.worldBoxes();
    for (const t of this.targets(owner)) {
      const dx = t.x - at.x, dy = t.y + 0.9 - at.y, dz = t.z - at.z, d = Math.hypot(dx, dy, dz), direct = o.direct && (t.p === o.direct || t.z === o.direct);
      if (d > radius && !direct) continue;
      if (!direct && d > 1.2 && rayWorld([at.x, at.y, at.z], [dx / d, dy / d, dz / d], world, d) < d - 0.35) continue;      // walls (and foam) shield from the blast
      const dmg = direct ? o.directDmg : max * (1 - (1 - (o.minFrac ?? 0.25)) * Math.min(1, d / radius));
      this.hurt(t, owner, dmg, { wn: o.name, streak: o.streak });
      if (o.push && t.p) {                                          // Pneumatic Discharger: launch away + up, no ADS while airborne
        const T = THROWABLES.discharger, hl = Math.hypot(dx, dz) || 1; t.p.vx = dx / hl * T.push; t.p.vz = dz / hl * T.push; t.p.vy = T.lift; t.p.onGround = false; t.p.slideT = 0; t.p.dive = 0; t.p.lift = true; t.p.liftGrace = 0.15;
      }
    }
  }
  floorY(x, y, z) { const t = rayWorld([x, y + 0.2, z], [0, -1, 0], this.g.worldBoxes(), 40); return t < 40 ? y + 0.2 - t : 0; }
  addZone(kind, x, y, z, r, t, owner, extra = {}) { const zn = { id: this.nid++, kind, x, y, z, r, t, owner, acc: 0, ...extra }; this.zones.push(zn); this.rebuildFoam(); return zn; }
  rebuildFoam() { this.foamBoxes = this.zones.filter(z => z.kind === 'foam').map(z => z.box); }
  explode(pr, direct) {
    const i = this.proj.indexOf(pr); if (i >= 0) this.proj.splice(i, 1);
    const k = pr.kind, o = pr.owner, at = { x: pr.x, y: pr.y, z: pr.z }, T = THROWABLES[k]; let r = 4;
    if (k === 'frag') { r = T.radius; this.blast(o, at, T.radius, T.dmg, { name: T.name }); }
    else if (k === 'impact') { r = T.radius; this.blast(o, at, T.radius, T.splash, { name: T.name, direct, directDmg: T.direct }); }
    else if (k === 'discharger') { r = T.radius; this.blast(o, at, T.radius, T.dmgMax, { name: T.name, minFrac: T.dmgMin / T.dmgMax, push: true }); }
    else if (k === 'cryo' || k === 'gas') { r = T.radius; this.addZone(k, at.x, this.floorY(at.x, at.y, at.z), at.z, T.radius, T.duration, o); }
    else if (k === 'foam') {
      const y0 = Math.max(0, at.y - 0.4), alongX = Math.abs(pr.hd[0]) > Math.abs(pr.hd[1]);   // wall faces the thrower
      const hl = T.length / 2;                                         // 5.85 m wide (+30 %)
      const box = alongX ? { x0: at.x - 0.25, x1: at.x + 0.25, z0: at.z - hl, z1: at.z + hl, y0, y1: y0 + 3.5, k: 'foam' } : { x0: at.x - hl, x1: at.x + hl, z0: at.z - 0.25, z1: at.z + 0.25, y0, y1: y0 + 3.5, k: 'foam' };
      this.addZone('foam', at.x, y0, at.z, hl, T.duration, o, { box });
    }
    this.g.emitAll('boom', { k, x: at.x, y: at.y, z: at.z, r });
  }
  onContact(pr, hit) {
    if (pr.kind === 'frag') return;                               // bounces
    if (pr.kind === 'discharger') { pr.stuck = true; pr.age = 0; pr.vx = pr.vy = pr.vz = 0; pr.n = [hit.ax === 'x' ? hit.sign : 0, hit.ax === 'y' ? hit.sign : 0, hit.ax === 'z' ? hit.sign : 0]; return; }
    this.explode(pr, null);                                       // impact / cryo / gas / foam burst on contact
  }
  stepProj(pr, dt, boxes) {
    pr.age += dt;
    if (pr.stuck) return;                                           // a placed Discharger waits for its owner (no timer)
    if (pr.kind === 'frag' && pr.age >= THROWABLES.frag.fuse) return this.explode(pr, null);
    pr.vy -= G * dt;
    for (const ax of AX) {
      const d = pr['v' + ax] * dt; if (!d) continue; pr[ax] += d;
      let hit = null;
      if (ax === 'y' && pr.y < R) { pr.y = R; hit = { ax, sign: -1 }; }
      else for (const b of boxes) if (pr.x + R > b.x0 && pr.x - R < b.x1 && pr.y + R > b.y0 && pr.y - R < b.y1 && pr.z + R > b.z0 && pr.z - R < b.z1) {
        pr[ax] = d > 0 ? b[ax + '0'] - R - 1e-3 : b[ax + '1'] + R + 1e-3; hit = { ax, sign: Math.sign(d) }; break;
      }
      if (hit) {
        this.onContact(pr, hit); if (pr.stuck || !this.proj.includes(pr)) return;
        for (const a2 of AX) pr['v' + a2] *= a2 === ax ? -0.45 : 0.85;
      }
    }
    const B = this.g.map.bound || 68; pr.x = Math.max(-B, Math.min(B, pr.x)); pr.z = Math.max(-B, Math.min(B, pr.z));
    if (pr.kind !== 'frag' && pr.kind !== 'discharger') {          // direct hit on a player / zombie
      for (const t of this.targets(pr.owner)) if (Math.abs(pr.x - t.x) < 0.5 && Math.abs(pr.z - t.z) < 0.5 && pr.y > t.y - 0.1 && pr.y < t.y + 1.9) { this.explode(pr, t.p || t.z); return; }
    }
  }

  // ---------------------------------------------------------------- per-tick update
  tick(dt) {
    const g = this.g, now = g.now;
    for (const p of g.players.values()) {
      if (p.gasT > 0) p.gasT -= dt; else if (p.gas > 0) p.gas = Math.max(0, p.gas - dt * 0.5);       // the gas vignette fades 2 s after the last gas damage
      if (p.liftGrace > 0) p.liftGrace -= dt; else if (p.lift && p.onGround) p.lift = false;
      if (!p.alive || !p.spawned) continue;
      p.energy = Math.min(ENERGY.max, p.energy + ENERGY.regen * dt);
      if (p.exoCharge > 0) p.exoCharge = Math.max(0, p.exoCharge - dt); else if (p.exoT > 0) p.exoT = Math.max(0, p.exoT - dt);
      if (p.kaT > 0) {
        p.kaT = Math.max(0, p.kaT - dt); p.kaAcc += dt; const K = SKILLS.kinetic;
        while (p.kaAcc >= K.regenEvery) { p.kaAcc -= K.regenEvery; p.armor = Math.min(p.maxArmor, p.armor + K.regen); }      // +2 armor every 0.1 s
        if (p.kaT <= 0 && p.baseMax != null) { p.maxArmor = p.baseMax; p.baseMax = null; p.armor = Math.min(p.armor, p.maxArmor); }   // normal max armor again
      }
      if (p.polterT > 0) p.polterT = Math.max(0, p.polterT - dt);
      if (p.stimT > 0) p.stimT = Math.max(0, p.stimT - dt);
      if (p.cryoT > 0) p.cryoT = Math.max(0, p.cryoT - dt); else { p.cryoSlow = 0; p.cryoAcc = 0; }
      if (p.annih && p.annih.state === 'cool' && (p.annih.t -= dt) <= 0) { p.ws.guns[p.annih.slot] = p.annih.saved; p.ws.rev++; p.annih = null; }
      for (const [id, until] of p.marks) if (until < now) p.marks.delete(id);
    }
    const boxes = g.worldBoxes();
    for (const pr of this.proj.slice()) this.stepProj(pr, dt, boxes);
    for (const zn of this.zones.slice()) {
      zn.t -= dt; if (zn.t <= 0) { this.zones.splice(this.zones.indexOf(zn), 1); if (zn.kind === 'foam') this.rebuildFoam(); continue; }
      if (zn.kind === 'cryo') for (const t of this.targets(zn.owner)) if (t.p && Math.hypot(t.p.x - zn.x, t.p.z - zn.z) <= zn.r && Math.abs(t.p.y - zn.y) < 2.2) {
        const C = THROWABLES.cryo, p = t.p;                                   // 30 % slow, +5 % every 0.5 s while inside, no sprint
        if (p.cryoT <= 0 || p.cryoSlow <= 0) { p.cryoSlow = C.slow0; p.cryoAcc = 0; } else { p.cryoAcc += dt; while (p.cryoAcc >= C.interval) { p.cryoAcc -= C.interval; p.cryoSlow = Math.min(C.maxSlow, p.cryoSlow + C.step); } }
        p.cryoT = 0.3;
      }
      if (zn.kind === 'gas') {
        zn.acc += dt;
        while (zn.acc >= 0.1) {                                       // 2 damage every 0.1 s
          zn.acc -= 0.1;
          for (const t of this.targets(zn.owner)) if (Math.hypot(t.x - zn.x, t.y + 0.9 - (zn.y + 0.9), t.z - zn.z) <= zn.r) {
            this.hurt(t, zn.owner, 2, { silent: true, cause: 'gas', wn: 'Gas Bomb' });
            if (t.p) { t.p.gas = Math.min(1, t.p.gas + 0.02); t.p.gasT = 2; }
          }
        }
      }
    }
    for (const pu of this.pulses.slice()) {
      pu.r += 40 * dt;
      for (const t of this.targets(pu.owner)) { const id = t.p ? t.p.id : t.z.id; if (!pu.marked.has(id) && Math.hypot(t.x - pu.x, t.y + 0.9 - pu.y, t.z - pu.z) <= pu.r) { pu.marked.add(id); pu.owner.marks.set(id, now + SKILLS.pulse.mark); } }
      if (pu.r >= SKILLS.pulse.range) this.pulses.splice(this.pulses.indexOf(pu), 1);
    }
  }
  snap() {
    return {
      pj: this.proj.map(p => [p.id, KIND(p.kind), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), p.stuck ? 1 : 0, p.n ? p.n[0] : 0, p.n ? p.n[1] : 0, p.n ? p.n[2] : 0, 0]),
      zn: this.zones.map(z => ({ id: z.id, k: KIND(z.kind), x: +z.x.toFixed(2), y: +z.y.toFixed(2), z: +z.z.toFixed(2), r: z.r, t: +z.t.toFixed(1), b: z.box ? [z.box.x0, z.box.y0, z.box.z0, z.box.x1, z.box.y1, z.box.z1] : null })),
    };
  }
}
