// ZOMBIES on Dead Marsh: co-op waves, no PvP. Zombies follow a navigation flow field (stairs included) and move 5 % faster than a player.
import { Mode } from './base.js';
import { ZM, DT } from '../../shared/constants.js';
import { WEAPONS } from '../../shared/weapons.js';
import { newMoveState, stepMove } from '../../shared/movement.js';
import { getNav } from '../../shared/nav.js';
import { makeGunsState } from '../../shared/weaponstate.js';
import { rayWorld } from '../../shared/geometry.js';
import { Loot } from '../loot.js';
import { RARITY_IDX } from '../../shared/rarity.js';

const ZFX = { speed: 1, anim: 1, lock: false, noSprint: true, skill: null, skillAct: false };   // zombies run at 1.05 x walking speed, never sprint
export class ZombieMode extends Mode {
  constructor(game) {
    super(game); this.id = 'zm'; this.loot = new Loot(game, { minRarity: RARITY_IDX.purple }); this.nav = getNav(game.map);
    this.rules = { maxArmor: 150, maxPlates: 5, startArmor: 50, startPlates: 1, killPlate: false, startThrow: 0, energyReset: true };
    this.wave = 0; this.zombies = []; this.nid = 1; this.toSpawn = 0; this.spawnT = 0; this.waveTotal = 0; this.killedInWave = 0; this.waveDelay = 0;
    this.fields = new Map(); this.fieldT = 0; this.crateT = 0; this.ended = false; this.spawnIdx = 0; this.zhp = 60;
  }
  hostile() { return false; }                                         // PvP disabled
  canRespawn() { return false; }                                      // dead players come back when the next wave starts
  startWeapons() { return makeGunsState([{ id: 'makarov', mag: WEAPONS.makarov.magSize, reserve: 64 }, { id: 'fists', mag: 0, reserve: 0 }], true); }
  spawnPoint(p) { const s = this.game.map.playerSpawns; if (p.zmSlot === undefined) p.zmSlot = this.spawnIdx++; return s[p.zmSlot % s.length]; }   // fixed spawn per player
  start() {
    const g = this.game, c = g.map.crates.slice().sort(() => Math.random() - 0.5).slice(0, ZM.startCrates); c.forEach(x => this.loot.addCrate(x));
    for (const p of g.players.values()) g.spawnPlayer(p, { protect: 3 });
    this.startWave(1);
  }
  startWave(n) {
    const g = this.game, np = Math.max(1, g.players.size);
    this.wave = n; this.waveTotal = Math.min(140, Math.round((6 + 4 * n) * (0.6 + 0.4 * np))); this.toSpawn = this.waveTotal; this.killedInWave = 0; this.waveDelay = 0;
    this.zhp = Math.min(300, 60 + 12 * n);
    g.announce(`WAVE ${n}`, 'round');
    if (n > 1) for (const p of g.players.values()) if (!p.alive) g.spawnPlayer(p, { protect: 3 });   // eliminated players respawn on a new wave
  }
  onUse(p) { this.loot.use(p); }
  spawnZombie() {
    const g = this.game, pts = g.map.zombieSpawns, alive = [...g.players.values()].filter(p => p.alive);
    let cand = pts.filter(s => alive.every(p => Math.hypot(p.x - s.x, p.z - s.z) > 32)); if (!cand.length) cand = pts;
    const s = cand[Math.floor(Math.random() * cand.length)];
    const z = Object.assign(newMoveState(s.x + (Math.random() - 0.5) * 2, 0, s.z + (Math.random() - 0.5) * 2), { id: 'z' + this.nid++, hp: this.zhp, maxhp: this.zhp, yaw: 0, atk: 0, wave: this.wave, alive: true, history: [], node: -1, nodeT: 0 });
    this.zombies.push(z); this.toSpawn--;
  }
  update(dt) {
    const g = this.game, alive = [...g.players.values()].filter(p => p.alive);
    if (this.waveDelay > 0) { this.waveDelay -= dt; if (this.waveDelay <= 0) this.startWave(this.wave + 1); }
    else if (this.killedInWave >= Math.ceil(this.waveTotal * ZM.nextWaveFrac)) this.waveDelay = 3;          // next wave after 80 % of this one is dead
    if (this.toSpawn > 0 && this.zombies.length < ZM.maxAlive && (this.spawnT -= dt) <= 0) { this.spawnZombie(); this.spawnT = ZM.spawnGap; }
    this.fieldT -= dt;
    if (this.fieldT <= 0) { this.fieldT = 0.4; this.fields.clear(); for (const p of alive) this.fields.set(p.id, this.nav.field(this.nav.nodeAt(p.x, p.y, p.z))); }
    for (const z of this.zombies) this.think(z, alive);
    this.crateT += dt;
    if (this.crateT >= ZM.crateEvery) {                                // new crates keep appearing around the map
      this.crateT = 0; if (this.loot.crates.filter(c => !c.open).length < ZM.maxCrates) { const c = g.map.crates[Math.floor(Math.random() * g.map.crates.length)]; if (!this.loot.crates.some(x => !x.open && x.x === c[0] && x.z === c[2])) this.loot.addCrate(c); }
    }
    this.loot.update(); this.loot.flush(g.now);
    if (!this.ended && g.players.size && !alive.length) this.onKill();
  }
  think(z, alive) {
    const g = this.game, now = g.now;
    z.history.push({ t: now, x: z.x, y: z.y, z: z.z, s: false }); if (z.history.length > 45) z.history.shift();
    let t = null, bd = 1e9; for (const p of alive) { const d = Math.hypot(p.x - z.x, p.z - z.z) + Math.abs(p.y - z.y) * 3; if (d < bd) { bd = d; t = p; } }
    z.atk = Math.max(0, z.atk - DT);
    if (!t) { stepMove(z, { yaw: z.yaw }, DT, 1, g.map, false); return; }
    const dx = t.x - z.x, dz = t.z - z.z, d2 = Math.hypot(dx, dz);
    if (d2 <= ZM.attackRange && Math.abs(t.y - z.y) < 2.2) {            // in melee range: stop and bite
      z.yaw = Math.atan2(-dx, -dz); stepMove(z, { yaw: z.yaw }, DT, 1, g.map, false);
      if (z.atk <= 0) { z.atk = ZM.attackCd; g.damage(t, null, ZM.attackDmg, { cause: 'zombie', from: [z.x, z.z] }); }
      return;
    }
    let mx = dx / (d2 || 1), mz = dz / (d2 || 1), climb = false;
    const field = this.fields.get(t.id);
    const los = d2 < 6 && Math.abs(t.y - z.y) < 1 && rayWorld([z.x, z.y + 1, z.z], [mx, 0, mz], g.map.boxes, d2) >= d2 - 0.05;
    if (!los && field) {
      if (--z.nodeT <= 0 || z.node < 0) { z.node = this.nav.nodeAt(z.x, z.y, z.z); z.nodeT = 6; }
      if (z.node >= 0 && field[z.node] < 65535) { const nx = this.nav.next(z.node, field, 2), p = this.nav.pos(nx), ex = p[0] - z.x, ez = p[2] - z.z, el = Math.hypot(ex, ez); if (el > 0.05) { mx = ex / el; mz = ez / el; } else z.node = -1; climb = p[1] - z.y > 0.3; }
    }
    for (const o of this.zombies) {                                      // keep zombies from stacking on one spot
      if (o === z) continue; const sx = z.x - o.x, sz = z.z - o.z, sd = Math.hypot(sx, sz);
      if (sd < 0.9 && sd > 0.001) { mx += sx / sd * 0.5; mz += sz / sd * 0.5; }
    }
    const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
    z.yaw = Math.atan2(-mx, -mz);
    const moved = Math.hypot(z.x - (z.px ?? z.x), z.z - (z.pz ?? z.z)); z.px = z.x; z.pz = z.z; z.stuck = moved < 0.01 ? (z.stuck || 0) + 1 : 0;
    stepMove(z, { forward: true, yaw: z.yaw, jump: z.onGround && (climb || z.stuck > 12) }, DT, ZM.speedMul, g.map, false, ZFX);   // hop up ledges / unstick
  }
  // called by server/combat.js when a bullet hits a zombie
  hitZombie(z, a, dmg, o) {
    if (!z.alive) return; z.hp -= dmg; const dead = z.hp <= 0, g = this.game;
    if (a && (!o.silent || dead)) g.emitTo(a, 'hit', { v: z.id, head: !!o.head, armor: false, broke: false, kill: dead, dmg: Math.round(dmg), hp: Math.max(0, Math.round(z.hp)), mh: z.maxhp, ar: 0, ma: 0, ad: 0, hd: Math.round(dmg) });
    if (!dead) return;
    z.alive = false; a.kills++; g.awardKill(a, !!o.head); this.zombies.splice(this.zombies.indexOf(z), 1); if (z.wave === this.wave) this.killedInWave++;
    g.emitAll('kill', { k: a.id, kn: a.name, kt: 'red', v: z.id, vn: 'Zombie', vt: 'blue', w: o.weapon || '', wn: o.weapon ? WEAPONS[o.weapon].name : '', h: !!o.head });
  }
  onKill() {                                                           // a player died
    if (this.ended || this.game.phase !== 'match') return;
    if (![...this.game.players.values()].some(p => p.alive)) { this.ended = true; this.game.endMatch(null, `All survivors were eliminated · reached wave ${this.wave}`); }
  }
  onPlayerLeave(p) { p.alive = false; }
  zombieSnap() { return this.zombies.map(z => ({ id: z.id, x: Math.round(z.x * 100) / 100, y: Math.round(z.y * 100) / 100, z: Math.round(z.z * 100) / 100, yaw: Math.round(z.yaw * 100) / 100, hp: Math.round(z.hp) })); }
  ranking() { return [...this.game.players.values()].sort((a, b) => b.score - a.score || b.kills - a.kills).map((p, i) => ({ id: p.id, name: p.name, place: i + 1, k: p.kills, s: p.score })); }
  state() {
    return { type: 'zm', wave: this.wave, left: this.zombies.length + this.toSpawn, total: this.waveTotal, killed: this.killedInWave, need: Math.ceil(this.waveTotal * ZM.nextWaveFrac), next: this.waveDelay > 0,
      alive: [...this.game.players.values()].filter(p => p.alive).length, players: this.game.players.size };
  }
  summary() { return { red: this.wave, blue: [...this.game.players.values()].reduce((a, p) => a + p.kills, 0), label: 'Wave / Kills' }; }
}
