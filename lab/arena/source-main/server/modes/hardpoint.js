import { Mode } from './base.js';
import { HARDPOINT } from '../../shared/constants.js';

export class Hardpoint extends Mode {
  constructor(game) { super(game); this.id = 'hp'; this.scores = { red: 0, blue: 0 }; this.acc = { red: 0, blue: 0 }; this.zone = null; this.zoneEnd = 0; this.status = 'empty'; this.lastId = null; }
  start() { for (const p of this.game.players.values()) this.game.spawnPlayer(p); this.nextZone(); }
  nextZone() {
    const list = this.game.map.hardpoints.filter(h => h.id !== this.lastId);
    this.zone = list[Math.floor(Math.random() * list.length)]; this.lastId = this.zone.id;
    this.zoneEnd = this.game.now + HARDPOINT.zoneTime;
    this.game.announce('HARDPOINT RELOCATED', 'info');
  }
  botGoal() { return this.zone ? { x: this.zone.x, y: 0, z: this.zone.z } : null; }          // Reserved Echelon bots head for the point
  spawnPoint(p) { const m = this.game.map.spawns; return this.safeSpawn(m.red.concat(m.blue), p); }   // random respawns
  update(dt) {
    const g = this.game;
    if (g.now >= this.zoneEnd) this.nextZone();
    let r = 0, b = 0;
    for (const p of g.players.values()) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - this.zone.x, p.z - this.zone.z) <= HARDPOINT.radius && p.y < 4) {
        (p.team === 'red' ? r++ : b++);
        p.zoneT += dt; while (p.zoneT >= 5) { p.zoneT -= 5; g.award(p, 10, 'Captured'); }      // +10 for every 5 s spent in the hardpoint
      }
    }
    this.status = r && b ? 'contested' : r ? 'red' : b ? 'blue' : 'empty';
    if (this.status === 'red' || this.status === 'blue') {
      this.acc[this.status] += dt;
      while (this.acc[this.status] >= 1) {
        this.acc[this.status] -= 1; this.scores[this.status]++;
        if (this.scores[this.status] >= HARDPOINT.scoreToWin) { g.endMatch(this.status, `${this.status.toUpperCase()} captured ${HARDPOINT.scoreToWin} points`); return; }
      }
    }
  }
  // kills do NOT add score in Hardpoint
  state() {
    return { type: 'hp', scores: this.scores, target: HARDPOINT.scoreToWin, status: this.status,
      zone: { id: this.zone.id, x: this.zone.x, z: this.zone.z, r: HARDPOINT.radius, left: Math.max(0, +(this.zoneEnd - this.game.now).toFixed(1)) } };
  }
  summary() { return { red: this.scores.red, blue: this.scores.blue, label: 'Points' }; }
}
