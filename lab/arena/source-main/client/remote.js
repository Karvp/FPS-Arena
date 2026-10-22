// Remote players: timestamped snapshot buffer, interpolation at (serverNow - INTERP_DELAY), limited extrapolation, procedural humanoid.
// Poses: stand / crouch / slide / prone (lying, head slightly up) / lean / sprint. Effects: Kinetic Armor = yellow flashing, Annihilator = red glint,
// Exoskeleton = golden trail (+ fast blue flashing while charging), Warmonger = big red glint, Dissociative Surreality spirit = 50 % transparent, Poltergeist = invisible, Scout Pulse marks = red silhouette through walls.
import * as THREE from 'three';
import { PLAYER, LEAN } from '/shared/constants.js';
import { WEAPONS } from '/shared/weapons.js';
import { SKILLS } from '/shared/skills.js';
import { parseAtt } from '/shared/attachments.js';
import { forwardVec } from '/shared/geometry.js';
import { LaserFx } from './laserfx.js';

const TEAM_COL = [0xd8433f, 0x3f7fd8, 0x3fb85a, 0xd9a920];            // red, blue, green, gold (Battle Royale has 4 teams)
function angLerp(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }

export function humanoidMesh(team) { return humanoid(team); }
export function zombieMesh() { return humanoid(0, true); }
function humanoid(team, zombie = false, ghost = false) {
  const g = new THREE.Group(), mats = [];
  const M = (c) => { const m = ghost ? new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }); mats.push(m); return m; };
  const mat = M(zombie ? 0x3d4a32 : TEAM_COL[team]), dark = M(0x22262c), skin = M(zombie ? 0x7d9a62 : 0xd9b48f);
  const body = new THREE.Group(); g.add(body);
  const b = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (ghost) o.renderOrder = 999; body.add(o); return o; };
  b(new THREE.BoxGeometry(0.5, 0.7, 0.28), mat, 0, 1.05, 0);
  b(new THREE.BoxGeometry(0.2, 0.75, 0.22), dark, -0.14, 0.38, 0); b(new THREE.BoxGeometry(0.2, 0.75, 0.22), dark, 0.14, 0.38, 0);
  b(new THREE.SphereGeometry(PLAYER.headRadius, 12, 10), skin, 0, PLAYER.headY, 0);
  if (zombie) { b(new THREE.BoxGeometry(0.14, 0.14, 0.7), mat, 0.28, 1.2, -0.38); b(new THREE.BoxGeometry(0.14, 0.14, 0.7), mat, -0.28, 1.2, -0.38); }   // outstretched arms
  const gun = zombie ? [] : [b(new THREE.BoxGeometry(0.14, 0.14, 0.7), dark, 0.3, 1.15, -0.3), b(new THREE.BoxGeometry(0.12, 0.5, 0.12), mat, 0.32, 1.0, -0.1)];   // gun + arm (hidden while downed)
  g.userData = { body, mats, dark, ghost, gun };
  return g;
}
// white star glint (shown at the head of a player who is aiming down a sniper scope)
let glintTex = null;
function glintTexture() {
  if (glintTex) return glintTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.85)'); g.addColorStop(0.5, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(62, 4, 4, 120); x.fillRect(4, 62, 120, 4);
  glintTex = new THREE.CanvasTexture(c); return glintTex;
}
function pose(m, d) {
  const body = m.userData.body; body.rotation.set(0, 0, 0); body.position.set(0, 0, 0); body.scale.set(1, 1, 1);
  for (const o of m.userData.gun) o.visible = !d.dn;                                       // downed players hold no gun
  if (d.dn) { body.rotation.x = Math.PI / 2 - 0.4; body.position.y = 0.16; }                  // downed: lying on the BACK (face up, opposite to prone), head tilted up
  else if (d.sl) { body.scale.y = 0.62; body.position.z = 0.15; }
  else if (d.sn === 1) body.scale.y = 0.78;                                           // crouch
  else if (d.sn === 2) { body.rotation.x = -Math.PI / 2 + 0.2; body.position.y = 0.2; }   // prone: horizontal, head slightly up
  else if (d.sp) body.rotation.x = -0.26;                                             // sprint: leaning forward
  if (d.ln) { body.rotation.z = -d.ln * 0.32; body.position.x = d.ln * LEAN.offset; }
}

