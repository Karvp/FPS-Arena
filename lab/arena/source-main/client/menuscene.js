// Live menu background: the selected map, a slowly drifting camera and a few bots. Uses its OWN scene + camera.
import * as THREE from 'three';
import { buildMapScene } from './maps.js';
import { humanoidMesh } from './remote.js';
import { rayWorld } from '/shared/geometry.js';
import { settings } from './settings.js';

export class MenuScene {
  constructor() {
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);
    this.t = Math.random() * 100; this.mapId = null; this.bots = []; this.tracers = []; this.map = null; this.built = null; this.nextShot = 1;
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  setMap(map) {
    if (this.mapId === map.id) return;
    this.mapId = map.id; this.map = map;
    if (this.built) this.built.dispose();
    for (const b of this.bots) this.scene.remove(b.mesh); this.bots = [];
    for (const tr of this.tracers) this.scene.remove(tr.line); this.tracers = [];
    this.built = buildMapScene(map, this.scene);
    this.points = [...map.spawns.red, ...map.spawns.blue, ...map.hardpoints, ...map.sites].map(p => ({ x: p.x, z: p.z }));
    for (let i = 0; i < 6; i++) {
      const p = this.points[Math.floor(Math.random() * this.points.length)], mesh = humanoidMesh(i % 2); mesh.position.set(p.x, 0, p.z); this.scene.add(mesh);
      this.bots.push({ mesh, x: p.x, z: p.z, tx: p.x, tz: p.z, speed: 3 + Math.random() * 2 });
    }
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
    for (let i = 0; i < 4; i++) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]); const line = new THREE.Line(g, mat.clone()); line.frustumCulled = false; this.scene.add(line); this.tracers.push({ line, life: 0 }); }
  }
  pickTarget(b) {
    for (let k = 0; k < 12; k++) {
      const p = this.points[Math.floor(Math.random() * this.points.length)], d = Math.hypot(p.x - b.x, p.z - b.z); if (d < 6) continue;
      const dir = [(p.x - b.x) / d, 0, (p.z - b.z) / d];
      if (rayWorld([b.x, 1, b.z], dir, this.map.boxes, d) >= d - 0.01) { b.tx = p.x; b.tz = p.z; return; }    // only walk along clear lines
    }
    b.tx = b.x; b.tz = b.z;
  }
  update(dt) {
    if (!this.map) return; this.t += dt;
    const drift = settings.reduced ? 0 : 1, a = this.t * 0.035 * drift + 0.6;
    const B = this.map.bound || 68; this.camera.position.set(Math.cos(a) * B * 0.68, B * 0.22 + Math.sin(this.t * 0.11 * drift) * 1.5, Math.sin(a) * B * 0.68); this.camera.lookAt(0, B * (this.map.water ? 0.1 : 0.04), 0);
    for (const b of this.bots) {
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d < 0.4) this.pickTarget(b); else { b.x += dx / d * b.speed * dt; b.z += dz / d * b.speed * dt; b.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI; }
      b.mesh.position.set(b.x, 0, b.z);
    }
    this.nextShot -= dt;
    if (this.nextShot <= 0 && this.bots.length) {
      this.nextShot = 0.3 + Math.random() * 0.9; const tr = this.tracers.find(t => t.life <= 0), b = this.bots[Math.floor(Math.random() * this.bots.length)];
      if (tr) { const p = tr.line.geometry.attributes.position, ang = Math.random() * 6.28; p.setXYZ(0, b.x, 1.2, b.z); p.setXYZ(1, b.x + Math.cos(ang) * 22, 1.2 + Math.random(), b.z + Math.sin(ang) * 22); p.needsUpdate = true; tr.life = 0.1; }
    }
    for (const tr of this.tracers) { tr.life -= dt; tr.line.material.opacity = Math.max(0, tr.life * 9); }
  }
}
