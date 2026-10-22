// Crates (lid-opening animation) and dropped items: guns use the real weapon models and spin on the ground,
// ammo = brown/yellow box, armor plate = dark thin pack.
import * as THREE from 'three';
import { WEAPONS } from '/shared/weapons.js';
import { ITEM, findUseTarget } from '/shared/loot.js';
import { RARITIES } from '/shared/rarity.js';
import { prepared, onLoaded } from './assets.js';
import { instantiate, buildProcedural } from './weaponmodel.js';

let _mist = null;
function mistTexture() {                                                                              // soft radial puff, tinted per rarity by the sprite colour
  if (_mist) return _mist; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.45, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _mist = new THREE.CanvasTexture(c); return _mist;
}
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2, ...o });
export class LootView {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.crates = new Map(); this.items = new Map(); this.t = 0;
    this.data = { crates: [], items: [] };
    this.off = onLoaded((wid) => this.refresh(wid));
    this.mats = { body: M(0x4b5a3a), trim: M(0xe0b030, { emissive: 0x4a3a00 }), lid: M(0x55663f), brown: M(0x8a5a2b), band: M(0xe0b030, { emissive: 0x3a2c00 }), plate: M(0x1c1e22, { metalness: 0.5 }), acc: M(0x3a7bd5, { emissive: 0x102a55 }), cell: M(0x25d6ff, { emissive: 0x0a5a70 }), kit: M(0xe8f5ea, { emissive: 0x1a5a2a }) };
    this.rar = RARITIES.map(r => ({                                                                    // one set of materials per rarity: ground circle, signal beam, mist, trim
      ring: new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      beam: new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
      trim: M(r.color, { emissive: r.color, emissiveIntensity: 0.45 }),
      mist: new THREE.SpriteMaterial({ map: mistTexture(), color: r.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }) }));
  }
  rarMats(i) { return this.rar[Math.max(0, Math.min(this.rar.length - 1, i | 0))]; }
  clear() { this.scene.remove(this.group); if (this.off) this.off(); }
  refresh(wid) { for (const it of this.data.items) if (it.wid === wid && this.items.has(it.id)) { this.group.remove(this.items.get(it.id)); const m = this.itemMesh(it); this.group.add(m); this.items.set(it.id, m); } }
  crateMesh(c) {
    const g = new THREE.Group(), m = this.mats, rm = this.rarMats(c.rar); g.position.set(c.x, c.y, c.z); g.rotation.y = c.yaw;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.7), m.body); base.position.y = 0.25; g.add(base);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.08, 0.74), rm.trim); trim.position.y = 0.46; g.add(trim);
    const pivot = new THREE.Group(); pivot.position.set(0, 0.5, 0.35); g.add(pivot);                       // lid hinge at the back edge
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 0.74), m.lid); lid.position.set(0, 0.06, -0.37); pivot.add(lid);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.125, 0.76), rm.trim); strip.position.set(0, 0.06, -0.37); pivot.add(strip);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 6), rm.beam); beam.position.y = 2.2; g.add(beam);
    const puffs = []; for (let i = 0; i < 5; i++) { const sp = new THREE.Sprite(rm.mist.clone()); sp.userData = { ph: i / 5 }; g.add(sp); puffs.push(sp); }          // mist rises from the crate in the rarity colour
    g.userData = { pivot, beam, puffs, rar: c.rar | 0, open: false, openT: 0 };
    return g;
  }
  itemMesh(it) {
    const g = new THREE.Group(), m = this.mats, spin = new THREE.Group(); g.add(spin);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24), this.rarMats(it.rar).ring); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    if (it.kind === ITEM.GUN) {
      const w = WEAPONS[it.wid], prep = prepared.get(it.wid) || buildProcedural(it.wid);
      const orient = new THREE.Group(), centered = new THREE.Group(); orient.quaternion.copy(prep.R); orient.scale.setScalar(w.len * 0.85 / prep.ext.z);
      centered.position.copy(prep.center).negate(); centered.add(instantiate(prep)); orient.add(centered); spin.add(orient); spin.position.y = 0.75;
    } else if (it.kind === ITEM.AMMO) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), m.brown); const band = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.26), m.band); band.position.y = 0.04; spin.add(b, band); spin.position.y = 0.3;
    } else if (it.kind === ITEM.ENERGY) {
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10), m.cell); cell.rotation.z = Math.PI / 2; spin.add(cell); spin.position.y = 0.3;
    } else if (it.kind === ITEM.KIT) {                                                                // Self-Revive Kit: white case with a green cross
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.28), m.kit), v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.3), m.cell), h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.1), m.cell); spin.add(c, v, h); spin.position.y = 0.3;
    } else {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.28), m.plate), a = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.12), m.acc); spin.add(p, a); spin.position.y = 0.3;
    }
    g.position.set(it.x, it.y, it.z); g.userData = { spin, baseY: spin.position.y, born: this.t };
    return g;
  }
  // ents: {c: [[id,x,y,z,yaw,open]], i: [[id,kind,wid,x,y,z]]}
  set(ents) {
    const cs = ents.c.map(a => ({ id: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], open: !!a[5], rar: a[6] | 0 }));
    const its = ents.i.map(a => ({ id: a[0], kind: a[1], wid: a[2], x: a[3], y: a[4], z: a[5], rar: a[6] | 0, amt: a[7] | 0 }));
    this.data = { crates: cs, items: its };
    const seenC = new Set(cs.map(c => c.id));
    for (const [id, m] of this.crates) if (!seenC.has(id)) { this.group.remove(m); this.crates.delete(id); }
    for (const c of cs) { let m = this.crates.get(c.id); if (!m) { m = this.crateMesh(c); this.group.add(m); this.crates.set(c.id, m); } if (c.open && !m.userData.open) { m.userData.open = true; m.userData.openT = 0; m.userData.beam.visible = false; for (const sp of m.userData.puffs) sp.visible = false; } }
    const seenI = new Set(its.map(i => i.id));
    for (const [id, m] of this.items) if (!seenI.has(id)) { this.group.remove(m); this.items.delete(id); }
    for (const it of its) if (!this.items.has(it.id)) { const m = this.itemMesh(it); this.group.add(m); this.items.set(it.id, m); }
  }
  update(dt) {
    this.t += dt;
    for (const m of this.crates.values()) { const u = m.userData; if (u.open && u.openT < 1) { u.openT = Math.min(1, u.openT + dt / 0.6); const e = 1 - Math.pow(1 - u.openT, 3); u.pivot.rotation.x = -e * 1.95; } if (!u.open) this.mist(u); }
    for (const m of this.items.values()) {
      const u = m.userData, age = Math.min(1, (this.t - u.born) / 0.4), e = 1 - Math.pow(1 - age, 2);
      u.spin.rotation.y += dt * 1.8; u.spin.position.y = u.baseY + (1 - e) * 0.7 + Math.sin(this.t * 2 + m.id) * 0.04;
    }
  }
  // puffs drift up and fade; higher rarity = denser, brighter mist (grey is barely visible)
  mist(u) {
    const k = 0.35 + u.rar * 0.13;
    for (const sp of u.puffs) { const f = (this.t * 0.35 + sp.userData.ph) % 1; sp.position.set(Math.sin(f * 6 + sp.userData.ph * 9) * 0.28, 0.5 + f * 1.9, Math.cos(f * 5 + sp.userData.ph * 7) * 0.2); const sc = (0.5 + f * 1.1) * (0.8 + k * 0.5); sp.scale.set(sc, sc, 1); sp.material.opacity = (0.12 + u.rar * 0.1) * Math.sin(f * Math.PI); sp.visible = true; }
  }
  target(ex, ey, ez, yaw, pitch) { return findUseTarget(this.data.crates, this.data.items, ex, ey, ez, yaw, pitch); }
  item(id) { return this.data.items.find(i => i.id === id); }
}
