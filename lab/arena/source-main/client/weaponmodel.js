// Turns an arbitrary GLB (Sketchfab exports: armatures, skins, lights, cameras, random axes/scales) into a normalised weapon:
//  * precise geometry bounds sampled from (skinned) vertices, ignoring Light/Camera nodes
//  * long axis -> barrel direction, muzzle end found from end cross-sections, up sign from vertex skew
//  * orientation quaternion R maps: muzzle -> -Z, up -> +Y, right -> +X ; scale fits WEAPONS[id].len
//  * sight point from rear-sight/aim nodes if plausible, otherwise a bounding-box estimate
// All heuristics can be overridden per weapon via calibration.orient (flip / flipUp) and DEV MODE.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { WEAPONS } from '/shared/weapons.js';
import { getCal } from './calibration.js';

function samplePoints(root, maxPer = 1500) {
  root.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const n = o.geometry.attributes.position.count, step = Math.max(1, Math.ceil(n / maxPer));
    for (let i = 0; i < n; i += step) {
      if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, v); else v.fromBufferAttribute(o.geometry.attributes.position, i);
      v.applyMatrix4(o.matrixWorld);
      if (Number.isFinite(v.x + v.y + v.z)) pts.push(v.x, v.y, v.z);
    }
  });
  return pts;
}
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

export function analyze(id, root) {
  const w = WEAPONS[id], cal = getCal(id);
  const pts = samplePoints(root); const n = pts.length / 3;
  if (n < 20) throw new Error('no usable geometry');
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const c = pts[i * 3 + a]; if (c < mn[a]) mn[a] = c; if (c > mx[a]) mx[a] = c; }
  const ext = mx.map((m, a) => m - mn[a]);
  const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
  const L = order[0], U = order[1], S = order[2];
  // --- muzzle end: the thinner end (barrel) vs the bulkier end (stock)
  const cross = (sign) => {
    const lo = sign > 0 ? mx[L] - ext[L] * 0.2 : mn[L], hi = sign > 0 ? mx[L] : mn[L] + ext[L] * 0.2;
    let u0 = Infinity, u1 = -Infinity, s0 = Infinity, s1 = -Infinity;
    for (let i = 0; i < n; i++) { const l = pts[i * 3 + L]; if (l < lo || l > hi) continue; const u = pts[i * 3 + U], s = pts[i * 3 + S]; if (u < u0) u0 = u; if (u > u1) u1 = u; if (s < s0) s0 = s; if (s > s1) s1 = s; }
    return (u1 - u0 + 1e-6) * (s1 - s0 + 1e-6);
  };
  let sm = cross(1) <= cross(-1) ? 1 : -1;                    // +1: muzzle at the + end of the long axis
  if (cal.orient.flip) sm = -sm;
  // --- up sign: dense receiver/sights sit above the magazine/grip, so the vertex mass skews upward
  let mean = 0; for (let i = 0; i < n; i++) mean += pts[i * 3 + U]; mean /= n;
  let su = mean >= (mn[U] + mx[U]) / 2 ? 1 : -1;
  if (cal.orient.flipUp) su = -su;
  const m = AX[L].clone().multiplyScalar(sm), u = AX[U].clone().multiplyScalar(su), side = new THREE.Vector3().crossVectors(m, u);
  const R = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, u, m.clone().negate())).invert();
  // --- bounds in the oriented frame
  const rp = new Float32Array(n * 3), v = new THREE.Vector3(), omn = [Infinity, Infinity, Infinity], omx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) { v.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]).applyQuaternion(R); rp[i * 3] = v.x; rp[i * 3 + 1] = v.y; rp[i * 3 + 2] = v.z; for (let a = 0; a < 3; a++) { const c = rp[i * 3 + a]; if (c < omn[a]) omn[a] = c; if (c > omx[a]) omx[a] = c; } }
  const oext = new THREE.Vector3(omx[0] - omn[0], omx[1] - omn[1], omx[2] - omn[2]);
  const oc = new THREE.Vector3((omx[0] + omn[0]) / 2, (omx[1] + omn[1]) / 2, (omx[2] + omn[2]) / 2);   // centre in oriented frame
  const center = oc.clone().applyQuaternion(R.clone().invert());                                         // ... in model frame
  const scale = w.len / oext.z;
  // --- sight point (relative to the oriented centre, unscaled units)
  let sight = null;
  const cand = [];
  root.traverse((o) => { if (/rear.?sight|aim.?point|ads|iron.?sight|sight_rear/i.test(o.name) && !/end/i.test(o.name)) cand.push(o); });
  for (const o of cand) {
    const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyQuaternion(R).sub(oc);
    const ok = Math.abs(p.x) < oext.x * 0.6 && p.y > -oext.y * 0.1 && p.y < oext.y * 0.6 + 1e-6 && Math.abs(p.z) < oext.z * 0.55;
    if (ok) { sight = new THREE.Vector3(0, p.y, p.z); break; }
  }
  if (!sight) {
    const zs = oext.z * 0.5 - oext.z * 0.36, ys = [];                              // ~36% in from the rear
    for (let i = 0; i < n; i++) { const z = rp[i * 3 + 2] - oc.z; if (Math.abs(z - zs) < oext.z * 0.15) ys.push(rp[i * 3 + 1] - oc.y); }
    ys.sort((a, b) => a - b);
    const top = ys.length ? ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.92))] : oext.y * 0.3;
    sight = new THREE.Vector3(0, top - w.sightDrop / scale, zs);
  }
  // --- attachment anchors (oriented frame, relative to the centre, unscaled): muzzle tip, top surface for optics, underside for grips / lasers.
  // `anchors` assumes the muzzle at -Z (the detected orientation); `anchorsFlip` is the same measured with the gun turned 180 deg about Y - used for weapons whose
  // calibration rotates them by 180 deg because the auto-detection picked the wrong end (see attachments.js).
  const LL = oext.z, pct = (a, q) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * q)))]; };
  const anchorsFor = (sg) => {
    const X = (i) => sg * (rp[i * 3] - oc.x), Y = (i) => rp[i * 3 + 1] - oc.y, Z = (i) => sg * (rp[i * 3 + 2] - oc.z);
    const band = (z0, z1, xmax) => { const ys = []; for (let i = 0; i < n; i++) { const z = Z(i); if (z >= z0 && z <= z1 && Math.abs(X(i)) <= xmax) ys.push(Y(i)); } return ys; };
    let my0 = Infinity, my1 = -Infinity, mx0 = Infinity, mx1 = -Infinity;
    for (let i = 0; i < n; i++) { if (Z(i) > -LL / 2 + LL * 0.05) continue; const y = Y(i), x = X(i); if (y < my0) my0 = y; if (y > my1) my1 = y; if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; }
    const a = {
      muzzleY: my1 > my0 ? (my0 + my1) / 2 : 0, muzzleX: mx1 > mx0 ? (mx0 + mx1) / 2 : 0, muzzleR: Math.max(0.0001, Math.min(my1 - my0, mx1 - mx0) / 2), muzzleZ: -LL / 2,
      opticZ: LL * 0.12, opticY: pct(band(LL * 0.02, LL * 0.22, oext.x * 0.2), 0.9),
      underY: pct(band(-LL * 0.4, -LL * 0.1, oext.x * 0.3), 0.04), gripZ: -LL * 0.22, laserZ: -LL * 0.34,
    };
    if (a.opticY == null) a.opticY = oext.y * 0.3; if (a.underY == null) a.underY = -oext.y * 0.1;
    return a;
  };
  const anchors = anchorsFor(1), anchorsFlip = anchorsFor(-1);
  return { id, root, R, center, ext: oext, scale, sight, anchors, anchorsFlip, procedural: false, axes: { long: 'xyz'[L], up: 'xyz'[U], side: 'xyz'[S], muzzleSign: sm, upSign: su } };
}

