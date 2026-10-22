// Skills (energy, T) and throwables (G): server-authoritative. Projectile physics, zones (cryo / gas / smoke / foam), blasts, scout pulses, waves, spirit bodies, timers.
// All numbers come from shared/skills.js (SKILLS / THROWABLES); movement-type skills (hook, leap, Gravity Spike) are executed by shared/movement.js.
import { SKILLS, THROWABLES, THROW_LIST, THROW_SPEED, fxOf, isMoveSkill } from '../shared/skills.js';
import { ENERGY, PLAYER, DT, STANCE_H, MOVE } from '../shared/constants.js';
import { forwardVec, rayWorld, rayAABB } from '../shared/geometry.js';
import { eyeOf } from './combat.js';

const G = 20, R = 0.12, KIND = (k) => THROW_LIST.indexOf(k);
const AX = ['x', 'y', 'z'];
const tid = (t) => (t.p ? t.p.id : t.b ? t.b.id : t.z.id);                    // id of a target entry (player / spirit body / zombie)
const r2 = (v) => +v.toFixed(2);

export class Abilities {
  constructor(game) { this.g = game; this.proj = []; this.zones = []; this.pulses = []; this.waves = []; this.bodies = []; this.kupiUntil = 0; this.nid = 1; this.foamBoxes = []; }
  reset() { this.proj.length = 0; this.zones.length = 0; this.pulses.length = 0; this.waves.length = 0; this.bodies.length = 0; this.kupiUntil = 0; this.foamBoxes = []; }
  flags(p) {
    const K = SKILLS.warm, war = p.warT > 0 && p.warCharge <= 0;
    return { exo: p.exoT > 0 && p.exoCharge <= 0, ka: p.kaT > 0, charge: p.exoCharge > 0 || p.warCharge > 0, stim: p.stimT > 0, cryo: p.cryoT > 0 ? p.cryoSlow : 0, annih: !!p.annih, lift: !!p.lift,
      slow: 1 - (1 - (p.slowT > 0 ? p.slowAmt : 0)) * (1 - p.gasSlow),                        // Unveiler and Gas Bomb slows multiply
      warM: war ? K.move + K.stackMove * p.warKills : 0, warR: war ? K.rate + K.stackRate * p.warKills : 0,
      deb2: p.tumHeavyT > 0, deb: p.tumDebT > 0 && p.tumHeavyT <= 0, buff: p.tumBuffT > 0 };
  }

