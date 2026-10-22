// Gameplay camera rig: yawPivot (Y rotation) -> pitchPivot (X rotation) -> leanPivot (sideways offset + roll, ONLY from leaning) -> camera (no rotation).
// Without leaning there is zero roll. Separate from the menu / loadout cameras.
import * as THREE from 'three';
import { PITCH_MAX, LEAN } from '/shared/constants.js';

export class CameraRig {
  constructor(fov = 75) {
    this.yawPivot = new THREE.Object3D(); this.pitchPivot = new THREE.Object3D(); this.leanPivot = new THREE.Object3D();
    this.camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.02, 500);
    this.yawPivot.add(this.pitchPivot); this.pitchPivot.add(this.leanPivot); this.leanPivot.add(this.camera);
    this.yaw = 0; this.pitch = 0; this.lean = 0; this.shake = new THREE.Vector3();
  }
  addTo(scene) { scene.add(this.yawPivot); }
  look(dx, dy, sens) {
    this.yaw -= dx * sens; this.pitch -= dy * sens;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch));
    this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  }
  setPosition(x, y, z) { this.yawPivot.position.set(x, y, z); }
  setLean(l) { this.lean = l; }                                   // -1 left .. +1 right
  apply() {
    this.yawPivot.rotation.set(0, this.yaw, 0);
    this.pitchPivot.rotation.set(Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch)), 0, 0);
    this.leanPivot.position.set(this.lean * LEAN.offset, 0, 0); this.leanPivot.rotation.set(0, 0, -this.lean * LEAN.deg * Math.PI / 180);   // lean = peek sideways + tilt
    this.camera.rotation.set(0, 0, 0); this.camera.position.copy(this.shake);   // shake = positional only (never rotation)
  }
  get roll() { return this.leanPivot.rotation.z; }
  setFov(f) { if (Math.abs(this.camera.fov - f) > 0.01) { this.camera.fov = f; this.camera.updateProjectionMatrix(); } }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
}
