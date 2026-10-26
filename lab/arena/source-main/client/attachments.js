// Attachment models: loads the GLBs on demand, normalises them (orientation / size / mount point) and builds the group that is parented to a weapon.
// Frames: everything is in METRES in the weapon's own oriented frame (muzzle = -Z, up = +Y, origin = the weapon's centre) = the local space of `ViewModel.wrapper`
// (and of the loadout preview's attachment group). Anchors come from weaponmodel.js `analyze`; per-weapon corrections from attachcal.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ATT, SLOTS, parseAtt, attList } from '/shared/attachments.js';
import { WEAPONS } from '/shared/weapons.js';
import { getAttCal, baseCal } from './attachcal.js';

const D2R = Math.PI / 180;
// yaw: rotation (deg, about Y) that makes the model's length axis run along Z.  fit: [axis, metres] the size the model is scaled to (after the yaw).
// mount: which point of the model touches the weapon ('bottom'/'top' centre, or the 'rear' end).  aim: the optical centre in MODEL coordinates (y, z).
// If an attachment faces the wrong way in game, flip its yaw by 180 here (or use the yaw edit in DEV MODE).
const NORM = {
  coyote:     { yaw: 0,   fit: ['z', 0.09],  mount: 'bottom', aim: { y: 0.0331, z: 0.0239 } },
  dd_grip:    { yaw: 90,  fit: ['y', 0.12],  mount: 'top' },
  vgrip:      { yaw: 0,   fit: ['y', 0.095], mount: 'top' },
  agrip:      { yaw: 0,   fit: ['z', 0.12],  mount: 'top' },
  laser:      { yaw: -90, fit: ['z', 0.09],  mount: 'top' },
  suppressor: { yaw: 0,   fit: ['z', 0.2],   mount: 'rear' },
};
const loader = new GLTFLoader();
// Portfolio build excludes unverified third-party GLB assets.
const EXTERNAL_ATTACHMENT_ASSETS = false;
function proceduralAttachment(id) {
  // Plain primitives replace archived third-party model files.
  const geom = id === 'suppressor' ? new THREE.CylinderGeometry(0.018, 0.018, 0.17, 12)
    : new THREE.BoxGeometry(0.045, 0.035, 0.09);
  const material = new THREE.MeshStandardMaterial({ color: 0x394958, metalness: 0.35, roughness: 0.65 });
  const mesh = new THREE.Mesh(geom, material);
  if (id === 'suppressor') mesh.rotation.x = Math.PI / 2;
  const group = new THREE.Group(); group.add(mesh);
  return group;
}
const store = new Map(), inflight = new Map(), listeners = new Set();
export const onAttLoaded = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const attLoaded = (id) => store.has(id);
export const getAttModel = (id) => { const m = store.get(id); return m ? m.root.clone(true) : null; };       // normalised clone (origin = mount point) for loadout icons

