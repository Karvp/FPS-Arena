// First-person ViewModel:  camera -> weaponGroup (pose/animation) -> weaponWrapper (calibration rot/scale) -> orient (auto R,s) -> centered -> glb
import * as THREE from 'three';
import { WEAPONS } from '/shared/weapons.js';
import { getCal } from './calibration.js';
import { getOpticAds } from './attachcal.js';

import { prepared } from './assets.js';
import { instantiate, buildProcedural } from './weaponmodel.js';
import { lerp3 } from './ads.js';
import { settings } from './settings.js';
import { buildAttachments, ensureAtt, onAttLoaded } from './attachments.js';

const D2R = Math.PI / 180, SLASH_TIME = 0.3;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// Stim Shot: left hand brings a white syringe in from the lower left, winds up, jabs toward the body, holds, then pulls away. [time, position, rotation]
const STIM_KF = [[0, [-0.55, -0.55, -0.4], [0.2, -0.2, 0.3]], [0.25, [-0.24, -0.3, -0.42], [-0.05, 0.55, 0.15]], [0.42, [-0.28, -0.27, -0.46], [-0.05, 0.62, 0.15]],
  [0.55, [-0.07, -0.3, -0.34], [0, 1.15, 0.05]], [0.78, [-0.07, -0.3, -0.34], [0, 1.15, 0.05]], [1, [-0.55, -0.55, -0.4], [0.2, -0.2, 0.3]]];
