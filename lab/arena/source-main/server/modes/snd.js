import { Mode } from './base.js';
import { SND } from '../../shared/constants.js';

const other = (t) => (t === 'red' ? 'blue' : 'red');
const r2 = (v) => Math.round(v * 100) / 100;

export class SearchAndDestroy extends Mode {
  constructor(game) {
    super(game); this.id = 'snd';
    this.round = 0; this.wins = { red: 0, blue: 0 }; this.attackers = 'red'; this.phase = 'freeze'; this.phaseEnd = 0;
    this.sites = []; this.bomb = { state: 'none' }; this.bombEnd = 0; this.plant = { pid: null, p: 0 }; this.defuse = { pid: null, p: 0 };
    this.startCount = { red: 0, blue: 0 }; this.result = null; this.matchOver = false;
  }
  get defenders() { return other(this.attackers); }
  start() { this.beginRound(); }
  combatOn() { return this.phase === 'active' || this.phase === 'planted'; }

  pickSites() {
    const map = this.game.map, cen = (t) => { const s = map.spawns[t]; return { x: s.reduce((a, c) => a + c.x, 0) / s.length, z: s.reduce((a, c) => a + c.z, 0) / s.length }; };
    const D = cen(this.defenders), A = cen(this.attackers);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    let cands = [];
    for (const margin of [12, 6, 0]) { cands = map.sites.filter(s => dist(s, D) + margin < dist(s, A)); if (cands.length >= 2) break; }   // defender-biased
    if (cands.length < 2) cands = map.sites.slice();
    const pairs = [];
    for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) if (dist(cands[i], cands[j]) >= 20) pairs.push([cands[i], cands[j]]);
    const pair = pairs.length ? pairs[Math.floor(Math.random() * pairs.length)] : [cands[0], cands[1] || cands[0]];
    this.sites = [{ id: 'A', x: pair[0].x, z: pair[0].z }, { id: 'B', x: pair[1].x, z: pair[1].z }];
  }

  beginRound() {
    const g = this.game;
    this.round++;
    this.attackers = this.round % 2 === 1 ? 'red' : 'blue';           // roles switch every round
    this.pickSites();
    this.phase = 'freeze'; this.phaseEnd = g.now + SND.freezeTime; this.result = null;
    g.invulnerable = true;
    this.plant = { pid: null, p: 0 }; this.defuse = { pid: null, p: 0 }; this.bomb = { state: 'none' };
    this.startCount = { red: 0, blue: 0 };
    for (const p of g.players.values()) { p.hasBomb = false; g.spawnPlayer(p, { frozen: true, protect: 0 }); this.startCount[p.team]++; }
    const atk = [...g.players.values()].filter(p => p.team === this.attackers);
    if (atk.length) { const c = atk[Math.floor(Math.random() * atk.length)]; c.hasBomb = true; this.bomb = { state: 'carried', pid: c.id, x: c.x, y: c.y, z: c.z }; }
    g.announce(`ROUND ${this.round}`, 'round');
  }
  spawnPoint(p) { const l = this.game.map.spawns[p.team], i = this.spawnIdx = ((this.spawnIdx || 0) + 1) % l.length; return l[i]; }
  canRespawn(p) { return false; }                                       // one life per round
  onPlayerJoin(p) {                                                    // late joiners: in the freeze phase they spawn with everybody, otherwise they spectate until the next round
    if (this.phase === 'freeze') { this.game.spawnPlayer(p, { frozen: true, protect: 0 }); this.startCount[p.team]++; }
    else { p.alive = false; p.spawned = true; }
  }
  onPlayerLeave(p) { if (p.hasBomb) this.dropBomb(p); }

  dropBomb(p) { p.hasBomb = false; this.bomb = { state: 'dropped', x: p.x, y: p.y, z: p.z }; }
  onKill(k, v) { if (v.hasBomb) this.dropBomb(v); }
  alive(team) { let n = 0; for (const p of this.game.players.values()) if (p.team === team && p.alive && !p.echelonOwner) n++; return n; }
  // AI players (waiting-room AI and Reserved Echelon): attackers carry the bomb to a site and plant it (hold F), pick it up when dropped and guard it;
  // defenders hold a site and defuse a planted bomb. Echelon bots only walk to the nearest site (they never carry, plant or defuse).
  botGoal(p) {
    const near = () => { let b = null, bd = Infinity; for (const s of this.sites) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; b = s; } } return b; };
    const site = near(); if (!site) return null;
    if (p.echelonOwner) return { x: site.x, y: site.y || 0, z: site.z };
    const bomb = this.bomb;
    if (p.team === this.attackers) {
      if (p.hasBomb) return { x: site.x, y: site.y || 0, z: site.z, r: 1, ir: SND.siteRadius - 1, interact: true };       // carry it to the site and plant
      if (bomb.state === 'dropped' || bomb.state === 'planted') return { x: bomb.x, y: bomb.y || 0, z: bomb.z, r: 2 };    // recover it / guard the planted bomb
      return { x: site.x, y: site.y || 0, z: site.z, r: 6 };
    }
    if (bomb.state === 'planted') return { x: bomb.x, y: bomb.y || 0, z: bomb.z, r: 0.8, ir: SND.defuseRange - 0.5, interact: true };   // defuse
    return { x: site.x, y: site.y || 0, z: site.z, r: 5 };
  }

  endRound(winner, reason) {
    const g = this.game;
    if (this.phase === 'result') return;
    this.wins[winner]++; this.phase = 'result'; this.phaseEnd = g.now + SND.resultTime; this.result = { winner, reason };
    g.invulnerable = true;                                             // everyone invulnerable, combat frozen
    for (const p of g.players.values()) p.frozen = false;
    g.announce(`${winner.toUpperCase()} WINS THE ROUND`, 'result');
    if (this.wins[winner] >= SND.roundsToWin) { this.matchOver = true; this.matchWinner = winner; this.matchReason = `${winner.toUpperCase()} won ${SND.roundsToWin} rounds`; }
  }

  update(dt) {
    const g = this.game, now = g.now;
    if (this.phase === 'freeze') {
      if (now >= this.phaseEnd) {
        this.phase = 'active'; this.phaseEnd = now + SND.plantWindow; g.invulnerable = false;
        for (const p of g.players.values()) p.frozen = false;
        g.announce('GO!', 'go');
      }
      return;
    }
    if (this.phase === 'result') {
      if (now >= this.phaseEnd) { if (this.matchOver) g.endMatch(this.matchWinner, this.matchReason); else this.beginRound(); }
      return;
    }
    const atkAlive = this.alive(this.attackers), defAlive = this.alive(this.defenders);
    const atkHad = this.startCount[this.attackers] > 0, defHad = this.startCount[this.defenders] > 0;

    // bomb carrier position follows the carrier
    if (this.bomb.state === 'carried') { const c = g.players.get(this.bomb.pid); if (c && c.alive) { this.bomb.x = c.x; this.bomb.y = c.y; this.bomb.z = c.z; } }
    if (this.bomb.state === 'dropped') {
      for (const p of g.players.values()) if (p.alive && !p.echelonOwner && p.team === this.attackers && Math.hypot(p.x - this.bomb.x, p.z - this.bomb.z) <= SND.pickupRange) {
        p.hasBomb = true; this.bomb = { state: 'carried', pid: p.id, x: p.x, y: p.y, z: p.z }; g.announce('BOMB PICKED UP', 'info'); break;
      }
    }

    if (this.phase === 'active') {
      // planting
      const c = this.bomb.state === 'carried' ? g.players.get(this.bomb.pid) : null;
      let site = null;
      if (c && c.alive) for (const s of this.sites) if (Math.hypot(c.x - s.x, c.z - s.z) <= SND.siteRadius) site = s;
      if (c && c.alive && c.interactHeld && site && c.onGround && !c.frozen) {
        this.plant.pid = c.id; this.plant.p += dt / SND.plantTime; g.abil.endPolter(c);
        if (this.plant.p >= 1) {
          this.bomb = { state: 'planted', x: c.x, y: c.y, z: c.z, site: site.id }; c.hasBomb = false;
          this.phase = 'planted'; this.bombEnd = now + SND.bombTime; this.plant = { pid: null, p: 0 }; g.award(c, 10, 'Bomb planted');
          g.announce(`BOMB PLANTED AT ${site.id}`, 'plant'); return;
        }
      } else this.plant = { pid: null, p: 0 };
      if (now >= this.phaseEnd) return this.endRound(this.defenders, 'Time expired before plant');
      if (atkHad && atkAlive === 0) return this.endRound(this.defenders, 'Attackers eliminated');
      if (defHad && defAlive === 0) return this.endRound(this.attackers, 'Defenders eliminated');
    } else if (this.phase === 'planted') {
      // defusing
      let d = null;
      for (const p of g.players.values()) if (p.alive && !p.echelonOwner && p.team === this.defenders && p.interactHeld && !p.frozen && Math.hypot(p.x - this.bomb.x, p.z - this.bomb.z) <= SND.defuseRange && p.onGround) { d = (this.defuse.pid === p.id ? p : d) || p; }
      if (d) {
        g.abil.endPolter(d);
        if (this.defuse.pid !== d.id) this.defuse = { pid: d.id, p: 0 };
        this.defuse.p += dt / SND.defuseTime;
        if (this.defuse.p >= 1) { this.bomb.state = 'defused'; g.award(d, 10, 'Bomb defused'); return this.endRound(this.defenders, 'Bomb defused'); }
      } else this.defuse = { pid: null, p: 0 };
      if (now >= this.bombEnd) { this.bomb.state = 'exploded'; return this.endRound(this.attackers, 'Bomb exploded'); }
      if (defHad && defAlive === 0) return this.endRound(this.attackers, 'Defenders eliminated');
      // attackers eliminated after the plant: the bomb stays active - defenders must still defuse
    }
  }
  state() {
    const left = this.phase === 'planted' ? this.bombEnd - this.game.now : this.phaseEnd - this.game.now;
    return { type: 'snd', phase: this.phase, round: this.round, wins: this.wins, target: SND.roundsToWin, attackers: this.attackers, timer: Math.max(0, r2(left)),
      sites: this.sites, bomb: { state: this.bomb.state, x: r2(this.bomb.x || 0), y: r2(this.bomb.y || 0), z: r2(this.bomb.z || 0), site: this.bomb.site, pid: this.bomb.pid },
      plant: r2(this.plant.p), plantPid: this.plant.pid, defuse: r2(this.defuse.p), defusePid: this.defuse.pid, result: this.result,
      alive: { red: this.alive('red'), blue: this.alive('blue') } };
  }
  summary() { return { red: this.wins.red, blue: this.wins.blue, label: 'Rounds' }; }
}
