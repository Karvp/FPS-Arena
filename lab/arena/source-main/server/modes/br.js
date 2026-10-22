// BATTLE ROYALE on the Oil Rig: helicopter drop, loot crates, shrinking ring (random storm eyes), 4 teams of up to 3, downed / revive.
//  Resurgence: each player respawns up to 2 times in the first 3:30 (into the helicopter), last team standing wins.
//  Incursion:  infinite respawns, Hardpoint on the highest deck, most points after 5:00 (or 150) wins.
import { Mode } from './base.js';
import { BR, BR_TEAMS, BR_SUBMODES, DOWN } from '../../shared/constants.js';
import { makeGunsState } from '../../shared/weaponstate.js';
import { Loot } from '../loot.js';

const FISTS = () => ({ id: 'fists', mag: 0, reserve: 0 });
export class BattleRoyale extends Mode {
  constructor(game) {
    super(game); this.id = 'br'; this.t0 = game.now; this.loot = new Loot(game, { kits: true }); this.startCount = 0; this.ended = false;
    this.sub = BR_SUBMODES[game.config.sub] ? game.config.sub : 'resurgence';
    this.rules = { maxArmor: BR.maxArmor, maxPlates: BR.maxPlates, startArmor: 0, startPlates: 0, killPlate: false, startThrow: 0, energyReset: true, glideGuard: BR.glideGuard };
    this.shrinkTimes = BR.widths.map((_, k) => BR.ringStart + k * BR.period);
    this.closeAt = this.shrinkTimes[BR.widths.length - 1] + BR.closeAfter;
    this.bound = game.map.bound;
    this.rings = this.buildRings();
    this.endOverlay = BR.endOverlay;                                      // extra seconds before the scoreboard (VICTORY / #2 overlay)
    this.heli = { x: BR.heli.x, y: BR.heli.y, z: BR.heli.z, st: 'hover' }; this.windowOpen = true; this.seatN = 0;
    this.startTeams = new Set(); this.out = {}; this.teamPlace = {}; this.left = [];
    this.scores = Object.fromEntries(BR_TEAMS.map(t => [t, 0])); this.acc = Object.fromEntries(BR_TEAMS.map(t => [t, 0])); this.zoneStatus = 'empty';
  }
  hostile(a, b) { return a !== b && a.team !== b.team; }               // teammates never hurt each other
  // ---- respawns: Resurgence = 2 per player until 3:30; Incursion = unlimited
  canRespawn(p) { if (this.ended) return false; return this.sub === 'incursion' || (this.windowOpen && p.respawnsLeft > 0); }
  onRespawn(p) { if (this.sub === 'resurgence') p.respawnsLeft = Math.max(0, p.respawnsLeft - 1); }
  canDown(p) { return this.game.phase === 'match' && !p.air && !p.heli && !p.down; }
  startWeapons() { return makeGunsState([FISTS(), FISTS()], true); }
  // players appear inside the hovering helicopter (seat by seat); leaving it starts the glide
  spawnPoint(p) {
    const H = BR.heli, i = this.seatN++, h = this.heli;
    return { x: h.x + H.seatsX[i % H.seatsX.length], y: h.y, z: h.z + H.seatsZ[Math.floor(i / H.seatsX.length) % H.seatsZ.length], yaw: 0, air: true, heli: true };
  }
  exitHeli(p) { if (!p.heli) return; p.heli = false; p.heliT = 0; p.air = true; p.y -= 0.3; this.game.emitTo(p, 'heli:exit', {}); }
  heliInput(p, inp, useEdge) {                                          // Space / F leaves (after a short moment so a held key can't throw you out instantly)
    const edge = !!inp.jump && !p.heliJumpPrev; p.heliJumpPrev = !!inp.jump;
    if (p.heliT >= 0.7 && (edge || useEdge)) this.exitHeli(p);
  }
  start() {
    const g = this.game, crates = g.map.crates.slice().sort(() => Math.random() - 0.5).slice(0, BR.crates);
    crates.forEach(c => this.loot.addCrate(c));
    const list = [...g.players.values()].sort((a, b) => BR_TEAMS.indexOf(a.team) - BR_TEAMS.indexOf(b.team));    // teammates sit together
    for (const p of list) { this.startTeams.add(p.team); p.respawnsLeft = this.sub === 'resurgence' ? BR.resurgence.respawns : 0; g.spawnPlayer(p, { protect: 0 }); p.place = 0; p.ringT = 0; p.ringAcc = 0; }
    this.startCount = g.players.size; this.t0 = g.now;
    g.announce(this.sub === 'incursion' ? 'INCURSION · CAPTURE THE RIG' : 'RESURGENCE · LAST TEAM STANDING', 'round');
  }
  // Target circle of every shrink. Each one lies completely inside the previous circle; from `randomFrom` on its centre (the storm eye) is random.
  buildRings(rand = Math.random) {
    const rings = [{ frac: 1, cx: 0, cz: 0 }];
    BR.widths.forEach((frac, k) => {
      const prev = rings[k]; let cx = prev.cx, cz = prev.cz;
      if (k >= BR.randomFrom) { const room = Math.max(0, (prev.frac - frac) * this.bound), a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * room; cx += Math.cos(a) * d; cz += Math.sin(a) * d; }
      rings.push({ frac, cx, cz });
    });
    return rings;
  }
  // ring at match time t: centre (cx, cz), radius r (world units), phase, seconds until the phase changes, and the next target circle (nxt) while one is pending.
  ringAt(t) {
    const R = this.rings, B = this.bound, mk = (frac, cx, cz, phase, next, tgt) => ({ frac, phase, next, r: frac * B, cx, cz, nxt: tgt ? { cx: tgt.cx, cz: tgt.cz, r: tgt.frac * B } : null });
    for (let k = 0; k < BR.widths.length; k++) {
      const t0 = this.shrinkTimes[k], t1 = t0 + BR.shrinkTime, a = R[k], b = R[k + 1];
      if (t < t0) return mk(a.frac, a.cx, a.cz, 'wait', t0 - t, b);
      if (t < t1) { const u = (t - t0) / BR.shrinkTime; return mk(a.frac + (b.frac - a.frac) * u, a.cx + (b.cx - a.cx) * u, a.cz + (b.cz - a.cz) * u, 'shrinking', t1 - t, b); }
    }
    const last = R[R.length - 1];
    if (t < this.closeAt) return mk(last.frac, last.cx, last.cz, 'wait', this.closeAt - t, null);
    const k = Math.min(1, (t - this.closeAt) / BR.closeTime);
    return mk(last.frac * (1 - k), last.cx, last.cz, 'closing', 0, null);
  }
  onUse(p) { this.loot.use(p); }
  closeWindow() {                                                       // respawning is over: unused respawns are lost, the helicopter flies away
    this.windowOpen = false; this.heli.st = 'leaving';
    for (const p of this.game.players.values()) { p.respawnsLeft = 0; if (p.heli) this.exitHeli(p); }
    this.game.announce('RESPAWNS DISABLED', 'info');
  }
  presentIn(team, leaving) { for (const p of this.game.players.values()) if (p !== leaving && p.team === team && (p.alive || this.canRespawn(p))) return true; return false; }
  teamsLeft() { return [...this.startTeams].filter(t => !this.out[t] && this.presentIn(t)).length; }
  update(dt) {
    const g = this.game, t = g.now - this.t0, ring = this.ringAt(t); this.ring = ring;
    if (this.sub === 'resurgence' && this.windowOpen && t >= BR.resurgence.window) this.closeWindow();
    if (this.heli.st === 'leaving' && !this.heli.gone) { this.heli.x += BR.heli.leaveSpeed * dt; this.heli.y += BR.heli.leaveClimb * dt; if (this.heli.x > this.bound * 3) this.heli.gone = true; }
    for (const p of g.players.values()) {
      if (p.heli && p.alive) { p.heliT += dt; if (p.heliT >= BR.heli.maxStay) this.exitHeli(p); }     // 10 s in the helicopter: thrown out, glide begins
      if (!p.alive || p.air) { if (p.alive) p.ringT = 0; continue; }
      if (Math.hypot(p.x - ring.cx, p.z - ring.cz) > ring.r) {                            // outside the ring: 5 hp/s, tripled every 5 undisrupted seconds
        p.ringT += dt; const rate = BR.dps * Math.pow(3, Math.floor(p.ringT / BR.tripleEvery)); p.ringAcc += rate * dt; p.ringRate = rate;
        if (p.ringAcc >= 1) { const d = Math.floor(p.ringAcc); p.ringAcc -= d; g.damage(p, null, d, { pure: true, cause: 'ring' }); }
      } else { p.ringT = 0; p.ringAcc = 0; p.ringRate = 0; }
    }
    this.updateDowned(dt);
    this.loot.update(); this.loot.flush(g.now);
    if (this.sub === 'incursion') this.updateZone(dt, t); else this.checkTeams();
  }
  // ---- downed players: bleed, Self-Revive Kit (hold V, 5 s, no bleeding meanwhile), teammates (hold F within reach, 7 s)
  updateDowned(dt) {
    const g = this.game, ps = [...g.players.values()];
    for (const p of ps) { p.reviveTarget = null; p.reviveNear = null; }
    const downed = ps.filter(p => p.alive && p.down);
    for (const d of downed) {
      const revivers = ps.filter(q => q !== d && q.alive && !q.down && !q.air && q.team === d.team && Math.hypot(q.x - d.x, q.z - d.z) <= DOWN.reviveRange && Math.abs(q.y - d.y) < 1.6);
      for (const q of revivers) { q.reviveNear = d; if (q.interactHeld) q.reviveTarget = d; }
      const helpers = revivers.filter(q => q.interactHeld);
      d.selfT = d.selfHeld && d.kits > 0 ? d.selfT + dt : 0;
      d.revT = helpers.length ? d.revT + dt : 0;
      if (d.selfT >= DOWN.selfTime) { d.kits--; this.revive(d, null); continue; }
      if (d.revT >= DOWN.reviveTime) { this.revive(d, helpers[0]); continue; }
      if (d.selfT <= 0) { d.hp -= DOWN.bleed * dt; if (d.hp <= 0) { d.hp = 0; g.kill(null, d, { cause: 'bleed' }); } }
    }
  }
  revive(p, by) {
    p.down = false; p.hp = DOWN.reviveHp; p.stance = 0; p.revT = 0; p.selfT = 0; p.downBy = null; p.reviveTarget = null;
    p.lastDamageT = -99; p.regenAcc = 0;                               // health recovery starts immediately
    this.game.emitTo(p, 'revived', { by: by ? by.name : null });
  }
  // ---- Incursion: Hardpoint on the highest deck
  updateZone(dt, t) {
    const g = this.game, Z = BR.incursion.zone, inside = new Set();
    for (const p of g.players.values()) {
      if (!p.alive || p.down || p.air || Math.hypot(p.x - Z.x, p.z - Z.z) > Z.r || Math.abs(p.y - Z.y) > Z.dy) continue;
      inside.add(p.team); p.zoneT += dt; while (p.zoneT >= 5) { p.zoneT -= 5; g.award(p, 10, 'Captured'); }
    }
    this.zoneStatus = inside.size === 0 ? 'empty' : inside.size > 1 ? 'contested' : [...inside][0];
    if (inside.size === 1) {
      const tm = [...inside][0]; this.acc[tm] += dt;
      while (this.acc[tm] >= 1) { this.acc[tm] -= 1; this.scores[tm]++; if (this.scores[tm] >= BR.incursion.scoreToWin) return this.endIncursion(`${tm.toUpperCase()} captured ${BR.incursion.scoreToWin} points`); }
    }
    if (t >= BR.incursion.time) this.endIncursion('Time is up');
  }
  endIncursion(reason) {
    if (this.ended || this.game.phase !== 'match') return;
    const teams = [...this.startTeams].sort((a, b) => this.scores[b] - this.scores[a]); let place = 0, last = null;
    teams.forEach((tm, i) => { if (last === null || this.scores[tm] !== last) place = i + 1; last = this.scores[tm]; this.teamPlace[tm] = place; });
    for (const p of this.game.players.values()) p.place = this.teamPlace[p.team] || 0;
    const top = teams.filter(tm => this.teamPlace[tm] === 1); this.ended = true;
    this.game.endMatch(top.length === 1 ? top[0] : null, top.length === 1 ? reason : 'Draw · ' + reason);
  }
  // ---- Resurgence: a team is out when nobody on it is alive / downed and nobody can respawn; the last team standing wins
  checkTeams(leaving) {
    if (this.ended || this.game.phase !== 'match' || this.sub === 'incursion') return;
    const teams = [...this.startTeams], still = teams.filter(t => !this.out[t] && this.presentIn(t, leaving)), gone = teams.filter(t => !this.out[t] && !still.includes(t));
    if (!gone.length) return;
    const end = (this.startTeams.size >= 2 && still.length <= 1) || still.length === 0, place = still.length + 1;
    for (const t of gone) {
      this.out[t] = true; this.teamPlace[t] = place;
      for (const m of this.game.players.values()) if (m.team === t) { m.place = place; if (!end) this.game.emitTo(m, 'place', { place, total: this.startTeams.size }); }   // (#N screen; at the end the match:end overlay does it)
    }
    if (end) {
      const w = still[0] || null; if (w) { this.teamPlace[w] = 1; for (const m of this.game.players.values()) if (m.team === w) m.place = 1; }
      this.ended = true; this.game.endMatch(w, w ? `${w.toUpperCase()} is the last team standing` : 'Everyone was eliminated');
    }
  }
  onKill() { this.checkTeams(); }
  onPlayerLeave(p) { if (p.alive) p.alive = false; this.left.push(p); this.checkTeams(p); }
  aliveList() { return [...this.game.players.values()].filter(p => p.alive); }
  ranking() {
    const all = [...this.game.players.values(), ...this.left.filter(p => !this.game.players.has(p.id))];
    return all.map(p => ({ id: p.id, name: p.name, team: p.team, place: this.teamPlace[p.team] || 1, k: p.kills, s: p.score })).sort((a, b) => a.place - b.place || b.k - a.k);
  }
  // per-player HUD data (the 'br' block of the snapshot): respawns left, helicopter timer, revive progress
  youState(p) {
    const near = p.reviveNear;
    return { rl: this.sub === 'incursion' ? -1 : p.respawnsLeft, cr: this.canRespawn(p) ? 1 : 0, hl: p.heli ? Math.max(0, +(BR.heli.maxStay - p.heliT).toFixed(1)) : 0,
      dn: p.down ? { self: +(p.selfT / DOWN.selfTime).toFixed(3), team: +(p.revT / DOWN.reviveTime).toFixed(3) } : null,
      rt: near ? { n: near.name, f: +(near.revT / DOWN.reviveTime).toFixed(3), h: p.reviveTarget ? 1 : 0 } : null };
  }
  state() {
    const r = this.ring || this.ringAt(0), t = this.game.now - this.t0;
    return { type: 'br', sub: this.sub, alive: this.aliveList().length, total: this.startCount, teamsLeft: this.sub === 'incursion' ? this.startTeams.size : this.teamsLeft(), t: Math.round(t),
      ring: { r: +r.r.toFixed(2), cx: +r.cx.toFixed(2), cz: +r.cz.toFixed(2), frac: +r.frac.toFixed(3), phase: r.phase, next: +r.next.toFixed(1), nxt: r.nxt ? { cx: +r.nxt.cx.toFixed(2), cz: +r.nxt.cz.toFixed(2), r: +r.nxt.r.toFixed(2) } : null },
      heli: this.heli.gone ? null : { x: +this.heli.x.toFixed(2), y: +this.heli.y.toFixed(2), z: +this.heli.z.toFixed(2), st: this.heli.st },
      win: this.sub === 'resurgence' && this.windowOpen ? Math.max(0, Math.ceil(BR.resurgence.window - t)) : 0,
      inc: this.sub === 'incursion' ? { scores: this.scores, target: BR.incursion.scoreToWin, left: Math.max(0, Math.ceil(BR.incursion.time - t)), status: this.zoneStatus, zone: BR.incursion.zone } : null };
  }
  summary() { return { red: this.teamsLeft(), blue: this.startTeams.size, label: 'Teams' }; }
}