const setAlpha = (m, a) => { for (const mt of m.userData.mats) { const t = a < 1; if (mt.transparent !== t) { mt.transparent = t; mt.needsUpdate = true; } mt.opacity = a; mt.depthWrite = !t; } };

export class Remotes {
  constructor(scene, zombies = false, onTrail = null) { this.scene = scene; this.map = new Map(); this.list = []; this.zombies = zombies; this.marks = new Set(); this.onTrail = onTrail; this.trailT = 0; }
  setMarks(ids) { this.marks = new Set(ids || []); }
  addSnap(snap, key = 'pl') {
    const seen = new Set();
    for (const p of snap[key] || []) {
      seen.add(p.id);
      let r = this.map.get(p.id);
      if (!r) { r = { id: p.id, buf: [], mesh: humanoid(p.tm || 0, this.zombies), ghost: null, team: p.tm || 0, data: p, pos: new THREE.Vector3(), yaw: 0, alive: false, speed: 0 }; r.mesh.visible = false; this.scene.add(r.mesh); this.map.set(p.id, r); }
      r.data = p; r.buf.push({ t: snap.t, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, al: p.al ?? 1, sl: p.sl || 0 });
      if (r.buf.length > 30) r.buf.shift();
      if (!this.zombies && r.team !== p.tm) { r.team = p.tm; this.scene.remove(r.mesh); r.mesh = humanoid(p.tm); this.scene.add(r.mesh); }
    }
    for (const [id, r] of this.map) if (!seen.has(id)) this.drop(r);
  }
  drop(r) { this.scene.remove(r.mesh); if (r.ghost) this.scene.remove(r.ghost); if (r.glint) this.scene.remove(r.glint); if (r.wglint) this.scene.remove(r.wglint); if (r.laser) r.laser.dispose(); this.map.delete(r.id); }
  remove(id) { const r = this.map.get(id); if (r) this.drop(r); }
  clear() { for (const r of [...this.map.values()]) this.drop(r); }
  update(renderT, selfId, now = performance.now() / 1000, dt = 0.016) {
    this.list.length = 0; this.trailT -= dt;
    for (const r of this.map.values()) {
      const b = r.buf; if (!b.length) continue;
      let a = null, c = null;
      for (let i = b.length - 1; i >= 0; i--) if (b[i].t <= renderT) { a = b[i]; c = b[i + 1] || null; break; }
      let x, y, z, yaw, alive;
      if (!a) { a = b[0]; x = a.x; y = a.y; z = a.z; yaw = a.yaw; alive = a.al; }
      else if (c) { const k = (renderT - a.t) / ((c.t - a.t) || 1); x = a.x + (c.x - a.x) * k; y = a.y + (c.y - a.y) * k; z = a.z + (c.z - a.z) * k; yaw = angLerp(a.yaw, c.yaw, k); alive = a.al; }
      else {   // ran past the newest snapshot: extrapolate briefly (<=100 ms), then hold
        const p = b[b.length - 2], d = (a.t - (p ? p.t : a.t - 0.033)) || 0.033, e = Math.min(0.1, renderT - a.t);
        const vx = p ? (a.x - p.x) / d : 0, vz = p ? (a.z - p.z) / d : 0;
        x = a.x + vx * e; y = a.y; z = a.z + vz * e; yaw = a.yaw; alive = a.al;
      }
      const dx = x - r.pos.x, dz = z - r.pos.z, d0 = r.data; r.speed = Math.hypot(dx, dz) * 60; r.pos.set(x, y, z); r.yaw = yaw;
      r.alive = !!alive && r.id !== selfId; r.sliding = !!d0.sl; r.stance = d0.sn || 0; r.lean = d0.ln || 0; r.invisible = !!d0.iv;
      const m = r.mesh; m.visible = r.alive && !r.invisible; m.position.set(x, y, z); m.rotation.y = yaw; pose(m, d0);
      // effect flags
      const dnFlash = d0.dn && Math.floor(now * 5) % 2 === 0, flash = d0.ka && Math.floor(now * 8) % 2 === 0, blue = d0.ch && Math.floor(now * 16) % 2 === 0, glint = d0.w === 'annihilator' ? 0.3 + 0.7 * Math.abs(Math.sin(now * 6)) : 0;
      for (const mt of m.userData.mats) { if (mt.emissive) { mt.emissive.setHex(dnFlash ? 0xff0000 : blue ? 0x2a7bff : flash ? 0xffd400 : glint ? 0xff1a1a : 0); mt.emissiveIntensity = dnFlash ? 1.6 : blue ? 1.6 : flash ? 1.2 : glint; } }      // Overload charge: quick blue flashing
      setAlpha(m, d0.ds ? SKILLS.dsr.opacity : 1);                                       // Dissociative Surreality: the spirit is 50 % transparent
      if (d0.ex && r.alive && this.onTrail && this.trailT <= 0) this.onTrail(x, y + 0.9, z);
      // scout pulse: red silhouette through walls
      const marked = r.alive && this.marks.has(r.id);
      if (marked) { if (!r.ghost) { r.ghost = humanoid(0, this.zombies, true); this.scene.add(r.ghost); } r.ghost.visible = true; r.ghost.position.copy(m.position); r.ghost.rotation.y = yaw; pose(r.ghost, d0); }
      else if (r.ghost) r.ghost.visible = false;
      // sniper glint: a noticeable white flash at the centre of the head while the player is scoped in
      const wp = WEAPONS[d0.w], glint2 = !!(d0.aim && wp && wp.sniper && r.alive && !r.invisible);
      if (glint2) {
        if (!r.glint) { r.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); r.glint.renderOrder = 998; this.scene.add(r.glint); }
        const hy = d0.sl ? PLAYER.slideHeadY : PLAYER.headYs[d0.sn || 0], sc = 0.9 + 0.55 * Math.abs(Math.sin(now * 9));
        r.glint.visible = true; r.glint.position.set(x + Math.cos(yaw) * (d0.ln || 0) * LEAN.offset, y + hy, z - Math.sin(yaw) * (d0.ln || 0) * LEAN.offset); r.glint.scale.set(sc, sc, 1);
      } else if (r.glint) r.glint.visible = false;
      // Warmonger: a big, continuous red glint on the user (every other player sees it)
      if (d0.wm && r.alive && !r.invisible) {
        if (!r.wglint) { r.wglint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); r.wglint.renderOrder = 998; this.scene.add(r.wglint); }
        const sc = 2.4 + 0.5 * Math.abs(Math.sin(now * 4)); r.wglint.visible = true; r.wglint.position.set(x, y + 1.3, z); r.wglint.scale.set(sc, sc, 1);
      } else if (r.wglint) r.wglint.visible = false;
      // Laser Sight: everybody sees the beam of a player who carries one
      const lz = d0.at && !this.zombies && this.boxes && r.alive && !r.invisible && parseAtt(d0.at).laser;
      if (lz) {
        if (!r.laser) r.laser = new LaserFx(this.scene, false);
        const f = forwardVec(yaw, d0.pitch || 0), gy = d0.sl ? 0.75 : d0.sn === 2 ? 0.45 : d0.sn === 1 ? 0.9 : 1.15;
        r.laser.set({ x: x + Math.cos(yaw) * 0.3 - Math.sin(yaw) * 0.65, y: y + gy, z: z - Math.sin(yaw) * 0.3 - Math.cos(yaw) * 0.65 }, { x: f[0], y: f[1], z: f[2] }, this.boxes, 60);
      } else if (r.laser) r.laser.hide();
      if (r.alive) this.list.push(r);
    }
    if (this.trailT <= 0) this.trailT = 0.05;
    return this.list;
  }
}
