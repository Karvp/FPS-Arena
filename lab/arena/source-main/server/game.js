// A ROOM: waiting room (countdown / ready / votes) -> match -> results -> back to the waiting room. One room per kind
// (classic | br | zm | range), see server/hub.js. Authoritative simulation: 60 Hz inputs, 30 Hz snapshots.
import { DT, TICK_RATE, SNAPSHOT_RATE, PLAYER, PLATE_AMOUNT, MODES, CLASSIC_MODES, TEAMS, WAIT_TIME, ROOM_KINDS, RESULT_TIME, PITCH_MAX, BR, BR_TEAMS, BR_TEAM_SIZE, BR_SUBMODES, DOWN } from '../shared/constants.js';
import { stepMove, MOVE_KEYS } from '../shared/movement.js';
import { cleanAtt } from '../shared/attachments.js';
import { stepWeapons, makeWeaponState, cancelActions, curGun, aimLocked } from '../shared/weaponstate.js';
import { WEAPONS, moveMul, secondaryFor } from '../shared/weapons.js';
import { clamp } from '../shared/geometry.js';
import { MAPS, MAP_LIST } from '../maps/index.js';
import { BotBrain } from './bot.js';
import { ServerPlayer } from './player.js';
import { fireWeapon, recordHistory } from './combat.js';
import { Abilities } from './abilities.js';
import { Streaks } from './streaks.js';
import { STREAK_KILL_SCORE } from '../shared/streaks.js';
import { SKILL_LIST, SKILLS, canAim } from '../shared/skills.js';
import { TeamDeathmatch } from './modes/tdm.js';
import { SearchAndDestroy } from './modes/snd.js';
import { Hardpoint } from './modes/hardpoint.js';
import { BattleRoyale } from './modes/br.js';
import { ZombieMode } from './modes/zombie.js';
import { RangeMode } from './modes/range.js';

const MODE_CLASSES = { tdm: TeamDeathmatch, snd: SearchAndDestroy, hp: Hardpoint, br: BattleRoyale, zm: ZombieMode, range: RangeMode };
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;

const BOT_CLASSIC_MAX = 12;                                                       // Classic rooms hold up to 12 players (humans + AI)
export class Game {
  constructor(io, kind = 'classic') {
    this.io = io; this.kind = kind;
    this.players = new Map(); this.queue = new Map();      // queue = players who joined while a match was running (they enter the next waiting room)
    const rk = ROOM_KINDS[kind] || ROOM_KINDS.classic;
    this.config = { mode: rk.mode || 'tdm', map: rk.map || 'arena' }; if (kind === 'br') this.config.sub = 'resurgence';
    this.map = MAPS[this.config.map]; this.mode = null;
    this.phase = 'waiting';                                  // waiting | match | results
    this.tick = 0; this.now = 0; this.invulnerable = false; this.waitEnd = null; this.phaseEnd = 0;
    this.results = null; this.matchId = 0; this.nextId = 1; this.lastLoopMs = 0; this.acc = 0; this.stats = { tickMs: 0 };
    this.abil = new Abilities(this); this.streaks = new Streaks(this);
  }
  worldBoxes() { return this.abil.foamBoxes.length ? this.map.boxes.concat(this.abil.foamBoxes) : this.map.boxes; }       // map + foam walls (block bullets, not players)

  // ---------------------------------------------------------------- networking helpers
  everyone() { return [...this.players.values(), ...this.queue.values()]; }
  emitAll(ev, data) { for (const p of this.players.values()) if (p.socket) p.socket.emit(ev, data); }          // players in the room / match
  emitEveryone(ev, data) { for (const p of this.everyone()) if (p.socket) p.socket.emit(ev, data); }          // incl. queued players
  emitTo(p, ev, data) { if (p && p.socket) p.socket.emit(ev, data); }
  announce(text, kind = 'info') { this.emitAll('announce', { text, kind }); }

