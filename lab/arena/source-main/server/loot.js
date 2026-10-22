// Crates + dropped items (Battle Royale and Zombies). Server-authoritative; clients get the full list via the 'ents' event when it changes.
import { ITEM, findUseTarget } from '../shared/loot.js';
import { WEAPONS } from '../shared/weapons.js';
import { RARITIES, WEAPONS_BY_RARITY, rarityOf, ammoClassOf, rollRarity } from '../shared/rarity.js';
import { USE_RANGE, ENERGY, BR } from '../shared/constants.js';
import { THROW_LIST, THROW_MAX } from '../shared/skills.js';
import { eyeHeightOf } from '../shared/movement.js';

export class Loot {
  // opts.minRarity: lowest rarity index a crate may roll (Zombies: Purple and above). opts.kits: Battle Royale crates may hold Self-Revive Kits as part of their equipment.
  constructor(game, opts = {}) { this.g = game; this.crates = []; this.items = []; this.nid = 1; this.dirty = true; this.sentAt = 0; this.minRarity = opts.minRarity || 0; this.kits = !!opts.kits; }
  addCrate(c, rar) { const r = rar ?? rollRarity(Math.random, this.minRarity); this.crates.push({ id: this.nid++, x: c[0], y: c[1], z: c[2], yaw: c[3] || 0, open: false, rar: r }); this.dirty = true; }
  // rar = rarity index (colour on the ground); dropped guns default to their own tier. AMMO: wid = ammo class, reserve = rounds. ENERGY: reserve = points.
  addItem(kind, wid, x, y, z, mag = 0, reserve = 0, rar) { const it = { id: this.nid++, kind, wid: wid || '', x, y, z, mag, reserve, rar: rar ?? (kind === ITEM.GUN ? rarityOf(wid) : 0) }; this.items.push(it); this.dirty = true; return it; }
  // A crate's rarity decides its ONE weapon (from that tier) and how much ammo / plates / equipment / energy comes with it.
  openCrate(c) {
    c.open = true; const rar = c.rar ?? 0, R = RARITIES[rar], D = R.drops, pool = WEAPONS_BY_RARITY[rar], drops = [];
    const wid = pool[Math.floor(Math.random() * pool.length)], w = WEAPONS[wid];
    drops.push([ITEM.GUN, wid, w.magSize, Math.ceil(w.magSize * 1.5)]);
    if (D.ammoHeavy > 0) drops.push([ITEM.AMMO, 'heavy', 0, D.ammoHeavy]);
    if (D.ammoLight > 0) drops.push([ITEM.AMMO, 'light', 0, D.ammoLight]);
    for (let i = 0; i < D.plates; i++) drops.push([ITEM.PLATE]);
    if (D.equip > 0) { const tid = THROW_LIST[Math.floor(Math.random() * THROW_LIST.length)]; for (let i = 0; i < D.equip; i++) drops.push(this.kits && Math.random() < 0.5 ? [ITEM.KIT] : [ITEM.THROW, tid]); }   // 'equipment' = throwable or (BR only) Self-Revive Kit
    if (D.energy > 0) drops.push([ITEM.ENERGY, '', 0, D.energy]);
    drops.forEach((d, i) => { const a = i / drops.length * Math.PI * 2 + Math.random() * 0.6, r = 0.9 + Math.random() * 0.4; this.addItem(d[0], d[1], c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r, d[2] || 0, d[3] || 0, rar); });
    this.dirty = true;
  }
  // F pressed: open the crate / swap the gun the player is looking at
  use(p) {
    if (!p.alive || p.down) return false;
    const t = findUseTarget(this.crates, this.items, p.x, p.y + eyeHeightOf(p), p.z, p.yaw, p.pitch); if (!t) return false;
    if (t.type === 'crate') { const c = this.crates.find(x => x.id === t.id); if (c && !c.open) { this.openCrate(c); this.g.award(p, 10, 'Looted'); this.g.abil.endPolter(p); return true; } return false; }
    const it = this.items.find(x => x.id === t.id); if (!it) return false;
    const ws = p.ws; let slot = ws.slot;
    const empty = (i) => WEAPONS[ws.guns[i].id].unarmed;
    if (empty(slot)) { /* fill current slot */ } else if (empty(1 - slot)) slot = 1 - slot;
    const old = ws.guns[slot];
    if (!WEAPONS[old.id].unarmed) this.addItem(ITEM.GUN, old.id, p.x, p.y, p.z, old.mag, old.reserve || 0);
    ws.guns[slot] = { id: it.wid, mag: it.mag, reserve: it.reserve };
    ws.slot = slot; ws.reloading = false; ws.reloadT = 0; ws.switchT = 0.4; ws.cd = Math.max(ws.cd, 0.4); ws.rev++;
    this.items.splice(this.items.indexOf(it), 1); this.dirty = true; return true;
  }
  // ammo packs and plates are picked up by walking over them
  update() {
    for (const p of this.g.players.values()) {
      if (!p.alive || p.air || p.down) continue;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i]; if (it.kind === ITEM.GUN) continue;
        if (Math.hypot(it.x - p.x, it.z - p.z) > USE_RANGE.pickup || Math.abs(it.y - p.y) > 1.8) continue;
        if (it.kind === ITEM.PLATE) { if (p.plates >= p.maxPlates) continue; p.plates++; }
        else if (it.kind === ITEM.THROW) { if ((p.thr.n > 0 && p.thr.id !== it.wid) || p.thr.n >= THROW_MAX) continue; p.thr.id = it.wid; p.thr.n++; }
        else if (it.kind === ITEM.KIT) { if ((p.kits | 0) >= BR.kitMax) continue; p.kits = (p.kits | 0) + 1; }
        else if (it.kind === ITEM.ENERGY) { if (p.energy >= ENERGY.max) continue; p.energy = Math.min(ENERGY.max, p.energy + it.reserve); }
        else { let any = false; for (const g of p.ws.guns) { const w = WEAPONS[g.id]; if (w.unarmed || w.infinite || ammoClassOf(g.id) !== it.wid) continue; g.reserve = (g.reserve || 0) + it.reserve; any = true; } if (!any) continue; p.ws.rev++; }
        this.items.splice(i, 1); this.dirty = true;
      }
    }
  }
  state() { return { c: this.crates.map(c => [c.id, c.x, c.y, c.z, +c.yaw.toFixed(2), c.open ? 1 : 0, c.rar]), i: this.items.map(i => [i.id, i.kind, i.wid, +i.x.toFixed(2), +i.y.toFixed(2), +i.z.toFixed(2), i.rar, i.reserve]) }; }
  flush(now) { if (this.dirty && now - this.sentAt >= 0.1) { this.dirty = false; this.sentAt = now; this.g.emitAll('ents', this.state()); } }
}
