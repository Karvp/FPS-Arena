// Red laser beam + dot (Laser Sight attachment). One instance per laser user; the dot sits where the beam hits the map.
import * as THREE from 'three';
import { rayWorld } from '/shared/geometry.js';

let tex = null;
function dotTexture() {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,60,60,0.95)'); g.addColorStop(1, 'rgba(255,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); tex = new THREE.CanvasTexture(c); return tex;
}
const UP = new THREE.Vector3(0, 1, 0);
export class LaserFx {
  constructor(scene, own = false) {
    this.scene = scene; this.r = own ? 0.0022 : 0.0035;
    // the beam is a thin straight cylinder (unit length along Y, scaled / rotated per frame) so it stays visible and perfectly straight from any angle
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: own ? 0.5 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 996;
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xff3030, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true }));
    this.dot.renderOrder = 997; scene.add(this.beam); scene.add(this.dot); this.hide();
    this._d = new THREE.Vector3(); this._m = new THREE.Vector3();
  }
  // o: origin {x,y,z}, d: UNIT direction {x,y,z} (the barrel direction); the beam runs straight along d until the map stops it
  set(o, d, boxes, maxD = 70) {
    let t = rayWorld([o.x, o.y, o.z], [d.x, d.y, d.z], boxes, maxD); if (!Number.isFinite(t) || t > maxD) t = maxD;
    this._d.set(d.x, d.y, d.z).normalize(); this._m.set(o.x + this._d.x * t * 0.5, o.y + this._d.y * t * 0.5, o.z + this._d.z * t * 0.5);
    this.beam.position.copy(this._m); this.beam.quaternion.setFromUnitVectors(UP, this._d); this.beam.scale.set(this.r, t, this.r); this.beam.visible = true;
    const hit = t < maxD - 0.01; this.dot.visible = hit;
    if (hit) { this.dot.position.set(o.x + this._d.x * (t - 0.02), o.y + this._d.y * (t - 0.02), o.z + this._d.z * (t - 0.02)); const s = 0.05 + t * 0.006; this.dot.scale.set(s, s, 1); }
  }
  hide() { this.beam.visible = false; this.dot.visible = false; }
  dispose() { this.scene.remove(this.beam); this.scene.remove(this.dot); this.beam.geometry.dispose(); this.beam.material.dispose(); }
}