function normalize(id, scene) {
  const n = NORM[id], inner = new THREE.Group(); inner.add(scene); inner.rotation.y = n.yaw * D2R; inner.updateMatrixWorld(true);
  scene.traverse((o) => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  const box = new THREE.Box3().setFromObject(inner, true), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = n.fit[1] / size[n.fit[0]];
  const m = n.mount === 'bottom' ? new THREE.Vector3(c.x, box.min.y, c.z) : n.mount === 'top' ? new THREE.Vector3(c.x, box.max.y, c.z) : new THREE.Vector3(c.x, c.y, box.max.z);
  inner.scale.setScalar(s); inner.position.copy(m).multiplyScalar(-s);
  const holder = new THREE.Group(); holder.add(inner);
  let aim = null;
  if (n.aim) { const a = new THREE.Vector3(0, n.aim.y, n.aim.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), n.yaw * D2R); aim = new THREE.Vector3(0, (a.y - m.y) * s, (a.z - m.z) * s); }
  const front = new THREE.Vector3(0, (c.y - m.y) * s, (box.min.z - m.z) * s);                       // centre of the front face (laser emitter)
  return { root: holder, aim, front, len: size.z * s, height: size.y * s, width: size.x * s };
}
export function loadAttachment(id) {
  if (!ATT[id]) return Promise.resolve(null);
  if (!EXTERNAL_ATTACHMENT_ASSETS) {
    if (!inflight.has(id)) {
      store.set(id, normalize(id, proceduralAttachment(id)));
      inflight.set(id, Promise.resolve());
      listeners.forEach(fn => fn(id));
    }
    return inflight.get(id);
  }
  if (!inflight.has(id)) inflight.set(id, loader.loadAsync('/' + ATT[id].file).then((g) => {
    store.set(id, normalize(id, g.scene)); console.log(`[ATTACH] LOADED: ${id}`); listeners.forEach(f => f(id));
  }).catch((e) => { console.error(`[ATTACH] FAILED: ${id} / ${e && e.message ? e.message : e}`); }));
  return inflight.get(id);
}
export const ensureAtt = (attStr) => Promise.all(attList(attStr).map(a => loadAttachment(a.id)));

// returns { group, optic: {aim, eyeRelief, id}|null, laser: {emit}|null, supLen }.  Attachments whose model is not loaded yet are skipped (the caller rebuilds on onAttLoaded).
export function buildAttachments(prep, attStr, weaponId, flip = false) {
  const out = { group: new THREE.Group(), optic: null, laser: null, supLen: 0 };
  if (!attStr || !prep) return out;
  out.group.name = 'attachments';
  const sel = parseAtt(attStr), s = prep.scale, A = flip ? prep.anchorsFlip : prep.anchors, pistol = WEAPONS[weaponId] && WEAPONS[weaponId].cat === 'Pistol';
  for (const slot of SLOTS) {
    const id = sel[slot], m = id && store.get(id); if (!m) continue;
    const cal = getAttCal(weaponId, id), base = baseCal(id), node = m.root.clone(true), pivot = new THREE.Group(); pivot.add(node);
    const auto = slot === 'optic' ? [0, A.opticY * s, A.opticZ * s]
      : slot === 'grip' ? [0, A.underY * s, A.gripZ * s]
      : slot === 'laser' ? [0, A.underY * s, A.laserZ * s]
      : [A.muzzleX * s, A.muzzleY * s, A.muzzleZ * s + 0.015];                                          // suppressor: rear end just inside the muzzle
    const k = (slot === 'muzzle' && pistol ? 0.8 : 1) * cal.scale * base.scale, yaw = (cal.yaw + base.yaw) * D2R;
    const px = auto[0] + cal.pos[0] + base.pos[0], py = auto[1] + cal.pos[1] + base.pos[1], pz = auto[2] + cal.pos[2] + base.pos[2];
    pivot.position.set(flip ? -px : px, py, flip ? -pz : pz);                                          // flip: the weapon is turned 180 deg by its calibration -> mirror into the pre-rotation frame
    pivot.rotation.y = flip ? yaw + Math.PI : yaw; pivot.scale.setScalar(k); out.group.add(pivot);
    const yawF = pivot.rotation.y;
    if (slot === 'optic' && m.aim) out.optic = { id, aim: pivot.position.clone().add(m.aim.clone().multiplyScalar(k).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawF)), eyeRelief: ATT[id].eyeRelief };
    if (slot === 'laser') { const emit = new THREE.Object3D(); emit.rotation.y = flip ? Math.PI : 0;                // emit's -Z = the barrel direction (a gun turned 180 deg by its calibration points along +Z in this frame)
      emit.position.copy(pivot.position).add(m.front.clone().multiplyScalar(k).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawF)); out.group.add(emit); out.laser = { emit }; }
    if (slot === 'muzzle') out.supLen = m.len * k;
  }
  return out;
}