  // ---------------------------------------------------------------- skills
  eligible(p, edge) {
    const sk = SKILLS[p.skill];
    return !!(edge && sk && p.alive && !p.down && !(p.empT > 0) && !p.view && this.g.phase === 'match' && this.g.combatOn() && !p.frozen && !p.air && !p.zl && p.energy >= sk.cost && p.exoCharge <= 0 && p.warCharge <= 0 &&
      !(p.skill === 'exo' && p.exoT > 0) && !(p.skill === 'kinetic' && p.kaT > 0) && !(p.skill === 'polter' && p.polterT > 0) && !(p.skill === 'annih' && p.annih) &&
      !(p.skill === 'warm' && p.warT > 0) && !(p.skill === 'grav' && (p.gs > 0 || p.grav)) && !(p.skill === 'dsr' && p.dsr) && !(p.skill === 'em2' && p.em2));
  }
  fxFor(p, elig) { const mv = isMoveSkill(p.skill); return fxOf(this.flags(p), mv ? p.skill : null, elig && mv); }
  spend(p) { p.energy = Math.max(0, p.energy - SKILLS[p.skill].cost); this.g.emitTo(p, 'skill', { id: p.skill }); }
  afterMove(p, elig) {                                          // called after stepMove: movement skills succeeded only if the aim was valid
    if (p.skEv === 4) { p.skEv = 0; if (p.alive) this.gravSlam(p); }       // Gravity Spike touched down (can happen on any tick)
    if (!elig) return;
    const sk = SKILLS[p.skill];
    switch (p.skill) {
      case 'hook': if (p.skEv === 1) this.spend(p); break;
      case 'pad': if (p.skEv === 2) this.spend(p); break;
      case 'grav': if (p.skEv === 3) { this.spend(p); this.equipGrav(p); } break;
      case 'exo': this.spend(p); p.exoCharge = sk.charge; p.exoT = sk.duration; break;
      case 'kinetic': this.spend(p); if (p.baseMax == null) p.baseMax = p.maxArmor; p.maxArmor = Math.max(p.maxArmor, sk.maxArmor); p.armor = Math.min(p.maxArmor, p.armor + 100); p.kaT = sk.duration; p.kaAcc = 0; break;
      case 'polter': this.spend(p); p.polterT = sk.duration; break;
      case 'annih': this.spend(p); this.equipAnnih(p); break;
      case 'pulse': this.spend(p); this.pulse(p); break;
      case 'warm': this.spend(p); p.warCharge = sk.charge; p.warT = sk.duration; p.warKills = 0; break;
      case 'dsr': this.spend(p); this.startDsr(p); break;
      case 'em2': this.spend(p); this.equipEm2(p); break;
      case 'tum': this.spend(p); this.castWave(p); break;
      case 'kupi': this.spend(p); this.playKupi(); break;
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
  // Marks `id` for `owner` through walls. shared = teammates of the owner (everybody who is not hostile to him) see it too.
  mark(owner, id, secs, shared) {
    const g = this.g, until = g.now + secs, set = (q) => { if ((q.marks.get(id) || 0) < until) q.marks.set(id, until); };
    set(owner);
    if (shared) for (const q of g.players.values()) if (q !== owner && q.alive && !g.mode.hostile(owner, q)) set(q);
  }
  // everything the player may see through walls: own marks + EM2 marks (team-shared marks were already copied into p.marks)
  markIds(p) { const ids = new Set(p.marks.keys()); if (p.em2) for (const id of p.em2.marked) ids.add(id); return [...ids]; }
  isEm2Marked(v) { for (const o of this.g.players.values()) if (o !== v && o.alive && o.em2 && o.em2.marked.has(v.id)) return true; return false; }

  // ---- Gravity Spike: the shared movement code does the leap + slam; here: unarmed, damage reduction (game.damage) and the blast
  equipGrav(p) {
    const ws = p.ws; p.grav = { saved: ws.guns.map(g => ({ ...g })) };
    for (let i = 0; i < ws.guns.length; i++) ws.guns[i] = { id: 'fists', mag: 0, reserve: 0 };
    ws.reloading = false; ws.reloadT = 0; ws.burstLeft = 0; ws.plateT = 0; ws.rev++;
  }
  restoreGrav(p) {
    const gr = p.grav; if (!gr) return; p.grav = null;
    gr.saved.forEach((g, i) => { if (p.ws.guns[i] && p.ws.guns[i].id === 'fists') p.ws.guns[i] = g; });      // (a gun picked up in the air is kept)
    p.ws.cd = Math.max(p.ws.cd, 0.3); p.ws.switchT = Math.max(p.ws.switchT, 0.3); p.ws.rev++;
  }
  gravSlam(p) {
    const S = SKILLS.grav, at = { x: p.x, y: p.y + 0.15, z: p.z };
    this.restoreGrav(p);
    this.blast(p, at, S.radius, S.dmgMax, { name: S.name, minFrac: S.dmgMin / S.dmgMax, push: true });          // same knockback as the Pneumatic Discharger
    this.g.emitAll('boom', { k: 'grav', x: at.x, y: at.y, z: at.z, r: S.radius });
  }

  // ---- Dissociative Surreality: the player object becomes the spirit, a static `body` entity stays behind as a target
  startDsr(p) {
    const S = SKILLS.dsr, g = this.g;
    const body = { id: 'b' + this.nid++, body: true, owner: p, x: p.x, y: p.y, z: p.z, yaw: p.yaw, stance: p.stance || 0, slideT: 0, lean: 0, history: [], hp: p.hp, armor: p.armor, maxArmor: p.maxArmor };
    this.bodies.push(body); p.dsr = { t: S.duration, body };
    p.hp = PLAYER.maxHealth; p.armor = Math.min(p.maxArmor, g.mode.rules.startArmor ?? 0); p.lastDamageT = -99; p.regenAcc = 0;      // the spirit is a fresh fighter; the body keeps the old health / armor
  }
  // the spirit goes back into the body (timer ran out or the spirit was defeated: no kill, no death)
  dsrReturn(p, why) {
    const d = p.dsr; if (!d) return; const b = d.body;
    p.x = b.x; p.y = b.y; p.z = b.z; p.vx = p.vy = p.vz = 0; p.onGround = true; p.slideT = 0; p.dive = 0; p.zl = 0; p.hk = 0; p.gs = 0; p.air = false; p.stance = b.stance; p.lean = 0;
    p.hp = b.hp; p.armor = b.armor; p.lastDamageT = this.g.now;
    this.bodies.splice(this.bodies.indexOf(b), 1); p.dsr = null; p.history.length = 0; p.epoch++;                  // epoch bump: the client takes the authoritative state (no blending across the teleport)
    this.g.emitTo(p, 'dsr', { end: why });
  }
  // attackers hitting the body (hitscan, explosions, gas ...). Returns nothing; kills the owner when the body is defeated.
  hitBody(b, attacker, dmg, o = {}) {
    const g = this.g, p = b.owner;
    if (!this.bodies.includes(b) || !p.alive || !p.dsr || !g.combatOn() || g.invulnerable) return;
    if (attacker && !g.mode.hostile(attacker, p)) return;
    dmg = Math.max(0, dmg);
    const hadArmor = b.armor > 0, aDmg = o.pure ? 0 : Math.min(b.armor, dmg), hDmg = dmg - aDmg;
    b.armor -= aDmg; b.hp -= hDmg;
    const dead = b.hp <= 0, broke = hadArmor && b.armor <= 0 && aDmg > 0;
    if (attacker && attacker !== p && !o.silent) g.emitTo(attacker, 'hit', { v: b.id, head: !!o.head, armor: aDmg > 0 && hDmg <= 0, broke, kill: dead, dmg: Math.round(dmg),
      hp: Math.max(0, Math.round(b.hp)), mh: PLAYER.maxHealth, ar: Math.round(b.armor), ma: b.maxArmor, ad: Math.round(aDmg), hd: Math.round(hDmg) });
    if (!dead) return;
    p.x = b.x; p.y = b.y; p.z = b.z; p.vx = p.vy = p.vz = 0;                                 // the player dies where the body lay (bomb drops there, etc.)
    g.emitTo(p, 'dsr', { end: 'body' });
    g.kill(attacker, p, o);                                                                  // onDeath() removes the body and ends the skill
  }
  bodySnap(tmOf) { return this.bodies.map(b => ({ id: b.id, x: r2(b.x), y: r2(b.y), z: r2(b.z), yaw: r2(b.yaw), pitch: 0, al: 1, tm: tmOf(b.owner), sn: b.stance, sl: 0, owner: b.owner.id })); }

  // ---- EM2: a 2-round hand cannon replaces the current slot (the laser itself is fired by server/combat.js)
  equipEm2(p) {
    const ws = p.ws, slot = ws.slot; p.em2 = { saved: ws.guns[slot], slot, marked: new Set() };
    ws.guns[slot] = { id: 'em2', mag: SKILLS.em2.rounds, reserve: 0 }; ws.reloading = false; ws.burstLeft = 0; ws.wind = 0; ws.lock = null; ws.switchT = 0.3; ws.cd = Math.max(ws.cd, 0.3); ws.rev++;
  }
  em2Fired(p) { const e = p.em2; if (e && p.ws.guns[e.slot].id === 'em2' && p.ws.guns[e.slot].mag <= 0) this.endEm2(p); }       // out of ammo: the skill ends, marks vanish
  endEm2(p) {
    const e = p.em2; if (!e) return; p.em2 = null;
    if (p.ws.guns[e.slot].id === 'em2') p.ws.guns[e.slot] = e.saved;
    p.ws.wind = 0; p.ws.lock = null; p.ws.rev++;
  }

  // ---- Therapeutic Undulating Module: a wide wave that flies through everything; enemies get marked + debuffed, teammates healed + buffed
  castWave(p) {
    const S = SKILLS.tum, dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    this.waves.push({ id: this.nid++, owner: p, x: p.x + dx * 1.5, y: p.y, z: p.z + dz * 1.5, dx, dz, dist: 0, hit: new Set() });
    this.allyBuff(p);                                                                       // the caster gets the same heal + buff as the allies the wave touches
    void S;
  }
  allyBuff(q) { const A = SKILLS.tum.ally; q.hp = Math.min(PLAYER.maxHealth, q.hp + A.heal); q.tumBuffT = A.duration; q.tumHealT = A.duration; q.tumHealAcc = 0; q.lastDamageT = -99; q.regenAcc = 0; }
  waveStep(w, dt) {
    const S = SKILLS.tum, g = this.g, o = w.owner, step = S.speed * dt;
    w.x += w.dx * step; w.z += w.dz * step; w.dist += step;
    if (w.dist >= S.range) return false;
    const inside = (x, y, z) => {                                                           // oriented box test (the wave is a vertical sheet facing its travel direction)
      const rx = x - w.x, rz = z - w.z, along = rx * w.dx + rz * w.dz, lat = -rx * w.dz + rz * w.dx;
      return Math.abs(along) <= S.thick / 2 + step + 0.4 && Math.abs(lat) <= S.width / 2 + 0.4 && y + 1.8 > w.y - 0.5 && y < w.y + S.height;
    };
    for (const q of g.players.values()) {
      if (q === o || !q.alive || !q.spawned || w.hit.has(q.id) || !inside(q.x, q.y, q.z)) continue;
      w.hit.add(q.id);
      if (g.mode.hostile(o, q)) { this.mark(o, q.id, S.mark, true); q.tumHeavyT = S.heavy.duration; q.tumDebT = S.heavy.duration + S.debuff.duration; q.cleanseT = 0; }      // 3 s heavy debuff (not removable), then the 17 s removable -15 % debuff
      else this.allyBuff(q);
    }
    for (const t of this.targets(o)) if (!t.p && !w.hit.has(tid(t)) && inside(t.x, t.y, t.z)) { w.hit.add(tid(t)); this.mark(o, tid(t), S.mark, true); }      // zombies / enemy spirit bodies: mark only
    return true;
  }
  // F held while debuffed: remove the Therapeutic debuff after `cleanse` seconds (called once per processed input)
  cleanse(p, held) {
    if (p.tumDebT <= 0 || p.tumHeavyT > 0 || !p.alive) { p.cleanseT = 0; return; }       // the heavy phase cannot be cleansed
    if (held) { p.cleanseT += DT; if (p.cleanseT >= SKILLS.tum.debuff.cleanse - 1e-6) { p.tumDebT = 0; p.cleanseT = 0; } } else p.cleanseT = 0;
  }

  // ---- Iphone Kupi: everybody in the match hears it; deaths during the window play the second file to the victim only (client plays the files, see client/audio.js)
  playKupi() { this.kupiUntil = this.g.now + SKILLS.kupi.duration; this.g.emitAll('kupi', { dur: SKILLS.kupi.duration }); }
  onPlayerDied(v) { if (this.g.now < this.kupiUntil) this.g.emitTo(v, 'kupi:death', {}); }

  // ---- Warmonger: lifesteal on damage dealt to other players (game.damage calls this)
  lifesteal(a, dealt) {
    if (!a || a.warT <= 0 || a.warCharge > 0 || !a.alive || dealt <= 0) return;
    const K = SKILLS.warm, f = K.steal + K.stackSteal * a.warKills;
    if (a.hp < PLAYER.maxHealth) a.hp = Math.min(PLAYER.maxHealth, a.hp + dealt * f);
  }
  onKill(a, o = {}) {
    if (!a) return;
    if (a.skill === 'pad') a.energy = Math.min(ENERGY.max, a.energy + SKILLS.pad.killEnergy);        // Pneumatic Auxiliary Device: any kill grants 25 energy
    else a.energy = Math.min(ENERGY.max, a.energy + ENERGY.perKill);
    if (o.weapon === 'annihilator') a.energy = ENERGY.max;                                            // Annihilator kill: 100 energy at once (the skill is ready again)
    if (a.exoT > 0 && a.exoCharge <= 0) a.exoT += SKILLS.exo.killBonus;
    if (a.kaT > 0) a.kaT += SKILLS.kinetic.killBonus;                                                  // Kinetic Armor: +3 s per kill
    if (a.warT > 0 && a.warCharge <= 0) { a.warT += SKILLS.warm.killBonus; a.warKills++; }            // Warmonger: +5 s and one more stack of every bonus
  }
  onDown(v) { this.clearEffects(v); }                               // downed (Battle Royale): every active skill / effect ends, energy is kept
  onDeath(v) { this.clearEffects(v); if (this.g.mode && this.g.mode.rules.energyReset) v.energy = 0; }
  clearEffects(v) {
    if (v.baseMax != null) { v.maxArmor = v.baseMax; v.baseMax = null; }
    this.proj = this.proj.filter(pr => !(pr.kind === 'discharger' && pr.owner === v));       // a Discharger vanishes with its owner (Trip Mines and Unveilers stay armed)
    if (v.dsr) { const i = this.bodies.indexOf(v.dsr.body); if (i >= 0) this.bodies.splice(i, 1); }
    v.dsr = null; v.em2 = null; v.grav = null;
    v.exoCharge = v.exoT = v.kaT = v.polterT = v.stimT = v.cryoT = 0; v.cryoSlow = 0; v.cryoAcc = 0; v.gas = 0; v.gasT = 0; v.lift = false; v.annih = null; v.marks.clear();
    v.warCharge = v.warT = v.warKills = 0; v.tumHeavyT = v.tumDebT = v.cleanseT = v.tumBuffT = v.tumHealT = v.tumHealAcc = v.xhpT = 0; v.slowT = v.slowAmt = v.gasSlow = v.flashT = v.stimHealT = v.stimHealAcc = 0;
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
    if (id === 'stim') { const T = THROWABLES.stim; p.stimT = T.duration; p.stimHealT = T.healDuration; p.stimHealAcc = 0; p.lastDamageT = -99; p.regenAcc = 0; this.g.emitTo(p, 'throw', { kind: 'stim' }); return; }   // injects: speed + handling buff and a burst of health recovery
    const e = eyeOf(p), d = forwardVec(p.yaw, p.pitch);
    this.proj.push({ id: this.nid++, kind: id, owner: p, x: e[0] + d[0] * 0.5, y: e[1] + d[1] * 0.5 - 0.1, z: e[2] + d[2] * 0.5, vx: d[0] * spd + p.vx * 0.4, vy: d[1] * spd + 4.5, vz: d[2] * spd + p.vz * 0.4,
      age: 0, stuck: false, n: null, hd: [d[0], d[2]], rayLen: 0 });
    this.g.emitTo(p, 'throw', { kind: id });
  }
  // every hostile target of `owner`: players, zombies and the spirit bodies of hostile players
  targets(owner) {
    const out = [], g = this.g;
    for (const q of g.players.values()) if (q.alive && q !== owner && (!owner || g.mode.hostile(owner, q))) out.push({ p: q, x: q.x, y: q.y, z: q.z });
    if (g.mode.zombies) for (const z of g.mode.zombies) if (z.alive) out.push({ z, x: z.x, y: z.y, z: z.z });
    for (const b of this.bodies) if (b.owner.alive && b.owner !== owner && (!owner || g.mode.hostile(owner, b.owner))) out.push({ b, x: b.x, y: b.y, z: b.z });
    return out;
  }
  hurt(t, owner, dmg, o) {
    if (t.p) this.g.damage(t.p, owner, dmg, { cause: 'explosive', ...o });
    else if (t.b) this.hitBody(t.b, owner, dmg, { cause: 'explosive', ...o });
    else this.g.mode.hitZombie(t.z, owner, dmg, { head: false, weapon: '', ...o });
  }
  aabbOf(t) {                                                    // generous full-height body box used by mine sensors
    const q = t.p || t.b || t.z, st = q.stance || 0, h = q.slideT > 0 ? MOVE.slideHeight : STANCE_H[st], hw = st === 2 ? 0.55 : PLAYER.bodyHalf;
    return [t.x - hw, t.y, t.z - hw, t.x + hw, t.y + h, t.z + hw];
  }
  blast(owner, at, radius, max, o = {}) {
    const world = this.g.worldBoxes();
    for (const t of this.targets(owner)) {
      const dx = t.x - at.x, dy = t.y + 0.9 - at.y, dz = t.z - at.z, d = Math.hypot(dx, dy, dz), direct = o.direct && (t.p === o.direct || t.z === o.direct);
      if (d > radius && !direct) continue;
      if (!direct && d > 1.2 && rayWorld([at.x, at.y, at.z], [dx / d, dy / d, dz / d], world, d) < d - 0.35) continue;      // walls (and foam) shield from the blast
      const dmg = direct ? o.directDmg : max * (1 - (1 - (o.minFrac ?? 0.25)) * Math.min(1, d / radius));
      this.hurt(t, owner, dmg, { wn: o.name, streak: o.streak });
      if (o.push && t.p) {                                          // Pneumatic Discharger / Gravity Spike: launch away + up, no ADS while airborne
        const T = THROWABLES.discharger, hl = Math.hypot(dx, dz) || 1; t.p.vx = dx / hl * T.push; t.p.vz = dz / hl * T.push; t.p.vy = T.lift; t.p.onGround = false; t.p.slideT = 0; t.p.dive = 0; t.p.lift = true; t.p.liftGrace = 0.15;
      }
    }
  }
  floorY(x, y, z) { const t = rayWorld([x, y + 0.2, z], [0, -1, 0], this.g.worldBoxes(), 40); return t < 40 ? y + 0.2 - t : 0; }
  addZone(kind, x, y, z, r, t, owner, extra = {}) { const zn = { id: this.nid++, kind, x, y, z, r, t, owner, acc: 0, ...extra }; this.zones.push(zn); this.rebuildFoam(); return zn; }
  rebuildFoam() { this.foamBoxes = this.zones.filter(z => z.kind === 'foam').map(z => z.box); }
  // Flashbang: everybody (friend or foe, the thrower too) whose view cone contains the blast and who has line of sight is blinded
  flashBlast(at) {
    const T = THROWABLES.flash, world = this.g.worldBoxes();
    for (const q of this.g.players.values()) {
      if (!q.alive || !q.spawned) continue;
      const e = eyeOf(q), dx = at.x - e[0], dy = at.y - e[1], dz = at.z - e[2], d = Math.hypot(dx, dy, dz); if (d > T.range) continue;
      const f = forwardVec(q.yaw, q.pitch), dot = d < 0.01 ? 1 : (dx * f[0] + dy * f[1] + dz * f[2]) / d; if (dot < T.viewCos) continue;
      if (d > 0.5 && rayWorld(e, [dx / d, dy / d, dz / d], world, d) < d - 0.3) continue;                 // walls / foam block the light
      q.flashT = T.blind;
    }
  }
  // Unveiler triggered: no damage; every hostile target in range is slowed and marked (teammates of the thrower see the mark)
  unveil(pr) {
    const T = THROWABLES.unveiler, o = pr.owner;
    for (const t of this.targets(o)) {
      if (Math.hypot(t.x - pr.x, t.y + 0.9 - pr.y, t.z - pr.z) > T.radius) continue;
      this.mark(o, tid(t), T.mark, true);
      if (t.p) { t.p.slowT = T.slowFor; t.p.slowAmt = T.slow; }
    }
  }
  explode(pr, direct) {
    const i = this.proj.indexOf(pr); if (i >= 0) this.proj.splice(i, 1);
    const k = pr.kind, o = pr.owner, at = { x: pr.x, y: pr.y, z: pr.z }, T = THROWABLES[k]; let r = 4;
    if (k === 'frag') { r = T.radius; this.blast(o, at, T.radius, T.dmgMax, { name: T.name, minFrac: T.dmgMin / T.dmgMax }); }
    else if (k === 'impact') { r = T.radius; this.blast(o, at, T.radius, T.dmgMax, { name: T.name, minFrac: T.dmgMin / T.dmgMax, direct, directDmg: T.direct }); }
    else if (k === 'discharger') { r = T.radius; this.blast(o, at, T.radius, T.dmgMax, { name: T.name, minFrac: T.dmgMin / T.dmgMax, push: true }); }
    else if (k === 'tripmine') {                                   // detonates slightly in front of the wall it is stuck to so the wall does not shield the blast
      r = T.radius; const n = pr.n || [0, -1, 0]; at.x -= n[0] * 0.3; at.y -= n[1] * 0.3; at.z -= n[2] * 0.3;
      this.blast(o, at, T.radius, T.dmgMax, { name: T.name, minFrac: T.dmgMin / T.dmgMax });
    }
    else if (k === 'cryo' || k === 'gas') { r = T.radius; this.addZone(k, at.x, this.floorY(at.x, at.y, at.z), at.z, T.radius, T.duration, o); }
    else if (k === 'smoke') { r = 3; this.addZone(k, at.x, this.floorY(at.x, at.y, at.z), at.z, T.radius, T.duration, o); }       // a visual cloud only: no damage, no effect
    else if (k === 'flash') { r = 3; this.flashBlast(at); }
    else if (k === 'unveiler') { r = T.radius; this.unveil(pr); }
    else if (k === 'foam') {
      const y0 = Math.max(0, at.y - 0.4), alongX = Math.abs(pr.hd[0]) > Math.abs(pr.hd[1]);   // wall faces the thrower
      const hl = T.length / 2, ht = T.thick / 2;                       // 6.7275 m wide (+15 % over 5.85)
      const box = alongX ? { x0: at.x - ht, x1: at.x + ht, z0: at.z - hl, z1: at.z + hl, y0, y1: y0 + T.height, k: 'foam' } : { x0: at.x - hl, x1: at.x + hl, z0: at.z - ht, z1: at.z + ht, y0, y1: y0 + T.height, k: 'foam' };
      this.addZone('foam', at.x, y0, at.z, hl, T.duration, o, { box });
    }
    this.g.emitAll('boom', { k, x: at.x, y: at.y, z: at.z, r });
  }
  onContact(pr, hit) {
    if (pr.kind === 'frag' || pr.kind === 'flash') return;        // bounce
    if (pr.kind === 'unveiler') {                                 // lands on the ground: sticks and turns invisible; walls / ceilings: bounce
      if (hit.ax === 'y' && hit.sign < 0) { pr.stuck = true; pr.age = 0; pr.vx = pr.vy = pr.vz = 0; pr.n = [0, -1, 0]; }
      return;
    }
    if (pr.kind === 'discharger' || pr.kind === 'tripmine') {
      pr.stuck = true; pr.age = 0; pr.vx = pr.vy = pr.vz = 0; pr.n = [hit.ax === 'x' ? hit.sign : 0, hit.ax === 'y' ? hit.sign : 0, hit.ax === 'z' ? hit.sign : 0];     // n points INTO the surface
      if (pr.kind === 'tripmine') { const T = THROWABLES.tripmine, out = [-pr.n[0], -pr.n[1], -pr.n[2]]; pr.rayLen = rayWorld([pr.x, pr.y, pr.z], out, this.g.map.boxes, T.rayLen + 0.5) - 0.5; if (pr.rayLen < 0.2) pr.rayLen = 0.2; }
      return;
    }
    this.explode(pr, null);                                       // impact / cryo / gas / smoke / foam burst on contact
  }
  // sensors of placed devices: Unveiler (enemy inside the blast range) and Trip Mine (enemy touches the ray that leaves its head)
  stepStuck(pr) {
    if (pr.kind === 'unveiler') {
      const T = THROWABLES.unveiler;
      for (const t of this.targets(pr.owner)) if (Math.hypot(t.x - pr.x, t.y + 0.9 - pr.y, t.z - pr.z) <= T.radius) return this.explode(pr, null);
    } else if (pr.kind === 'tripmine') {
      const T = THROWABLES.tripmine, out = [-pr.n[0], -pr.n[1], -pr.n[2]], rr = T.rayRadius, len = 0.5 + pr.rayLen;       // body (0.5 m) + ray
      for (const t of this.targets(pr.owner)) {
        const [x0, y0, z0, x1, y1, z1] = this.aabbOf(t);
        if (rayAABB([pr.x, pr.y, pr.z], out, x0 - rr, y0 - rr, z0 - rr, x1 + rr, y1 + rr, z1 + rr, len) < Infinity) return this.explode(pr, null);
      }
    }
  }
  stepProj(pr, dt, boxes) {
    pr.age += dt;
    if (pr.stuck) return this.stepStuck(pr);                        // placed devices wait for their trigger (the Discharger waits for its owner, no timer)
    if ((pr.kind === 'frag' || pr.kind === 'flash') && pr.age >= THROWABLES[pr.kind].fuse) return this.explode(pr, null);
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
    if (pr.kind !== 'frag' && pr.kind !== 'flash' && pr.kind !== 'discharger' && pr.kind !== 'tripmine' && pr.kind !== 'unveiler') {          // direct hit on a player / zombie (the bouncing / placed kinds ignore bodies)
      for (const t of this.targets(pr.owner)) if (Math.abs(pr.x - t.x) < 0.5 && Math.abs(pr.z - t.z) < 0.5 && pr.y > t.y - 0.1 && pr.y < t.y + 1.9) { this.explode(pr, t.p || t.z || null); return; }
    }
  }

  // ---------------------------------------------------------------- per-tick update
  tick(dt) {
    const g = this.g, now = g.now;
    for (const p of g.players.values()) {
      if (p.gasT > 0) p.gasT -= dt; else { if (p.gas > 0) p.gas = Math.max(0, p.gas - dt * 0.5); p.gasSlow = 0; }     // the gas vignette and the stacked slow fade 2 s after the last gas damage
      if (p.flashT > 0) p.flashT = Math.max(0, p.flashT - dt);
      if (p.liftGrace > 0) p.liftGrace -= dt; else if (p.lift && p.onGround) p.lift = false;
      if (!p.alive || !p.spawned) continue;
      p.energy = Math.min(ENERGY.max, p.energy + ENERGY.regen * dt);
      if (p.exoCharge > 0) p.exoCharge = Math.max(0, p.exoCharge - dt); else if (p.exoT > 0) p.exoT = Math.max(0, p.exoT - dt);
      if (p.warCharge > 0) p.warCharge = Math.max(0, p.warCharge - dt); else if (p.warT > 0) { p.warT = Math.max(0, p.warT - dt); if (p.warT <= 0) p.warKills = 0; }   // the stacked bonus is gone with the skill
      if (p.kaT > 0) {
        p.kaT = Math.max(0, p.kaT - dt); p.kaAcc += dt; const K = SKILLS.kinetic;
        while (p.kaAcc >= K.regenEvery) { p.kaAcc -= K.regenEvery; p.armor = Math.min(p.maxArmor, p.armor + K.regen); }      // +2 armor every 0.1 s
        if (p.kaT <= 0 && p.baseMax != null) { p.maxArmor = p.baseMax; p.baseMax = null; p.armor = Math.min(p.armor, p.maxArmor); }   // normal max armor again
      }
      if (p.polterT > 0) p.polterT = Math.max(0, p.polterT - dt);
      if (p.stimT > 0) p.stimT = Math.max(0, p.stimT - dt);
      if (p.stimHealT > 0) {                                                                  // Stim Shot: +10 health every 0.1 s for 1.5 s
        const T = THROWABLES.stim; p.stimHealT = Math.max(0, p.stimHealT - dt); p.stimHealAcc += dt;
        while (p.stimHealAcc >= T.healEvery - 1e-9) { p.stimHealAcc -= T.healEvery; if (p.hp < PLAYER.maxHealth) p.hp = Math.min(PLAYER.maxHealth, p.hp + T.healAmount); }
      }
      if (p.slowT > 0) p.slowT = Math.max(0, p.slowT - dt);
      if (p.cryoT > 0) p.cryoT = Math.max(0, p.cryoT - dt); else { p.cryoSlow = 0; p.cryoAcc = 0; }
      if (p.annih && p.annih.state === 'cool' && (p.annih.t -= dt) <= 0) { p.ws.guns[p.annih.slot] = p.annih.saved; p.ws.rev++; p.annih = null; }
      for (const [id, until] of p.marks) if (until < now) p.marks.delete(id);
      if (p.tumHeavyT > 0) p.tumHeavyT = Math.max(0, p.tumHeavyT - dt);
      if (p.tumDebT > 0) p.tumDebT = Math.max(0, p.tumDebT - dt);
      if (p.tumBuffT > 0) p.tumBuffT = Math.max(0, p.tumBuffT - dt);
      if (p.tumHealT > 0) {                                                                   // Therapeutic wave: health and armor recovery for 6 s
        const A = SKILLS.tum.ally; p.tumHealT = Math.max(0, p.tumHealT - dt); p.tumHealAcc += dt;
        while (p.tumHealAcc >= A.regenEvery - 1e-9) { p.tumHealAcc -= A.regenEvery; if (p.hp < PLAYER.maxHealth) p.hp = Math.min(PLAYER.maxHealth, p.hp + A.regenHp); p.armor = Math.min(p.maxArmor, p.armor + A.regenAr); }
      }
      if (p.xhpT > 0 && (p.xhpT = Math.max(0, p.xhpT - dt)) <= 0 && p.hp > PLAYER.maxHealth) p.hp = PLAYER.maxHealth;      // the 20 extra health vanish after 6 s
      if (p.dsr && (p.dsr.t -= dt) <= 0) this.dsrReturn(p, 'time');                           // spirit time is up: back into the body
      if (p.em2) for (const t of this.targets(p)) if (Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) <= SKILLS.em2.markRange) p.em2.marked.add(tid(t));      // EM2: everybody within 50 m stays marked until the skill ends
    }
    const boxes = g.worldBoxes();
    for (const pr of this.proj.slice()) this.stepProj(pr, dt, boxes);
    for (const w of this.waves.slice()) if (!this.waveStep(w, dt)) this.waves.splice(this.waves.indexOf(w), 1);
    for (const zn of this.zones.slice()) {
      zn.t -= dt; if (zn.t <= 0) { this.zones.splice(this.zones.indexOf(zn), 1); if (zn.kind === 'foam') this.rebuildFoam(); continue; }
      if (zn.kind === 'cryo') for (const t of this.targets(zn.owner)) if (t.p && Math.hypot(t.p.x - zn.x, t.p.z - zn.z) <= zn.r && Math.abs(t.p.y - zn.y) < 2.2) {
        const C = THROWABLES.cryo, p = t.p;                                   // 30 % slow, +5 % every 0.5 s while inside, no sprint
        if (p.cryoT <= 0 || p.cryoSlow <= 0) { p.cryoSlow = C.slow0; p.cryoAcc = 0; } else { p.cryoAcc += dt; while (p.cryoAcc >= C.interval) { p.cryoAcc -= C.interval; p.cryoSlow = Math.min(C.maxSlow, p.cryoSlow + C.step); } }
        p.cryoT = 0.3;
      }
      if (zn.kind === 'gas') {
        const GB = THROWABLES.gas; zn.acc += dt;
        while (zn.acc >= 0.1) {                                       // 2 damage every 0.1 s, every tick slows the victim by another 2 % (stackable)
          zn.acc -= 0.1;
          for (const t of this.targets(zn.owner)) if (Math.hypot(t.x - zn.x, t.y + 0.9 - (zn.y + 0.9), t.z - zn.z) <= zn.r) {
            this.hurt(t, zn.owner, 2, { silent: true, cause: 'gas', wn: 'Gas Bomb' });
            if (t.p) { t.p.gas = Math.min(1, t.p.gas + 0.02); t.p.gasT = GB.slowLinger; t.p.gasSlow = Math.min(GB.maxSlow, t.p.gasSlow + GB.slowPerHit); }
          }
        }
      }
    }
    for (const pu of this.pulses.slice()) {
      pu.r += 40 * dt;
      for (const t of this.targets(pu.owner)) { const id = tid(t); if (!pu.marked.has(id) && Math.hypot(t.x - pu.x, t.y + 0.9 - pu.y, t.z - pu.z) <= pu.r) { pu.marked.add(id); this.mark(pu.owner, id, SKILLS.pulse.mark, true); } }
      if (pu.r >= SKILLS.pulse.range) this.pulses.splice(this.pulses.indexOf(pu), 1);
    }
  }
  // Projectile row: [id, kindIdx, x, y, z, stuck, nx, ny, nz, 0, rayLen, age].  Stuck Unveilers are INVISIBLE to the thrower's enemies: they are simply not sent to them.
  visibleTo(pr, viewer) { return !(pr.kind === 'unveiler' && pr.stuck && viewer && pr.owner !== viewer && this.g.mode.hostile(pr.owner, viewer)); }
  snap(viewer = null) {
    return {
      pj: this.proj.filter(p => this.visibleTo(p, viewer)).map(p => [p.id, KIND(p.kind), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), p.stuck ? 1 : 0, p.n ? p.n[0] : 0, p.n ? p.n[1] : 0, p.n ? p.n[2] : 0, 0, +(p.rayLen || 0).toFixed(2), +p.age.toFixed(1)]),
      zn: this.zones.map(z => ({ id: z.id, k: KIND(z.kind), x: +z.x.toFixed(2), y: +z.y.toFixed(2), z: +z.z.toFixed(2), r: z.r, t: +z.t.toFixed(1), b: z.box ? [z.box.x0, z.box.y0, z.box.z0, z.box.x1, z.box.y1, z.box.z1] : null })),
      wv: this.waves.map(w => [w.id, r2(w.x), r2(w.y), r2(w.z), +w.dx.toFixed(3), +w.dz.toFixed(3), +w.dist.toFixed(1)]),
    };
  }
}