// Procedural weapon (laser rifle, and fallback for any GLB that fails). Already in canonical orientation (muzzle -Z, up +Y).
const PA = (L) => ({ muzzleY: 0.01, muzzleX: 0, muzzleR: 0.02, muzzleZ: -L / 2, opticZ: L * 0.12, opticY: 0.08, underY: -0.05, gripZ: -L * 0.22, laserZ: -L * 0.34 });
export function buildProcedural(id) {
  const w = WEAPONS[id], g = new THREE.Group(), glow = id === 'laser_rifle' || !!w.laser, gc = id === 'laser_rifle' ? 0x40e0ff : w.color;
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272d, metalness: 0.6, roughness: 0.4 });
  const acc = new THREE.MeshStandardMaterial({ color: glow ? gc : 0x555a63, emissive: glow ? (id === 'laser_rifle' ? 0x0aa5c8 : gc) : 0x000000, emissiveIntensity: glow ? 1.4 : 0, metalness: 0.4, roughness: 0.3 });
  const box = (sx, sy, sz, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); g.add(b); return b; };
  box(0.07, 0.1, 0.5, 0, 0, 0, dark);                     // body
  box(0.035, 0.035, 0.4, 0, 0.01, -0.42, acc);            // barrel / emitter
  box(0.06, 0.16, 0.06, 0, -0.12, 0.06, dark);            // grip
  box(0.06, 0.12, 0.2, 0, -0.02, 0.3, dark);              // stock
  box(0.03, 0.03, 0.14, 0, 0.07, -0.05, acc);             // top rail
  if (glow) box(0.09, 0.03, 0.2, 0, -0.02, -0.12, acc);
  const ext = new THREE.Vector3(0.09, 0.26, 0.92), scale = w.len / ext.z;
  const L = ext.z; return { id, root: g, R: new THREE.Quaternion(), center: new THREE.Vector3(0, 0, -0.04), ext, scale, sight: new THREE.Vector3(0, 0.1 - w.sightDrop / scale, 0.16), procedural: true, axes: {},
    anchors: PA(L), anchorsFlip: PA(L) };
}

export function instantiate(prep) {
  const c = prep.procedural ? prep.root.clone(true) : SkeletonUtils.clone(prep.root);
  c.traverse((o) => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return c;
}