  attach(socket, joinData, joinCb) {
    let p = null;
    const guard = (fn) => (...a) => { try { fn(...a); } catch (e) { console.error('[server] handler error:', e); } };
    const doJoin = guard((data, cb) => {
      if (p) return;
      p = this.addPlayer(socket, data);
      if (typeof cb === 'function') cb({ ok: true, id: p.id, t: this.now, kind: this.kind });
      this.broadcastLobby();
    });
    socket.on('join', doJoin);
    socket.on('rtt', (cb) => { if (typeof cb === 'function') cb(this.now); });
    socket.on('input', (i) => { if (p && this.players.has(p.id)) this.queueInput(p, i); });
    socket.on('lobby:team', guard((d) => p && this.setTeam(p, d)));
    socket.on('lobby:start', guard(() => p && this.toggleReady(p)));
    socket.on('loadout', guard((d) => {
      const free = this.kind === 'classic' || this.kind === 'range';                      // weapons / attachments are free in Classic and the Shooting Range (BR / Zombies ignore them)
      if (p && d && p.setLoadout(free ? d.primary : null, free ? d.secondary : null, d.skill, d.throwable, free ? d.attP : null, free ? d.attS : null, this.kind === 'classic' ? d.streaks : undefined)) this.broadcastLobby();
      if (p && p.late && this.players.has(p.id)) this.admitLate(p);
    }));
    socket.on('vote', guard((d) => p && this.castVote(p, d)));
    socket.on('lobby:addai', guard(() => { if (p && this.players.has(p.id) && !this.addBot()) this.emitTo(p, 'lobby:denied', { reason: this.kind === 'zm' ? 'AI players are not available in Zombies' : this.phase !== 'waiting' ? 'AI can only be added in the waiting room' : this.kind === 'br' ? 'All teams are full' : 'The room is full' }); }));
    // In-match loadout change while waiting to respawn (classic modes): the player is held dead until they DEPLOY.
    socket.on('loadout:open', guard(() => { if (p && !p.alive && this.phase === 'match' && this.mode && this.mode.canRespawn(p)) p.hold = true; }));
    socket.on('deploy', guard(() => { if (!p) return; p.hold = false; if (this.kind === 'range' && p.alive && this.phase === 'match' && this.mode && this.mode.applyLoadout) this.mode.applyLoadout(p); }));
    socket.on('disconnect', guard(() => p && this.removePlayer(p)));
    if (joinData !== undefined) doJoin(joinData, joinCb);
  }

