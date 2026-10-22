// Renders the scorestreak entities the server sends in `snap.sk` (see server/streaks.js): UAV / Predator planes, Attack Chopper, Trophy System,
// Kinetic Charger, Artillery Beacon (+ shells), thrown devices, Predator missiles and the ODIN projectile. Pure visuals: all rules live on the server.
import * as THREE from 'three';

const TEAM_COL = [0xff4d4d, 0x4d9dff];
let _puff = null;
function puffTexture() {                                                  // soft radial sprite (fog / particles), tinted by the sprite colour
  if (_puff) return _puff; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _puff = new THREE.CanvasTexture(c); return _puff;
}
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.2, ...o });
const box = (g, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };

export class StreakView {
  constructor(scene) { this.scene = scene; this.g = new THREE.Group(); scene.add(this.g); this.m = new Map(); this.t = 0; this.fx = []; this.odinMesh = null; }
  clear() { this.scene.remove(this.g); }

  build(e) {
    const g = new THREE.Group(), tc = TEAM_COL[e.tm] || 0xffffff;
    if (e.k === 'uav' || e.k === 'predator') {                              // small plane; the Predator is darker with a blinking red glint
      const pred = e.k === 'predator', body = std(pred ? 0x25282d : 0xb9bec6), wing = std(pred ? 0x1b1d21 : 0x9aa1ab);
      box(g, 0.9, 0.7, 6, body, 0, 0, 0); box(g, 9, 0.12, 1.6, wing, 0, 0, 0.4); box(g, 3, 0.1, 1, wing, 0, 0.1, 2.7); box(g, 0.12, 1.1, 1, wing, 0, 0.6, 2.8);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 8), body); nose.rotation.x = -Math.PI / 2; nose.position.z = -3.6; g.add(nose);
      if (pred) { const glint = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); glint.position.set(0, -0.45, -1.4); g.add(glint); g.userData.glint = glint; }
      g.scale.setScalar(1.3);
    } else if (e.k === 'chopper') {
      const hull = std(0x30343a), glass = std(0x7fb0d6, { transparent: true, opacity: 0.45 });
      box(g, 2.6, 2.2, 6.2, hull, 0, 0, 0); box(g, 2.3, 1.5, 1.8, glass, 0, 0.1, -3.4); box(g, 0.7, 0.7, 5.4, hull, 0, 0.5, 5.6); box(g, 0.12, 1.4, 1, hull, 0, 1.2, 8.1);
      box(g, 0.3, 0.7, 0.3, hull, 0, 1.4, 0); const rotor = new THREE.Group(); rotor.position.y = 1.8; const bm = new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.7 });
      for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 0.36), bm); b.rotation.y = i * Math.PI / 2; rotor.add(b); } g.add(rotor); g.userData.rotor = rotor;
      box(g, 0.3, 0.3, 1.8, std(0x777777), 1.1, -0.9, -2.2); box(g, 0.3, 0.3, 1.8, std(0x777777), -1.1, -0.9, -2.2);      // minigun pods
    } else if (e.k === 'beacon') {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 40, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })); pillar.position.y = 20; g.add(pillar);
      box(g, 0.3, 0.2, 0.3, std(0x331111, { emissive: 0xff0000, emissiveIntensity: 1 }), 0, 0.1, 0);
      g.userData.puffs = []; for (let i = 0; i < 9; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xff2a1a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); sp.userData.ph = i / 9; g.add(sp); g.userData.puffs.push(sp); }
    } else if (e.k === 'shell') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.8, 8), std(0x2c2f2a)); g.add(b); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), std(0xff5522, { emissive: 0xff3300, emissiveIntensity: 1.2 })); tip.position.y = -1.2; tip.rotation.x = Math.PI; g.add(tip);
    } else if (e.k === 'trophy') {
      box(g, 0.7, 0.4, 0.7, std(0x333840), 0, 0.2, 0); const dish = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 20), std(0x7fe0ff, { emissive: 0x2aa0d0, emissiveIntensity: 0.8 })); dish.position.y = 0.9; dish.rotation.x = Math.PI / 2; g.add(dish);
      const spin = new THREE.Group(); spin.position.y = 0.75; box(spin, 0.08, 0.5, 0.08, std(0xbbbbbb), 0.3, 0.2, 0); box(spin, 0.08, 0.5, 0.08, std(0xbbbbbb), -0.3, 0.2, 0); g.add(spin); g.userData.spin = spin;
    } else if (e.k === 'charger') {
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 5), std(0x444444)); leg.position.set(Math.cos(a) * 0.35, 0.65, Math.sin(a) * 0.35); leg.rotation.z = Math.cos(a) * 0.3; leg.rotation.x = -Math.sin(a) * 0.3; g.add(leg); }
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.4, 10), std(0x2b2b2b, { emissive: 0xffc800, emissiveIntensity: 0.5 })); tube.position.y = 1.6; g.add(tube);
      g.userData.puffs = []; for (let i = 0; i < 12; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffd400, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); sp.userData.ph = i / 12; sp.userData.a = i * 2.4; g.add(sp); g.userData.puffs.push(sp); }
    } else if (e.k === 'sthrow') {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), std(e.w === 'artillery' ? 0xff2a2a : e.w === 'trophy' ? 0x7fe0ff : 0xffd400, { emissive: 0x222222 })));
    } else if (e.k === 'missile') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.4, 8), std(0xcfd2d6)); b.rotation.x = Math.PI / 2; g.add(b); const n = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 8), std(0xc03030)); n.rotation.x = -Math.PI / 2; n.position.z = -1.5; g.add(n);
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); fl.scale.set(1.6, 1.6, 1); fl.position.z = 1.5; g.add(fl);
    }
    const ring = e.k === 'trophy' || e.k === 'charger' ? new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 20), new THREE.MeshBasicMaterial({ color: tc, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })) : null;
    if (ring) { ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring); }
    g.userData.kind = e.k; this.g.add(g); return g;
  }

  // list = snap.sk, odin = snap.odin ({left, alt}) ; called for every snapshot
  sync(list, odin) {
    const seen = new Set();
    for (const e of list || []) {
      seen.add(e.id); let m = this.m.get(e.id); if (!m) { m = this.build(e); this.m.set(e.id, m); m.position.set(e.x, e.y, e.z); }
      m.userData.target = [e.x, e.y, e.z]; m.userData.e = e;
      if (e.k === 'missile') m.lookAt(m.position.x - e.dx, m.position.y - e.dy, m.position.z - e.dz);          // nose points along the flight direction (model nose = -z)
      else if (e.k === 'uav' || e.k === 'predator') m.rotation.y = e.hd + Math.PI; else if (e.k === 'chopper') m.rotation.y = e.hd;
    }
    for (const [id, m] of this.m) if (!seen.has(id)) { this.g.remove(m); this.m.delete(id); }
    if (odin) {                                                           // ODIN: a long white spear falling straight down, arriving exactly when the countdown hits 0
      if (!this.odinMesh) {
        const g = new THREE.Group(); const spear = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 90, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); g.add(spear);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); glow.scale.set(60, 60, 1); glow.position.y = -45; g.add(glow);
        const halo = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 400, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); halo.position.y = 150; g.add(halo);
        this.odinMesh = g; this.g.add(g);
      }
      const frac = Math.max(0, odin.left / 10); this.odinMesh.position.set(0, 45 + (odin.alt - 45) * frac, 0);
    } else if (this.odinMesh) { this.g.remove(this.odinMesh); this.odinMesh = null; }
  }
  // small blast where the Trophy System intercepted a projectile
  zap(d) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(d.x, d.y, d.z);
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(d.ox, d.oy, d.oz), new THREE.Vector3(d.x, d.y, d.z)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.g.add(m); this.g.add(l); this.fx.push({ m, l, t: 0, life: 0.35 });
  }
  update(dt) {
    this.t += dt;
    for (const [, m] of this.m) {
      const tg = m.userData.target; if (tg) { const k = Math.min(1, dt * 14); m.position.x += (tg[0] - m.position.x) * k; m.position.y += (tg[1] - m.position.y) * k; m.position.z += (tg[2] - m.position.z) * k; }
      const u = m.userData;
      if (u.rotor) u.rotor.rotation.y = this.t * 30; if (u.spin) u.spin.rotation.y = this.t * 6;
      if (u.glint) u.glint.visible = Math.sin(this.t * 9) > -0.3;
      if (u.puffs) {
        if (u.kind === 'beacon') for (const sp of u.puffs) { const f = (this.t * 0.25 + sp.userData.ph) % 1; sp.position.set(Math.sin(f * 7 + sp.userData.ph * 9) * 1.2, 0.4 + f * 5, Math.cos(f * 6 + sp.userData.ph * 7) * 1.2); const s = 2.5 + f * 4; sp.scale.set(s, s, 1); sp.material.opacity = 0.45 * Math.sin(f * Math.PI); }
        else for (const sp of u.puffs) { const f = (this.t * 0.8 + sp.userData.ph) % 1, a = sp.userData.a + this.t; sp.position.set(Math.cos(a) * (0.3 + f * 1.8), 0.6 + f * 2.6, Math.sin(a) * (0.3 + f * 1.8)); sp.scale.setScalar(0.25 * (1 - f * 0.5)); sp.material.opacity = 0.9 * (1 - f); }      // Kinetic Charger: yellow particles to the surroundings
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; const k = f.t / f.life; f.m.scale.setScalar(0.3 + k * 2.5); f.m.material.opacity = 0.9 * (1 - k); if (f.t >= f.life) { this.g.remove(f.m); this.g.remove(f.l); this.fx.splice(i, 1); } }
  }
}
