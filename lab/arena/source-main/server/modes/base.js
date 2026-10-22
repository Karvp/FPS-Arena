// Mode interface. The room (server/game.js) calls these hooks; modes never touch sockets directly.
export class Mode {
  constructor(game) {
    this.game = game; this.id = 'base';
    this.rules = { maxArmor: 50, maxPlates: 9, startArmor: 50, startPlates: 1, killPlate: true, startThrow: 2, energyReset: false, glideGuard: 0 };
  }
  start() {}
  update(dt) {}
  onKill(killer, victim) {}
  onPlayerLeave(p) {}
  canRespawn(p) { return true; }
  combatOn() { return true; }
  hostile(a, b) { return a !== b && a.team !== b.team; }          // may `a` damage `b`?
  startWeapons(p) { return null; }                                // null = default primary + secondary
  state() { return { type: this.id }; }
  summary() { return {}; }
  // choose the safest of a few random candidates (farthest from living enemies)
  safeSpawn(list, p) {
    let best = null, bd = -1;
    for (let i = 0; i < Math.min(4, list.length); i++) {
      const c = list[Math.floor(Math.random() * list.length)];
      let d = 1e9;
      for (const q of this.game.players.values()) if (q.alive && q.team !== p.team) d = Math.min(d, Math.hypot(q.x - c.x, q.z - c.z));
      if (d > bd) { bd = d; best = c; }
    }
    return best;
  }
}