  // ---------------------------------------------------------------- waiting room
  addPlayer(socket, data) {
    const id = socket.id || `p${this.nextId++}`;
    const name = String((data && data.name) || '').replace(/[^\w \-\.]/g, '').trim().slice(0, 16) || `Player${this.nextId}`;
    const p = new ServerPlayer(id, name, socket);
    const all = this.everyone(), counts = { red: 0, blue: 0 }; for (const q of all) counts[q.team]++;
    p.team = this.kind === 'classic' ? (counts.red <= counts.blue ? 'red' : 'blue') : (this.kind === 'br' ? (this.freeBrTeam(all) || 'red') : 'red');
    const full = this.kind === 'br' && !this.freeBrTeam(all);                          // all 4 teams full (12 players): wait for the next match
    if (this.phase === 'waiting' && !full) { this.players.set(id, p); if (this.waitEnd == null) this.waitEnd = this.now + WAIT_TIME[this.kind]; }
    else if (this.kind === 'classic' || this.kind === 'range') { this.players.set(id, p); if (this.phase === 'match') { p.late = true; p.lateAt = this.now; } }      // Classic: join the running match (admitted as soon as the loadout arrived); during the short results screen just wait for the waiting room
    else { p.queued = true; this.queue.set(id, p); }
    return p;
  }
  // Battle Royale: the emptiest team that still has a free slot (max BR_TEAM_SIZE each), or null when the room is full
  freeBrTeam(list, except = null) {
    const n = Object.fromEntries(BR_TEAMS.map(t => [t, 0])); for (const q of list) if (q !== except && n[q.team] !== undefined) n[q.team]++;
    const open = BR_TEAMS.filter(t => n[t] < BR_TEAM_SIZE).sort((a, b) => n[a] - n[b]); return open[0] || null;
  }
  // AI players (Battle Royale waiting room): ordinary ServerPlayers driven by a BotBrain (server/bot.js), always ready
  addBot() {
    if ((this.kind !== 'br' && this.kind !== 'classic') || this.phase !== 'waiting') return null;
    let team;
    if (this.kind === 'br') team = this.freeBrTeam(this.everyone());
    else if (this.everyone().length < BOT_CLASSIC_MAX) { const n = { red: 0, blue: 0 }; for (const q of this.everyone()) n[q.team]++; team = n.red <= n.blue ? 'red' : 'blue'; }     // Classic: keep the teams balanced
    if (!team) return null;
    this.botN = (this.botN || 0) + 1; const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];
    const p = new ServerPlayer(`bot${this.botN}`, `AI ${names[(this.botN - 1) % names.length]}${this.botN > names.length ? this.botN : ''}`, { emit() {}, on() {} });
    p.team = team; p.bot = new BotBrain(this); p.ready = true; this.players.set(p.id, p);
    if (this.waitEnd == null) this.waitEnd = this.now + WAIT_TIME[this.kind];
    this.broadcastLobby(); return p;
  }
  humans() { return [...this.players.values()].filter(p => !p.bot); }
  removePlayer(p) {
    this.abil.onDeath(p);                                    // spirit body / placed Discharger of a leaving player vanish
    if (this.mode && this.phase === 'match' && this.players.has(p.id)) this.mode.onPlayerLeave(p);
    this.players.delete(p.id); this.queue.delete(p.id);
    if (!this.humans().length) for (const b of [...this.players.values()]) this.players.delete(b.id);          // nobody left to play against: the AI leaves too
    if (this.phase !== 'waiting' && this.players.size === 0 && this.kind !== 'range') this.toWaiting();
    if (this.phase === 'waiting') { if (!this.players.size) this.waitEnd = null; else this.checkAllReady(); }
    this.broadcastLobby();
  }
  voteCounts() {
    const c = { modes: {}, maps: {} };
    for (const p of this.players.values()) { if (p.vote.mode) c.modes[p.vote.mode] = (c.modes[p.vote.mode] || 0) + 1; if (p.vote.map) c.maps[p.vote.map] = (c.maps[p.vote.map] || 0) + 1; }
    return c;
  }
  lobbyState() {
    const waiting = this.phase === 'waiting', ps = this.everyone().filter(p => !p.echelonOwner);
    return { kind: this.kind, phase: this.phase, inProgress: !waiting, waitEnd: waiting && this.players.size ? this.waitEnd : null, waitTotal: WAIT_TIME[this.kind],
      config: this.config, readyCount: [...this.players.values()].filter(p => p.ready || p.bot).length, total: this.players.size, votes: this.voteCounts(),
      players: ps.map(p => ({ id: p.id, name: p.name, team: p.team, ready: p.ready || !!p.bot, queued: p.queued, primary: p.nextPrimary, skill: !!p.nextSkill, bot: !!p.bot })) };
  }
  broadcastLobby() { this.emitEveryone('lobby', this.lobbyState()); }
  setTeam(p, d) {
    if (this.phase !== 'waiting' || !this.players.has(p.id) || !d) return;
    if (this.kind === 'classic' && TEAMS.includes(d.team)) p.team = d.team;
    else if (this.kind === 'br' && BR_TEAMS.includes(d.team)) {                       // max 3 per team
      if (p.team === d.team) return;
      if ([...this.players.values()].filter(q => q.team === d.team).length >= BR_TEAM_SIZE) return this.emitTo(p, 'lobby:denied', { reason: 'That team is full (max ' + BR_TEAM_SIZE + ')' });
      p.team = d.team;
    } else return;
    this.broadcastLobby();
  }
  castVote(p, d) {
    if ((this.kind !== 'classic' && this.kind !== 'br') || this.phase !== 'waiting' || !this.players.has(p.id) || !d) return;
    if (this.kind === 'br') { if (d.mode && BR_SUBMODES[d.mode]) p.vote.mode = d.mode; this.broadcastLobby(); return; }   // Battle Royale: vote for Resurgence / Incursion
    if (d.mode && CLASSIC_MODES.includes(d.mode)) p.vote.mode = d.mode;            // votes can be changed until the match starts
    if (d.map && MAP_LIST.some(m => m.id === d.map)) p.vote.map = d.map;
    this.broadcastLobby();
  }
  toggleReady(p) {                                                                  // "START (n/m)": the match starts immediately when everybody agrees
    if (this.phase !== 'waiting' || !this.players.has(p.id)) return;
    if (!p.ready && !p.nextSkill) return this.emitTo(p, 'lobby:denied', { reason: 'Choose a SKILL in the loadout before you start' });     // a skill is required
    p.ready = !p.ready; this.broadcastLobby(); this.checkAllReady();
  }
  checkAllReady() { if (this.phase === 'waiting' && this.humans().length > 0 && [...this.players.values()].every(p => p.ready || p.bot)) this.beginFromWaiting(); }
  beginFromWaiting() {
    for (const p of this.players.values()) if (!p.nextSkill) p.nextSkill = SKILL_LIST[Math.floor(Math.random() * SKILL_LIST.length)];     // timer ran out without a choice: random skill
    if (this.kind === 'classic') {
      const c = this.voteCounts(), pick = (tally, cur) => { const e = Object.entries(tally); if (!e.length) return cur; const mx = Math.max(...e.map(x => x[1])), top = e.filter(x => x[1] === mx).map(x => x[0]); return top[Math.floor(Math.random() * top.length)]; };
      this.config.mode = pick(c.modes, this.config.mode); this.config.map = pick(c.maps, this.config.map);
    }
    if (this.kind === 'br') {
      const e = Object.entries(this.voteCounts().modes); if (e.length) { const mx = Math.max(...e.map(x => x[1])), top = e.filter(x => x[1] === mx).map(x => x[0]); this.config.sub = top[Math.floor(Math.random() * top.length)]; }
    }
    this.startMatch();
  }
  toWaiting() {
    for (const p of [...this.queue.values()]) {
      if (this.kind === 'br') { const t = this.freeBrTeam([...this.players.values()]); if (!t) continue; p.team = t; }     // room full: stays queued for the next one
      p.queued = false; this.players.set(p.id, p); this.queue.delete(p.id);
    }
    for (const p of this.players.values()) { p.ready = false; p.vote = {}; p.alive = false; p.spawned = false; p.hold = false; p.hasBomb = false; p.queue.length = 0; p.heli = false; p.down = false; p.kits = 0; p.late = false; }
    this.phase = 'waiting'; this.mode = null; this.invulnerable = false; this.results = null; this.abil.reset(); this.streaks.reset();
    this.waitEnd = this.players.size ? this.now + WAIT_TIME[this.kind] : null;
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------- match lifecycle
  startMatch() {
    this.map = MAPS[this.config.map] || MAPS.arena;
    this.phase = 'match'; this.matchId++; this.results = null; this.invulnerable = false; this.waitEnd = null;
    this.mode = new MODE_CLASSES[this.config.mode](this); this.abil.reset(); this.streaks.reset();
    for (const p of this.players.values()) { this.resetForMatch(p); p.late = false; }
    this.emitAll('match:start', { mode: this.config.mode, map: this.config.map, sub: this.config.sub, matchId: this.matchId, kind: this.kind });
    this.mode.start();
    this.broadcastLobby();
  }
  resetForMatch(p) {
    p.kills = 0; p.deaths = 0; p.score = 0; p.lifeScore = 0; p.streakGot = new Set(); p.streakHave = []; p.special = null; p.view = null; p.empT = 0; p.killTimes = []; p.zoneT = 0; p.energy = 0; p.ready = false; p.spawned = false; p.alive = false;
    p.primary = p.nextPrimary; p.secondary = p.nextSecondary; p.attP = p.nextAttP; p.attS = p.nextAttS; p.hasBomb = false; p.hold = false; p.lastQueued = -1; p.lastSeq = 0; p.queue.length = 0; p.place = 0; p.heli = false; p.down = false; p.kits = 0; p.respawnsLeft = 0;
  }
  // Classic: somebody joined while the match is running -> enters it right away (S&D: spectates until the next round, see SearchAndDestroy.onPlayerJoin)
  admitLate(p) {
    if (!p.late || this.phase !== 'match' || !this.mode) return;
    p.late = false;
    if (!p.nextSkill) p.nextSkill = SKILL_LIST[Math.floor(Math.random() * SKILL_LIST.length)];      // a skill is required: random one if none was chosen
    this.resetForMatch(p);
    this.emitTo(p, 'match:start', { mode: this.config.mode, map: this.config.map, sub: this.config.sub, matchId: this.matchId, kind: this.kind });
    if (this.mode.onPlayerJoin) this.mode.onPlayerJoin(p); else this.spawnPlayer(p);
    this.broadcastLobby();
  }
  scoreboard() { return [...this.players.values()].filter(p => !p.echelonOwner).map(p => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, s: p.score })); }
  endMatch(winner, reason) {
    if (this.phase !== 'match') return;
    this.phase = 'results'; this.invulnerable = true;
    this.results = { winner, reason, mode: this.config.mode, map: this.config.map, kind: this.kind, summary: this.mode.summary(), scoreboard: this.scoreboard(), ranking: this.mode.ranking ? this.mode.ranking() : null };
    this.emitAll('match:end', this.results);
    this.phaseEnd = this.now + RESULT_TIME + (this.mode.endOverlay || (this.kind === 'classic' ? BR.endOverlay : 0));       // modes with a VICTORY / #2 overlay get extra time before the scoreboard
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------- players in a match
  hostile(a, b) { return this.mode ? this.mode.hostile(a, b) : (a !== b && a.team !== b.team); }
  spawnPlayer(p, o = {}) {
    const sp = this.mode.spawnPoint(p), R = this.mode.rules;
    Object.assign(p, { x: sp.x, y: sp.y || 0, z: sp.z, vx: 0, vy: 0, vz: 0, onGround: !sp.air, slideT: 0, slideCd: 0, slideDx: 0, slideDz: 0, slidePrev: false, zl: 0, zt: 0, zd: 1, usePrev: false, air: !!sp.air, heli: !!sp.heli, stance: 0, sprint: false, lean: 0, pronePrev: false, skillPrev: false, dive: 0, hk: 0, hx: 0, hy: 0, hz: 0, hT: 0, skEv: 0, gs: 0 });
    p.yaw = sp.yaw || 0; p.pitch = 0; p.aim = false;
    p.alive = true; p.spawned = true; p.hp = PLAYER.maxHealth; p.maxArmor = R.maxArmor; p.maxPlates = R.maxPlates; p.armor = R.startArmor; p.plates = R.startPlates;
    p.primary = p.nextPrimary; p.secondary = p.nextSecondary; p.attP = p.nextAttP; p.attS = p.nextAttS; const sid = secondaryFor(p.primary, p.secondary); p.ws = this.mode.startWeapons(p) || makeWeaponState(p.primary, sid, cleanAtt(p.primary, p.attP), cleanAtt(sid, p.attS));
    p.down = false; p.downBy = null; p.revT = 0; p.selfT = 0; p.reviveTarget = null; p.kits = 0; p.heliT = 0; p.heliJumpPrev = !!sp.heli;
    p.view = null; p.special = null; p.empT = p.empT || 0; p.streakPrevSlot = -1; p.skThrowPrev = false; if (this.kind === 'classic') this.streaks.applyLoadout(p); else { p.streakSet = []; p.streakHave = []; }
    p.frozen = !!o.frozen; p.protectUntil = this.now + (o.protect ?? PLAYER.spawnProtect);
    p.lastDamageT = -99; p.regenAcc = 0; p.interactHeld = false; p.history.length = 0; p.queue.length = 0; p.epoch++;
    this.abil.onSpawn(p, R);
    p.hold = false; p.lastQueued = -1; p.lastSeq = 0; p.ringT = 0; p.ringAcc = 0;      // a new life / new match restarts the client's input sequence
  }
  combatOn() { return this.phase === 'match' && this.mode && this.mode.combatOn(); }

  // o: {head, weapon, pure (ignores armor), cause ('ring' | 'zombie'), from:[x,z]}
  damage(v, a, dmg, o = {}) {
    if (!v.alive || !this.combatOn() || this.invulnerable || this.now < v.protectUntil) return;
    if (a && a !== v && !this.mode.hostile(a, v)) return;                // no friendly fire / no PvP in Zombies
    dmg = Math.max(0, dmg);
    if (v.air && this.mode.rules.glideGuard) dmg *= 1 - this.mode.rules.glideGuard;     // Battle Royale: gliding players take 80 % less damage (ends on landing)
    if (v.warT > 0 && v.warCharge <= 0) dmg *= 1 - SKILLS.warm.reduction;   // Warmonger Activation Kit: 35 % less damage while active
    if (v.gs > 0) dmg *= 1 - SKILLS.grav.reduction;                    // Gravity Spike: 35 % less damage until the slam lands
    const hadArmor = v.armor > 0, aDmg = o.pure ? 0 : Math.min(v.armor, dmg), hDmg = dmg - aDmg;
    const hpBefore = v.hp;
    v.armor -= (v.kaT > 0 ? aDmg * 0.75 : aDmg); v.hp -= hDmg; /* Kinetic Armor: armor takes 25 % less damage */ v.lastDamageT = this.now; v.regenAcc = 0;
    const broke = hadArmor && v.armor <= 0 && aDmg > 0, spirit = v.hp <= 0 && !!v.dsr, dead = v.hp <= 0 && !spirit;   // a defeated spirit is not a death
    if (a && a !== v) this.abil.lifesteal(a, aDmg + Math.min(hDmg, Math.max(0, hpBefore)));          // Warmonger lifesteal (damage dealt to other players)
    const from = o.from || (a ? [a.x, a.z] : null);
    if (!o.silent) this.emitTo(v, 'dmg', { hp: Math.max(0, Math.round(v.hp)), armor: Math.round(v.armor), h: Math.round(hDmg), a: Math.round(aDmg), from });   // vignette on the VICTIM
    if (a && a !== v && !o.silent) this.emitTo(a, 'hit', { v: v.id, head: !!o.head, armor: aDmg > 0 && hDmg <= 0, broke, kill: dead, dmg: Math.round(dmg),
      hp: Math.max(0, Math.round(v.hp)), mh: PLAYER.maxHealth, ar: Math.round(v.armor), ma: v.maxArmor, ad: Math.round(aDmg), hd: Math.round(hDmg) });   // victim's remaining health / armor for the enemy health bar
    if (spirit) this.abil.dsrReturn(v, 'spirit');                      // back into the body: no kill for the enemy, no death for the player
    else if (dead) this.kill(a, v, o);
  }
  // Downed (Battle Royale): lethal damage knocks the player down instead of killing: 100 hp that bleed away, no moving / firing / skills,
  // Self-Revive Kit (5 s) or a teammate (7 s) gets them up with 20 hp. Damage while downed, or bleeding out, is the real death.
  goDown(a, v, o) {
    v.down = true; v.downBy = a && a !== v ? a : null; v.hp = DOWN.hp; v.armor = 0; v.revT = 0; v.selfT = 0; v.reviveTarget = null; v.stance = 2; v.slideT = 0; v.sprint = false; v.zl = 0; v.hk = 0; v.lean = 0; v.aim = false;
    v.lastDamageT = this.now; v.regenAcc = 0; cancelActions(v.ws); this.abil.onDown(v);
    const cause = o.cause === 'ring' ? 'The Ring' : (o.weapon ? WEAPONS[o.weapon].name : '');
    this.emitAll('kill', { k: a ? a.id : null, kn: a ? a.name : (o.cause === 'ring' ? 'THE RING' : ''), kt: a ? a.team : '', v: v.id, vn: v.name, vt: v.team, w: o.weapon || '', wn: o.wn || cause, h: !!o.head, dn: 1 });
    this.emitTo(v, 'downed', { hp: DOWN.hp });
  }
  kill(a, v, o = {}) {
    if (v.echelonOwner) return this.streaks.echelonDied(a, v, o);                                    // a Reserved Echelon bot: no stats, no respawn
    if (a && a.echelonOwner) { o = { ...o, streak: true, wn: o.wn || 'Reserved Echelon' }; a = a.echelonOwner; }       // its kills belong to whoever called it
    if (!v.down && this.mode.canDown && this.mode.canDown(v)) return this.goDown(a, v, o);
    if (v.down && o.cause === 'bleed' && v.downBy) a = v.downBy;                  // bled out: the player who downed them gets the kill
    v.down = false; v.revT = 0; v.selfT = 0; v.reviveTarget = null; v.kits = 0; v.heli = false;
    const kupiV = v; this.abil.onDeath(v); this.abil.onPlayerDied(kupiV); this.streaks.onDeath(v); v.alive = false; v.hp = 0; v.deaths++; cancelActions(v.ws); v.respawnAt = this.now + PLAYER.respawnDelay; v.interactHeld = false;
    if (a && a !== v && this.mode.hostile(a, v)) { a.kills++; if (this.mode.rules.killPlate) a.plates = Math.min(v.maxPlates, a.plates + 1); if (o.streak) this.award(a, STREAK_KILL_SCORE, 'Scorestreaks kill'); else this.awardKill(a, !!o.head); this.abil.onKill(a, o); }   // +1 armor plate per kill (Classic); +10 energy
    const cause = o.cause === 'ring' ? 'The Ring' : o.cause === 'zombie' ? 'Zombie' : o.cause === 'bleed' ? 'Bled out' : (o.weapon ? WEAPONS[o.weapon].name : '');
    this.emitAll('kill', { k: a ? a.id : null, kn: a ? a.name : (o.cause === 'ring' ? 'THE RING' : o.cause === 'zombie' ? 'ZOMBIE' : ''), kt: a ? a.team : '', v: v.id, vn: v.name, vt: v.team, w: o.weapon || '', wn: o.wn || cause, h: !!o.head });
    if (this.mode) this.mode.onKill(a, v);
  }

  // ---------------------------------------------------------------- score (shown as +100 "Enemy killed" ... and on the scoreboard)
  award(p, pts, why) { if (!p || !p.socket) return; p.score += pts; p.lifeScore += pts; this.emitTo(p, 'score', { pts, why }); this.streaks.onScore(p); }
  // kill: +100, headshot +50, multi-kill (2..5 kills within 30 s) +20/+30/+40/+50, kill with < 50 health +20
  awardKill(a, head) {
    this.award(a, 100, 'Enemy killed');
    if (head) this.award(a, 50, 'Headshot');
    a.killTimes = a.killTimes.filter(t => this.now - t < 30); a.killTimes.push(this.now);
    const n = a.killTimes.length, names = { 2: 'Double kill', 3: 'Triple kill', 4: 'Quadra kill', 5: 'Penta kill' };
    if (names[n]) this.award(a, n * 10, names[n]);
    if (n >= 5) a.killTimes = [];
    if (a.alive && a.hp < 50) this.award(a, 20, 'On verge of death');
  }

  queueInput(p, i) {
    if (!i || typeof i !== 'object' || this.phase === 'waiting') return;
    if (p.queue.length > 30) return;                                    // flood protection
    if (num(i.ep, -1) !== p.epoch) return;                             // stale epoch (previous life/match): never let it touch sequencing
    const seq = num(i.seq, -1); if (seq <= p.lastQueued) return; p.lastQueued = seq;
    p.queue.push({
      seq, ep: num(i.ep), forward: !!i.forward, backward: !!i.backward, left: !!i.left, right: !!i.right, jump: !!i.jump, slide: !!i.slide,
      streak: i.streak === 0 || i.streak === 1 || i.streak === 2 ? i.streak : -1, reload: !!i.reload, aim: !!i.aim, interact: !!i.interact, use: !!i.use, fire: !!i.fire, plate: !!i.plate, slot: i.slot === 0 || i.slot === 1 ? i.slot : -1,
      crouch: !!(i.crouch ?? i.slide), prone: !!i.prone, lean: i.lean > 0 ? 1 : i.lean < 0 ? -1 : 0, skill: !!i.skill, throw: !!i.throw,
      yaw: num(i.yaw), pitch: clamp(num(i.pitch), -PITCH_MAX, PITCH_MAX), lt: num(i.lt, this.now),
    });
  }

  processInput(p, inp) {
    if (inp.ep !== p.epoch) return;                                    // stale input from before a respawn
    if (aimLocked(p.ws)) inp = { ...inp, yaw: p.ws.lock[0], pitch: p.ws.lock[1] };      // EM2 wind-up: the aim is locked
    p.lastSeq = inp.seq; p.yaw = inp.yaw; p.pitch = inp.pitch; p.simT += DT;
    this.streaks.handleInput(p, inp);                                  // scorestreak keys / camera views / special throws (may clear movement + fire while in a camera)
    const ab = this.abil, useEdge = inp.use && !p.usePrev;             // (stepMove updates usePrev)
    const skEdge = inp.skill && !p.skillPrevS; p.skillPrevS = inp.skill;
    const elig = ab.eligible(p, skEdge), fx = ab.fxFor(p, elig);       // skill activation decided by the server, executed by the shared movement code
    p.aim = inp.aim && canAim(p, ab.flags(p));                         // no ADS on a zipline / hook / in the air / launched by a Discharger
    p.interactHeld = p.alive && !p.down && (inp.use || inp.interact);  // F = plant / defuse / revive (hold)
    p.selfHeld = p.alive && p.down && !!inp.plate;                     // downed: hold V = Self-Revive Kit
    if (p.heli && p.alive && this.mode.heliInput) this.mode.heliInput(p, inp, useEdge);   // jump / F leaves the helicopter (mode decides)
    if (p.alive) stepMove(p, inp, DT, moveMul(curGun(p.ws).id, p.aim, p.ws.plateT > 0), this.map, p.frozen || p.down, fx);
    ab.afterMove(p, elig);
    const ctx = { alive: p.alive && !p.down, frozen: p.frozen || p.air || fx.lock, armor: p.armor, plates: p.plates, maxArmor: p.maxArmor, anim: fx.anim, rate: fx.rate };
    const gunId = curGun(p.ws).id;
    const r = stepWeapons(p.ws, { ...inp, aim: p.aim }, DT, ctx);
    if (r.plateDone) { p.armor = Math.min(p.maxArmor, p.armor + PLATE_AMOUNT); p.plates = Math.max(0, p.plates - 1); }
    if (r.fired) { ab.endPolter(p); }                                  // firing ends Poltergeist
    if (r.fired && this.combatOn() && !p.echelonOwner) fireWeapon(this, p, inp);
    if (r.fired && p.annih) ab.annihFired(p);
    if (r.fired && gunId === 'em2') ab.em2Fired(p);
    ab.cleanse(p, !!inp.use);                                          // hold F: remove the Therapeutic debuff
    ab.handleThrow(p, inp);
    if (useEdge && p.alive && !p.down && !p.heli && this.mode.onUse) this.mode.onUse(p);     // F: open crate / swap gun
  }

  // ---------------------------------------------------------------- simulation tick (60 Hz)
  step() {
    this.tick++; this.now = this.tick * DT;
    if (this.phase === 'waiting') {
      for (const p of this.players.values()) p.queue.length = 0;
      if (this.players.size) { if (this.waitEnd == null) this.waitEnd = this.now + WAIT_TIME[this.kind]; else if (this.now >= this.waitEnd) this.beginFromWaiting(); }
      return;
    }
    if (this.phase === 'match') for (const p of this.players.values()) if (p.bot && p.alive) { const inp = p.bot.think(p); if (inp) { p.queue.length = 0; p.queue.push(inp); } }     // AI: its brain writes this tick's input
    for (const p of this.players.values()) {
      const n = p.queue.length > 4 ? 2 : 1;                           // catch up gently after jitter, never fast-forward unboundedly
      for (let i = 0; i < n && p.queue.length; i++) { const inp = p.queue.shift(); if (this.phase === 'match') this.processInput(p, inp); }
    }
    if (this.phase === 'match') {
      for (const p of this.players.values()) if (p.late && this.now - p.lateAt > 3) this.admitLate(p);       // fallback: no loadout message arrived
      this.abil.tick(DT); this.streaks.tick(DT);
      this.mode.update(DT);
      if (this.phase !== 'match') return;
      for (const p of this.players.values()) {
        if (!p.spawned) continue;
        if (p.alive) {
          if (!p.down && !p.echelonOwner && p.hp < PLAYER.maxHealth && this.now - p.lastDamageT >= PLAYER.regenDelay) {                                 // health regen (all modes)
            p.regenAcc += DT;
            while (p.regenAcc >= PLAYER.regenInterval && p.hp < PLAYER.maxHealth) { p.hp = Math.min(PLAYER.maxHealth, p.hp + 1); p.regenAcc -= PLAYER.regenInterval; }
          }
        } else if (this.mode.canRespawn(p) && !p.hold && this.now >= p.respawnAt) { this.spawnPlayer(p); if (this.mode.onRespawn) this.mode.onRespawn(p); }
      }
      recordHistory(this);
    } else if (this.phase === 'results' && this.now >= this.phaseEnd) this.toWaiting();
    if (this.phase !== 'waiting' && this.tick % (TICK_RATE / SNAPSHOT_RATE) === 0) this.sendSnapshots();
  }

  sendSnapshots() {
    const modeState = this.mode ? this.mode.state() : null, zm = this.mode && this.mode.zombieSnap ? this.mode.zombieSnap() : null;
    const skSnap = this.streaks.snap(), pl = [], tmOf = (p) => (this.kind === 'classic' ? (p.team === 'red' ? 0 : 1) : (this.kind === 'br' ? Math.max(0, BR_TEAMS.indexOf(p.team)) : 0));
    for (const p of this.players.values()) {
      if (!p.spawned) continue;
      pl.push({ id: p.id, x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(p.yaw), pitch: r3(p.pitch), al: p.alive ? 1 : 0, tm: tmOf(p),
        sl: p.slideT > 0 ? 1 : 0, sn: p.stance || 0, sp: p.sprint ? 1 : 0, ln: Math.round((p.lean || 0) * 100) / 100, ex: (p.exoT > 0 || p.exoCharge > 0) ? 1 : 0, ka: p.kaT > 0 ? 1 : 0, iv: p.polterT > 0 ? 1 : 0, hk: p.hk ? [r3(p.hx), r3(p.hy), r3(p.hz)] : 0, w: curGun(p.ws).id, at: curGun(p.ws).att || 0, aim: p.aim ? 1 : 0, k: p.kills, d: p.deaths, sc: p.score, hp: Math.round(p.hp), bomb: p.hasBomb ? 1 : 0, inv: this.invulnerable || this.now < p.protectUntil ? 1 : 0, pl: p.ws.plateT > 0 ? 1 : 0, zl: p.zl ? 1 : 0, air: p.air ? 1 : 0, dn: p.down ? 1 : 0, ech: p.echelonOwner ? 1 : 0, ds: p.dsr ? 1 : 0, ch: p.exoCharge > 0 ? 1 : 0, wm: p.warT > 0 && p.warCharge <= 0 ? 1 : 0 });
    }
    const bd = this.abil.bodySnap(tmOf);
    for (const p of this.players.values()) {
      if (p.bot) continue;                                                // AI players have no client to send to
      const you = { yaw: r4(p.yaw), alive: p.alive, hp: Math.round(p.hp), armor: Math.round(p.armor), plates: p.plates, maxArmor: p.maxArmor, maxPlates: p.maxPlates, fz: p.frozen || p.down || !!p.view, hold: p.hold, ss: this.streaks.you(p), tm: tmOf(p), dn: p.down, kits: p.kits | 0, br: this.mode && this.mode.youState ? this.mode.youState(p) : null, ws: p.ws, team: p.team,
        place: p.place, ringRate: p.ringRate || 0, sk: { id: p.skill, e: Math.floor(p.energy * 10) / 10, a: p.exoCharge > 0 ? p.exoT : p.warCharge > 0 ? p.warT : Math.max(p.exoT, p.kaT, p.polterT, p.warT, p.dsr ? p.dsr.t : 0, p.em2 ? 1 : 0, p.gs > 0 ? 1 : 0), ch: p.exoCharge > 0 ? p.exoCharge : p.warCharge, al: p.em2 ? 'ROUNDS ' + (p.ws.guns[p.em2.slot].id === 'em2' ? p.ws.guns[p.em2.slot].mag : 0) : p.gs > 0 ? 'SLAMMING' : null }, thr: p.thr, fxs: this.abil.flags(p), marks: this.abil.markIds(p), mk: [...this.players.values()].some(o => o !== p && (o.marks.get(p.id) || 0) > this.now), em2: this.abil.isEm2Marked(p), fl: +p.flashT.toFixed(2),
        deb: p.tumDebT > 0 ? { h: p.tumHeavyT > 0 ? 1 : 0, t: +(p.tumHeavyT > 0 ? p.tumHeavyT : p.tumDebT).toFixed(1), c: +(p.cleanseT / SKILLS.tum.debuff.cleanse).toFixed(2) } : 0, dsr: p.dsr ? { t: +p.dsr.t.toFixed(1), b: [r3(p.dsr.body.x), r3(p.dsr.body.y), r3(p.dsr.body.z)], hp: Math.round(p.dsr.body.hp), ar: Math.round(p.dsr.body.armor) } : 0, gas: Math.round(p.gas * 100) / 100, respawn: p.alive ? 0 : Math.max(0, +(p.respawnAt - this.now).toFixed(1)) };
      for (const k of MOVE_KEYS) you[k] = typeof p[k] === 'number' ? r4(p[k]) : p[k];
      this.emitTo(p, 'snap', { t: r3(this.now), tick: this.tick, ack: p.lastSeq, ep: p.epoch, you, pl, zm, mode: modeState, phase: this.phase, mid: this.matchId, bd, ...this.abil.snap(p), ...skSnap });
    }
  }

  // fixed-timestep driver
  loop() {
    const t = Number(process.hrtime.bigint() / 1000n) / 1000;
    if (!this.lastLoopMs) this.lastLoopMs = t;
    this.acc += Math.min(250, t - this.lastLoopMs); this.lastLoopMs = t;
    const step = 1000 / TICK_RATE; let n = 0;
    while (this.acc >= step && n < 8) { const s = performance.now(); this.step(); this.stats.tickMs = performance.now() - s; this.acc -= step; n++; }
    if (n === 8) this.acc = 0;
  }
  start() { if (this.kind === 'range' && this.phase !== 'match') this.startMatch(); this.timer = setInterval(() => this.loop(), 4); }
  stop() { clearInterval(this.timer); }
}