function stimPose(k) {
  let i = 0; while (i < STIM_KF.length - 2 && k > STIM_KF[i + 1][0]) i++;
  const a = STIM_KF[i], b = STIM_KF[i + 1], u = Math.max(0, Math.min(1, (k - a[0]) / (b[0] - a[0]))), e = u * u * (3 - 2 * u), L = (x, y) => x + (y - x) * e;
  return { p: [L(a[1][0], b[1][0]), L(a[1][1], b[1][1]), L(a[1][2], b[1][2])], r: [L(a[2][0], b[2][0]), L(a[2][1], b[2][1]), L(a[2][2], b[2][2])] };
}
export class ViewModel {
  constructor(camera) {
    this.cam = camera; this.sprintT = 0; this.runT = 0; this.throwT = 0; this.stimT = 0;
    this.hand = new THREE.Group(); camera.add(this.hand);                                  // grenade / syringe shown while throwing / injecting
    this.nade = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4a5a2a })); this.nade.visible = false; this.hand.add(this.nade);
    this.syringe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.36), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x555555 })); this.syringe.visible = false; this.hand.add(this.syringe);
    this.group = new THREE.Group(); this.wrapper = new THREE.Group(); this.orient = new THREE.Group(); this.centered = new THREE.Group();
    this.group.name = 'weaponGroup'; this.wrapper.name = 'weaponWrapper';
    this.group.add(this.wrapper); this.wrapper.add(this.orient); this.orient.add(this.centered); camera.add(this.group);
    this.attG = new THREE.Group(); this.attG.name = 'weaponAttachments'; this.wrapper.add(this.attG);               // attachments live in the weapon's own frame (see attachments.js)
    this.att = ''; this.optic = null; this.laser = null; this.supLen = 0;
    onAttLoaded(() => { if (this.att && this.prep) this.applyCal(); });
    this.id = null; this.prep = null; this.hip = [0.24, -0.22, -0.55]; this.adsPos = [0, 0, -0.35];
    this.slashT = 0; this.kick = 0; this.kickRot = 0; this.shk = [0, 0, 0]; this.bobT = 0; this.swayX = 0; this.swayY = 0; this.flashT = 0; this.equipT = 0; this.model = null;
    const fm = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), fm); this.flash.visible = false; this.flash.frustumCulled = false; this.wrapper.add(this.flash);
    this.light = new THREE.PointLight(0xffc070, 0, 4); this.wrapper.add(this.light);
    this.info = { file: '', status: '', axes: {} };
  }
  equip(id, att = '') {
    if (this.id === id && this.att === att) return;
    if (this.id === id && this.prep) { this.att = att; ensureAtt(att); this.applyCal(); return; }        // same gun, other attachments: no re-equip animation
    this.id = id; this.att = att; ensureAtt(att);
    this.centered.clear(); this.model = null;
    if (WEAPONS[id].unarmed) { this.unarmed = true; this.prep = null; this.rebuildAtt(); return; }
    this.unarmed = false;
    let prep = prepared.get(id); if (!prep) prep = buildProcedural(id);
    this.prep = prep; this.model = instantiate(prep); this.centered.add(this.model);
    this.centered.position.copy(prep.center).negate(); this.orient.quaternion.copy(prep.R); this.orient.scale.setScalar(prep.scale);
    this.equipT = 1; this.applyCal();
  }
  // (re)creates the attachment meshes; also called by DEV MODE after calibration edits
  rebuildAtt() {
    this.attG.clear(); this.optic = null; this.laser = null; this.supLen = 0;
    if (!this.prep || !this.att) return;
    const ry = (((getCal(this.id).rotationDeg[1] % 360) + 360) % 360), flip = ry > 90 && ry < 270;       // the calibration turned this gun around (auto-detection picked the wrong end)
    const r = buildAttachments(this.prep, this.att, this.id, flip); this.attG.add(r.group); this.optic = r.optic; this.laser = r.laser; this.supLen = r.supLen;
  }
  // recompute everything derived from the calibration (called after DEV MODE edits, too)
  applyCal() {
    const cal = getCal(this.id), w = WEAPONS[this.id], p = this.prep; if (!p) return;
    this.rebuildAtt();                                                   // attachment placement depends on the calibration (flip) and DEV MODE edits
    this.wrapper.rotation.set(cal.rotationDeg[0] * D2R, cal.rotationDeg[1] * D2R, cal.rotationDeg[2] * D2R); this.wrapper.scale.setScalar(cal.scale);
    this.wrapper.updateMatrix();
    this.hip = cal.position.slice();
    const ironG = p.sight.clone().multiplyScalar(p.scale * cal.scale).applyQuaternion(this.wrapper.quaternion);   // iron sight point in weaponGroup space
    const half = p.ext.z * p.scale * cal.scale / 2;
    // ADS pose: the GUN is centred on its iron sights; offsets are added after the safety clamp so they can always move the gun (also closer / further)
    const ironBase = [-ironG.x, -ironG.y, Math.min(-cal.eyeRelief - ironG.z, -0.05 - half)];
    let pose; this.opticAdsAuto = null; this.opticAdsUsed = null;
    if (this.optic) {                                                    // an optic only swaps in its own ADS offset (attachcal.js / DEV MODE), it does not re-centre the gun
      const oG = this.optic.aim.clone().multiplyScalar(cal.scale).applyQuaternion(this.wrapper.quaternion);
      const auto = [-oG.x, -oG.y, Math.min(-this.optic.eyeRelief - oG.z, -0.05 - half)].map((v, i) => v - ironBase[i]);   // start value: the offset that puts the optic's centre on the crosshair
      const a = getOpticAds(this.id, this.optic.id) || auto; this.opticAdsAuto = auto; this.opticAdsUsed = a; pose = ironBase.map((v, i) => v + a[i]);
    } else pose = ironBase.map((v, i) => v + cal.ads[i]);
    this.adsPos = [pose[0], pose[1], Math.max(-1.2, pose[2])];
    this.muzzleZ = -half - 0.02;
    this.flash.position.set(0, ironG.y * 0.4, this.muzzleZ); this.light.position.copy(this.flash.position);
    this.flash.scale.setScalar(w.cat === 'Shotgun' ? 1.5 : w.id === 'laser_rifle' ? 0.6 : 1);
    this.flash.material.color.set(w.id === 'laser_rifle' ? 0x40e0ff : 0xffd27a);
  }
  playThrow() { this.throwT = 0.5; }
  playStim() { this.stimT = 1.0; }
  fire(w) {
    if (w.melee) { this.slashT = SLASH_TIME; return; }                                     // knife: a left-to-right slash, no recoil / muzzle flash
    const cat = w.cat === 'Assault Rifle' ? 'ar' : w.cat === 'SMG' ? 'smg' : '';
    if (cat) {      // AR / SMG: the whole gun punches BACK, the muzzle barely rises (front sight ~static); SMGs also shake the rear sight a little in every direction
      this.kick = Math.min(1, this.kick + 0.55 + w.recoilV * 0.12); this.kickRot = Math.min(1, this.kickRot + 0.05);
      // SH = SMG rear-sight shake strength (0.08 = 8 % of the first version)
      if (cat === 'smg') { const r = () => Math.random() * 2 - 1; const SH = 0.08; this.shk[0] += r() * 0.6 * SH; this.shk[1] += r() * 0.6 * SH; this.shk[2] += r() * 0.7 * SH; }
    } else { this.kick = Math.min(1, this.kick + 0.5 + w.recoilV * 0.15); this.kickRot = Math.min(1, this.kickRot + 0.3 + w.recoilV * 0.12); }
    this.flashT = w.suppressed ? 0 : 0.045; this.flash.rotation.z = Math.random() * 6.28;          // suppressor: no muzzle flash
  }
  update(dt, st) {
    const w = WEAPONS[this.id]; if (!w) return;
    if (this.unarmed) { this.group.visible = false; this.hand.visible = false; return; }
    const e = st.ads, red = settings.reduced ? 0.15 : 1, calm = 1 - e * 0.85;
    this.kick *= Math.exp(-dt * 16); this.kickRot *= Math.exp(-dt * 12); const sd = Math.exp(-dt * 20); this.shk[0] *= sd; this.shk[1] *= sd; this.shk[2] *= sd; this.equipT = Math.max(0, this.equipT - dt * 3);
    this.bobT += dt * st.speed * 1.9 * (st.onGround ? 1 : 0);
    const bobX = Math.sin(this.bobT) * 0.006 * calm * red * Math.min(1, st.speed / 6), bobY = Math.abs(Math.cos(this.bobT)) * 0.008 * calm * red * Math.min(1, st.speed / 6);
    this.swayX += (-st.lookDx * 0.00045 * red * calm - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (st.lookDy * 0.00045 * red * calm - this.swayY) * Math.min(1, dt * 10);
    const pos = lerp3(this.hip, this.adsPos, e);
    pos[1] -= Math.sin(Math.PI * e) * 0.008;
    let rx = 0, ry = 0, rz = 0, dy = 0, dz = 0, dx = 0;
    if (st.reloading) { const f = Math.sin(Math.PI * Math.min(1, st.reloadFrac)); dy -= 0.13 * f; rx -= 0.55 * f; rz += 0.35 * f; }
    if (st.plating) { dy -= 0.22; rx -= 0.7; }
    if (st.sliding) { rz += 0.28; dy -= 0.05; ry += 0.15; }
    dy -= this.equipT * this.equipT * 0.35; rx -= this.equipT * 0.8;
    // sprint. Rifles etc.: rotated 90 degrees to the left, slid toward the centre and swung violently.
    //   SMG + pistols ONLY: muzzle tilted up 75 degrees, the gun pulled much closer to the player and lowered a little (no sideways move), still swinging.
    //   Melee knife: no rotation and no move toward the centre, it just swings around.
    this.sprintT += ((st.sprinting ? 1 : 0) - this.sprintT) * Math.min(1, dt * 12); const sp = this.sprintT, smgLike = w.cat === 'SMG' || (w.cat === 'Pistol' && !w.melee);
    if (sp > 0.002) {
      this.runT += dt * 11 * sp;
      if (w.melee) { rz += Math.sin(this.runT) * 0.35 * sp; rx += Math.cos(this.runT * 2) * 0.2 * sp; dy += (Math.abs(Math.sin(this.runT)) * 0.07 - 0.05) * sp; dz += Math.sin(this.runT) * 0.06 * sp; dx += Math.sin(this.runT * 0.5) * 0.04 * sp; }
      else if (smgLike) { rx += 75 * D2R * sp; dz += 0.2 * sp; dy -= 0.07 * sp; rz += Math.sin(this.runT) * 0.2 * sp; rx += Math.cos(this.runT * 2) * 0.1 * sp; dy += (Math.abs(Math.sin(this.runT)) * 0.06 - 0.06) * sp; dz += Math.sin(this.runT) * 0.05 * sp; }
      else { dx -= 0.11 * sp; ry += sp * Math.PI / 2; rz += Math.sin(this.runT) * 0.2 * sp; rx += Math.cos(this.runT * 2) * 0.1 * sp; dy += (Math.abs(Math.sin(this.runT)) * 0.06 - 0.06) * sp; dz += Math.sin(this.runT) * 0.07 * sp; }
    }
    // knife slash: the blade goes horizontal (rolled 90 degrees to the left) and sweeps quickly from the left to the right
    if (this.slashT > 0) {
      this.slashT = Math.max(0, this.slashT - dt); const k = 1 - this.slashT / SLASH_TIME, pose = smooth(k / 0.18) * (1 - smooth((k - 0.82) / 0.18)), sweep = smooth((k - 0.12) / 0.62);
      rz += Math.PI / 2 * pose; ry += (1.25 - 2.45 * sweep) * pose; dx += (-0.2 + 0.46 * sweep) * pose; dz -= 0.12 * pose; dy += 0.02 * pose;
    }
    // throwing: weapon drops while the grenade is thrown;  stim: weapon drops, a white syringe jabs in from the left hand
    this.hand.visible = this.throwT > 0 || this.stimT > 0; this.nade.visible = this.throwT > 0; this.syringe.visible = this.stimT > 0;
    if (this.throwT > 0) {
      this.throwT = Math.max(0, this.throwT - dt); const k = 1 - this.throwT / 0.5, s1 = Math.sin(k * Math.PI);
      dy -= s1 * 0.22; rx -= s1 * 0.5; this.nade.position.set(0.22 - k * 0.1, -0.3 + Math.sin(k * 2.2) * 0.35, -0.3 - k * 0.7);
    }
    if (this.stimT > 0) {
      this.stimT = Math.max(0, this.stimT - dt); const k = 1 - this.stimT / 1.0;
      const low = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1; dy -= low * 0.2; rx -= low * 0.4; rz += low * 0.12;   // the weapon gets out of the way
      const f = stimPose(k); this.syringe.position.set(f.p[0], f.p[1] + (k > 0.55 && k < 0.78 ? Math.sin(k * 90) * 0.004 : 0), f.p[2]); this.syringe.rotation.set(f.r[0], f.r[1], f.r[2]);
    }
    const rear = w.cat === 'Assault Rifle' || w.cat === 'SMG', kz = rear ? 0.065 : 0.045, L = w.len || 0.8;
    let kx = this.kickRot * 0.06, ky = 0, kzr = 0;
    if (rear) {      // pivot about the front sight: every tiny rotation is cancelled at the muzzle by an opposite offset
      kx += this.shk[0] * 0.035; ky = this.shk[1] * 0.035; kzr = this.shk[2] * 0.05;
      dy -= L * kx; dx += L * ky;
    }
    this.group.position.set(pos[0] + bobX + this.swayX + dx, pos[1] + bobY + this.swayY + dy, pos[2] + this.kick * kz + dz);
    this.group.rotation.set(rx + kx + this.swayY * 2, ry + ky + this.swayX * 2, rz + kzr);
    this.group.visible = st.visible && !(w.sniper && e > 0.9);
    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = this.flashT > 0; this.light.intensity = this.flashT > 0 ? 1.4 : 0; } else { this.flash.visible = false; this.light.intensity = 0; }
  }
}
