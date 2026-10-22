// SHOOTING RANGE: a permanent room for calibrating weapons. No PvP, static target dummies (they "die" and come back), nobody ever wins.
import { Mode } from './base.js';
import { RANGE_TARGETS } from '../../maps/range.js';

export class RangeMode extends Mode {
  constructor(game) {
    super(game); this.id = 'range'; this.spawnIdx = 0;
    this.rules = { maxArmor: 50, maxPlates: 9, startArmor: 50, startPlates: 3, killPlate: false, startThrow: 2, energyReset: false };
    this.zombies = RANGE_TARGETS.map(([x, z], i) => ({ id: 'd' + i, x, y: 0, z, yaw: 0, stance: 0, slideT: 0, hp: 100, maxhp: 100, alive: true, back: 0, history: [] }));
  }
  hostile() { return false; }                                       // PvP disabled
  canRespawn() { return true; }
  spawnPoint() { const s = this.game.map.spawns.red; return s[this.spawnIdx++ % s.length]; }
  start() {}
  update(dt) { for (const z of this.zombies) if (!z.alive && (z.back -= dt) <= 0) { z.alive = true; z.hp = z.maxhp; } }
  // E in the range: apply the new loadout RIGHT NOW (new guns, skill) without moving the player
  applyLoadout(p) {
    const keep = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }, g = this.game;
    g.spawnPlayer(p, { protect: 0 }); Object.assign(p, { x: keep.x, y: keep.y, z: keep.z, yaw: keep.yaw, pitch: keep.pitch });
  }
  // called by server/combat.js: dummies only show damage (a dummy with <= 0 hp falls over and returns after 1.5 s)
  hitZombie(z, a, dmg, o) {
    if (!z.alive) return; z.hp -= dmg; const dead = z.hp <= 0;
    if (dead) { z.alive = false; z.back = 1.5; }
    if (a) this.game.emitTo(a, 'hit', { v: z.id, head: !!o.head, armor: false, broke: false, kill: dead, dmg: Math.round(dmg), hp: Math.max(0, Math.round(z.hp)), mh: z.maxhp, ar: 0, ma: 0, ad: 0, hd: Math.round(dmg) });
  }
  zombieSnap() { return this.zombies.filter(z => z.alive).map(z => ({ id: z.id, x: z.x, y: 0, z: z.z, yaw: z.yaw, hp: Math.round(z.hp) })); }
  state() { return { type: 'range', targets: this.zombies.length }; }
  summary() { return {}; }
  onPlayerLeave() {}
}
