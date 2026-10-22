// World effects for throwables, zones, explosions, scout pulses, hook lines and the exoskeleton's golden trail. Everything is driven by server data.
import * as THREE from 'three';
import { THROW_LIST, THROWABLES, SKILLS } from '/shared/skills.js';

const COL = { trophy: 0xdff6ff, artillery: 0xff7a20, streak: 0xff9a30, frag: 0x4a5a2a, impact: 0xd07a20, cryo: 0x5fd8ff, gas: 0x6cff4a, smoke: 0x9a9ea4, foam: 0xb8bcc2, discharger: 0xff2020, tripmine: 0xff3030, flash: 0xffffff, unveiler: 0x5fa8ff, grav: 0xb070ff };
export class EffectsView {
  constructor(scene) {
    this.scene = scene; this.g = new THREE.Group(); scene.add(this.g); this.t = 0;
    this.pj = new Map(); this.zn = new Map(); this.wv = new Map(); this.fl = []; this.trails = []; this.hookLines = [];
    this.sphere = new THREE.SphereGeometry(1, 14, 10);
  }
  clear() { this.scene.remove(this.g); }
  mat(c, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o }); }
  // pj: [id, kindIdx, x, y, z, stuck, nx, ny, nz, fuseLeft, rayLen, age]   zn: [{id,k,x,y,z,r,t,b}]   wv: [[id,x,y,z,dx,dz,dist]]
  makeProj(kind) {
    if (kind === 'discharger') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.9), this.mat(0x222222, { emissive: 0xff0000, emissiveIntensity: 0.8 })); m.userData.kind = kind; return m; }
    if (kind === 'tripmine') {                                       // thin vertical body + a ray leaving its head (both oriented by the surface normal)
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), this.mat(0x30343a, { emissive: 0xff2020, emissiveIntensity: 0.6 }));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, depthWrite: false })); beam.visible = false;
      g.add(body); g.userData = { kind, body, beam }; return g;
    }
    const m = new THREE.Mesh(this.sphere, this.mat(COL[kind], { emissive: kind === 'frag' ? 0x000000 : COL[kind], emissiveIntensity: 0.3 }));
    m.scale.setScalar(kind === 'frag' ? 0.11 : 0.13); m.userData.kind = kind; return m;
  }
  sync(pj, zn, wv) {
    const seen = new Set();
    for (const p of pj || []) {
      seen.add(p[0]); const kind = THROW_LIST[p[1]]; let m = this.pj.get(p[0]);
      if (!m) { m = this.makeProj(kind); this.g.add(m); this.pj.set(p[0], m); }
      m.position.set(p[2], p[3], p[4]);
      if (kind === 'discharger') {
        if (p[5]) { const n = new THREE.Vector3(p[6], p[7], p[8]); m.position.addScaledVector(n.multiplyScalar(-1), 0.14); m.lookAt(m.position.clone().add(new THREE.Vector3(p[6], p[7], p[8]).multiplyScalar(-1))); }
        m.userData.flash = true; m.userData.fuse = p[9];
      } else if (kind === 'tripmine') {
        const u = m.userData, T = THROWABLES.tripmine;
        if (p[5]) {
          const out = new THREE.Vector3(-p[6], -p[7], -p[8]), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out), hidden = p[11] >= T.hideAfter;
          m.position.set(p[2] + out.x * 0.25, p[3] + out.y * 0.25, p[4] + out.z * 0.25); m.quaternion.copy(q);
          u.body.visible = !hidden;                                          // after 4 s the mine is invisible and the ray almost gone
          if (!u.beam.parent) m.add(u.beam);
          u.beam.visible = true; u.beam.scale.y = Math.max(0.01, p[10]); u.beam.position.y = 0.25 + p[10] / 2; u.beam.material.opacity = hidden ? T.rayOpacityHidden : T.rayOpacity;
        }
      } else if (kind === 'unveiler') {                                       // flying: visible ball; stuck (friendly viewers only): faint marker
        m.material.transparent = !!p[5]; m.material.opacity = p[5] ? 0.25 : 1; m.scale.setScalar(p[5] ? 0.3 : 0.13);
      }
    }
    for (const [id, m] of this.pj) if (!seen.has(id)) { this.g.remove(m); this.pj.delete(id); }
    const seenZ = new Set();
    for (const z of zn || []) {
      seenZ.add(z.id); const kind = THROW_LIST[z.k]; let m = this.zn.get(z.id);
      if (!m) {
        m = new THREE.Group();
        if (kind === 'cryo') { const d = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, 0.12, 32), new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0.35 })); d.position.y = 0.06; m.add(d); const ice = new THREE.Mesh(new THREE.CylinderGeometry(z.r * 0.9, z.r, 0.5, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide })); ice.position.y = 0.25; m.add(ice); }
        else if (kind === 'gas') for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: 0x4cff3a, transparent: true, opacity: 0.16, depthWrite: false })); const a = i / 7 * Math.PI * 2; s.position.set(Math.cos(a) * z.r * 0.45, 1 + (i % 3) * 0.5, Math.sin(a) * z.r * 0.45); s.scale.setScalar(z.r * 0.5); s.userData.ph = i; m.add(s); }
        else if (kind === 'smoke') {                                      // opaque, squashed blobs: a solid grey cloud (camera inside sees grey on every side)
          const mat = new THREE.MeshBasicMaterial({ color: 0x8d9096, side: THREE.DoubleSide });
          const blob = (x, zz, rad) => { const b = new THREE.Mesh(this.sphere, mat); b.scale.set(rad, rad * 0.4, rad); b.position.set(x, rad * 0.4 * 0.55, zz); m.add(b); };
          blob(0, 0, z.r * 0.6); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; blob(Math.cos(a) * z.r * 0.55, Math.sin(a) * z.r * 0.55, z.r * 0.45); }
        }
        else if (kind === 'foam' && z.b) { const [x0, y0, z0, x1, y1, z1] = z.b; const w = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshBasicMaterial({ color: 0xc9ccd1, transparent: true, opacity: THROWABLES.foam.opacity, depthWrite: false })); w.position.set((x0 + x1) / 2 - z.x, (y0 + y1) / 2 - z.y, (z0 + z1) / 2 - z.z); m.add(w); m.userData.foam = w; }
        m.position.set(z.x, z.y, z.z); this.g.add(m); this.zn.set(z.id, m);
      }
      m.userData.t = z.t;
    }
    for (const [id, m] of this.zn) if (!seenZ.has(id)) { this.g.remove(m); this.zn.delete(id); }
    const S = SKILLS.tum, seenW = new Set();                                   // Therapeutic Undulating Module: big green sheet flying through everything, fading over the last 10 m
    for (const w of wv || []) {
      seenW.add(w[0]); let m = this.wv.get(w[0]);
      if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(S.width, S.height, S.thick), new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })); this.g.add(m); this.wv.set(w[0], m); }
      m.position.set(w[1], w[2] + S.height / 2 - 0.5, w[3]); m.rotation.y = Math.atan2(w[4], w[5]); m.material.opacity = 0.4 * Math.max(0, Math.min(1, (S.range - w[6]) / 10));
    }
    for (const [id, m] of this.wv) if (!seenW.has(id)) { this.g.remove(m); this.wv.delete(id); }
  }
  // EM2 laser: a fat red beam from the muzzle that fades quickly
  beam(o, e) {
    const a = new THREE.Vector3(o[0], o[1] - 0.15, o[2]), b = new THREE.Vector3(e[0], e[1], e[2]), len = a.distanceTo(b); if (len < 0.1) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.y = len; m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.g.add(m); this.fl.push({ m, t: 0, life: 0.4, r: 0, kind: 'beam' });
  }
  boom(d) {
    const m = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: COL[d.k] || 0xffa030, transparent: true, opacity: 0.8, depthWrite: false })); m.position.set(d.x, d.y, d.z);
    this.g.add(m); this.fl.push({ m, t: 0, life: 0.45, r: d.r, kind: 'boom' });
  }
  pulse(d) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, wireframe: false })); m.position.set(d.x, d.y, d.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; m.add(ring);
    this.g.add(m); this.fl.push({ m, t: 0, life: d.max / d.speed, r: d.max, kind: 'pulse' });
  }
  trail(x, y, z) {
    const m = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.8, depthWrite: false })); m.position.set(x, y, z); m.scale.setScalar(0.16);
    this.g.add(m); this.trails.push({ m, t: 0 });
  }
  // hooks: [[x0,y0,z0,x1,y1,z1], ...]  (personal ziplines)
  hooks(list) {
    while (this.hookLines.length < list.length) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe14a })); l.frustumCulled = false; this.g.add(l); this.hookLines.push(l); }
    this.hookLines.forEach((l, i) => { l.visible = i < list.length; if (i < list.length) { const p = l.geometry.attributes.position, h = list[i]; p.setXYZ(0, h[0], h[1], h[2]); p.setXYZ(1, h[3], h[4], h[5]); p.needsUpdate = true; } });
  }
  update(dt) {
    this.t += dt;
    for (const m of this.pj.values()) if (m.userData.flash) { const f = Math.sin(this.t * (m.userData.fuse < 5 ? 22 : 9)) > 0; m.material.emissiveIntensity = f ? 1.6 : 0.1; }
    for (const m of this.zn.values()) {
      const u = m.userData; if (u.foam) u.foam.material.opacity = Math.min(THROWABLES.foam.opacity, u.t * THROWABLES.foam.opacity);
      m.children.forEach((c, i) => { if (c.userData.ph !== undefined) { c.position.y = 1 + Math.sin(this.t * 1.5 + c.userData.ph) * 0.25; c.material.opacity = 0.13 + 0.05 * Math.sin(this.t * 2 + c.userData.ph); } });
    }
    for (let i = this.fl.length - 1; i >= 0; i--) {
      const f = this.fl[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { this.g.remove(f.m); this.fl.splice(i, 1); continue; }
      if (f.kind === 'beam') { f.m.material.opacity = 0.8 * (1 - k); f.m.scale.x = f.m.scale.z = 1 - k * 0.7; continue; }
      if (f.kind === 'boom') { f.m.scale.setScalar(0.5 + k * f.r * 0.5); f.m.material.opacity = 0.8 * (1 - k); } else { f.m.scale.setScalar(Math.max(0.1, k * f.r)); f.m.material.opacity = 0.25 * (1 - k); f.m.children[0].material.opacity = 0.9 * (1 - k); }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) { const t = this.trails[i]; t.t += dt; if (t.t > 0.7) { this.g.remove(t.m); this.trails.splice(i, 1); } else { t.m.material.opacity = 0.8 * (1 - t.t / 0.7); t.m.scale.setScalar(0.16 * (1 - t.t / 1.4)); } }
  }
}
