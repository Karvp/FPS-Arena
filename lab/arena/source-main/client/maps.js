// Builds Three.js meshes from the shared map definition (same boxes the server collides with).
import * as THREE from 'three';
import { BOUND } from '/shared/constants.js';

export function buildMapScene(map, scene) {
  const g = new THREE.Group(), pal = map.palette, mats = {}, B = map.bound || BOUND;
  const mat = (k) => mats[k] ||= new THREE.MeshStandardMaterial({
    color: pal[k + 'Box'] ?? pal[k] ?? pal.wall, roughness: 0.85, metalness: 0.05,
    emissive: map.neon && (k === 'car' || k === 'kiosk' || k === 'cover') ? (pal[k] ?? 0) : 0x000000, emissiveIntensity: map.neon ? 0.35 : 0 });
  for (const b of map.boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), mat(b.k));
    m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m);
    if (map.neon && (b.k === 'building' || b.k === 'wall') && b.y1 - b.y0 > 3) {       // neon trim strips
      const t = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 0.06, 0.12, b.z1 - b.z0 + 0.06), new THREE.MeshBasicMaterial({ color: ((b.x0 + b.z0) | 0) % 2 ? pal.accent : pal.accent2 }));
      t.position.set((b.x0 + b.x1) / 2, Math.min(b.y1 - 0.4, 3), (b.z0 + b.z1) / 2); g.add(t);
    } else if (!map.neon && b.k !== 'roof' && b.y1 - b.y0 > 2.5) {                       // hazard stripe
      const t = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 0.04, 0.18, b.z1 - b.z0 + 0.04), new THREE.MeshBasicMaterial({ color: pal.accent }));
      t.position.set((b.x0 + b.x1) / 2, 0.5, (b.z0 + b.z1) / 2); g.add(t);
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(B * 2 + 600, B * 2 + 600), new THREE.MeshStandardMaterial({ color: pal.floor, roughness: map.water ? 0.25 : 0.95, metalness: map.water ? 0.25 : 0 }));
  floor.rotation.x = -Math.PI / 2; g.add(floor);
  if (!pal.noGrid) { const grid = new THREE.GridHelper(B * 2, B, pal.neon ? pal.accent : 0x000000, pal.neon ? pal.accent : 0x000000); grid.material.opacity = map.neon ? 0.25 : 0.12; grid.material.transparent = true; grid.position.y = 0.01; g.add(grid); }
  if (map.water) {                                                                  // faint foam lines on the sea
    const lm = new THREE.MeshBasicMaterial({ color: 0x7fc4e8, transparent: true, opacity: 0.18 });
    for (let i = 0; i < 70; i++) { const w = 6 + (i * 7) % 16, l = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.25), lm); l.rotation.x = -Math.PI / 2; l.position.set(((i * 53) % 260) - 130, 0.03, ((i * 97) % 260) - 130); g.add(l); }
  }
  for (const q of map.slow || []) {                                                  // mud / swamp patches
    const p = new THREE.Mesh(new THREE.PlaneGeometry(q.x1 - q.x0, q.z1 - q.z0), new THREE.MeshStandardMaterial({ color: pal.mud ?? 0x1e2a1a, roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.85 }));
    p.rotation.x = -Math.PI / 2; p.position.set((q.x0 + q.x1) / 2, 0.04, (q.z0 + q.z1) / 2); g.add(p);
  }
  for (const z of map.ziplines || []) {                                              // ziplines (F to ride)
    const a = new THREE.Vector3(...z.a), b = new THREE.Vector3(...z.b), len = a.distanceTo(b);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 6), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
    cable.geometry.rotateX(Math.PI / 2); cable.position.copy(a).lerp(b, 0.5); cable.lookAt(b); g.add(cable);
  }
  // boundary fence
  const fm = new THREE.MeshBasicMaterial({ color: pal.accent, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  for (const [x, z, w, d] of [[0, -B, B * 2, 0.2], [0, B, B * 2, 0.2], [-B, 0, 0.2, B * 2], [B, 0, 0.2, B * 2]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, map.water ? 80 : 6, d), fm); f.position.set(x, map.water ? 40 : 3, z); g.add(f); }
  scene.add(g);
  scene.background = new THREE.Color(pal.sky); scene.fog = new THREE.Fog(pal.fog, pal.fogNear ?? 60, pal.fogFar ?? 220);
  const hemi = new THREE.HemisphereLight(0xffffff, pal.floor, pal.hemiI ?? (map.neon ? 0.9 : 1.05)); const sun = new THREE.DirectionalLight(pal.sun || 0xffffff, pal.sunI ?? (map.neon ? 0.7 : 1.4)); sun.position.set(40, 80, 25);
  scene.add(hemi, sun, sun.target);
  const dispose = () => { scene.remove(g, hemi, sun, sun.target); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); };
  return { group: g, dispose };
}
