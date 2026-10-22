// In-match client controller: prediction loop (fixed 60 Hz), rendering state, effects, event handlers.
import * as THREE from 'three';
import { DT, PLAYER, PITCH_MAX, BOUND, ZIP, LEAN } from '/shared/constants.js';
import { SKILLS, THROWABLES, canAim, fxOf } from '/shared/skills.js';
import { MAPS } from '/maps/index.js';
import { WEAPONS, spreadFor } from '/shared/weapons.js';
import { RARITIES } from '/shared/rarity.js';
import { StreakView } from './streaks.js';
import { StreakHud } from './streakhud.js';
import { STREAKS } from '/shared/streaks.js';
import { forwardVec, rightVec, spreadDir, mulberry32, hashSeq, rayWorld, rayAABB, raySphere } from '/shared/geometry.js';
import { eyeHeightOf } from '/shared/movement.js';
import { aimLocked } from '/shared/weaponstate.js';
import { buildMapScene } from './maps.js';
import { CameraRig } from './camera.js';
import { LocalPlayer } from './player.js';
import { Remotes } from './remote.js';
import { ViewModel } from './weapons.js';
import { ADS } from './ads.js';
import { ModeView } from './modes.js';
import { LootView } from './loot.js';
import { EffectsView } from './effects.js';
import { onLoaded } from './assets.js';
import { Audio } from './audio.js';
import { settings, attOf } from './settings.js';
import { LaserFx } from './laserfx.js';

const D2R = Math.PI / 180;
export class Game {
  constructor(net, input, hud) {
    this.net = net; this.input = input; this.hud = hud; this.skhud = new StreakHud(); this.skv = null; this.odinShake = 0; this.chCd = 0; this.view = null;
    this.rig = new CameraRig(settings.fov); this.vm = new ViewModel(this.rig.camera); this.ads = new ADS();
    this.scene = null; this.map = null; this.built = null; this.local = new LocalPlayer(); this.remotes = null; this.modeView = null;
    this.acc = 0; this.pos = { x: 0, y: 0, z: 0 }; this.eyeY = 1.6; this.recoilPool = 0; this.modeState = null; this.phase = 'match'; this.lastTick = 0;
    this.names = new Map(); this.players = []; this.tracers = []; this.running = false; this.boardT = 0; this.lastBomb = ''; this.lookDx = 0; this.lookDy = 0; this.lastPredHit = 0; this.spec = { x: 0, y: 6, z: 0 }; this.specInit = false; this.loot = null; this.zremotes = null; this.you = null; this.place = 0;
    net.on('snap', (s) => this.onSnap(s));
    onLoaded((id) => { if (this.vm.id === id) { const a = this.vm.att; this.vm.id = null; this.vm.equip(id, a); } });
  }
  start(info) {
    this.stop();
    this.map = MAPS[info.map] || MAPS.arena; this.scene = new THREE.Scene();
    this.built = buildMapScene(this.map, this.scene); this.rig.addTo(this.scene);
    this.skv = new StreakView(this.scene); this.skhud.reset(); this.input.streakKeys = info.kind === 'classic'; this.odinShake = 0; this.chCd = 0;
    this.fxv = new EffectsView(this.scene); this.remotes = new Remotes(this.scene, false, (x, y, z) => this.fxv.trail(x, y, z)); this.zremotes = new Remotes(this.scene, true); this.bremotes = new Remotes(this.scene, false);      // bremotes: spirit bodies (Dissociative Surreality)
    this.sprintKick = 0; this.modeView = new ModeView(this.scene, this.hud); this.loot = new LootView(this.scene); this.devAtt = null;
    this.remotes.boxes = this.map.boxes; if (this.laserFx) this.laserFx.dispose(); this.laserFx = new LaserFx(this.scene, true);                                  // Laser Sight beam / dot (own + remote players)
    this.rig.camera.far = Math.max(500, (this.map.bound || 68) * 7); this.rig.camera.updateProjectionMatrix(); this.place = 0;
    this.local = new LocalPlayer(); this.local.setMap(this.map); this.ads.reset(); this.acc = 0; this.recoilPool = 0; this.phase = 'match'; this.modeState = null; this.specInit = false;
    this.matchId = info.matchId; this.vm.id = null; this.vm.att = ''; this.vm.equip(settings.primary, attOf(settings.primary));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
    this.tracers = [];
    for (let i = 0; i < 40; i++) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]); const l = new THREE.Line(g, mat.clone()); l.frustumCulled = false; this.scene.add(l); this.tracers.push({ l, life: 0, max: 0.07 }); }
    this.hud.clearMarkers(); this.hud.show(true); this.running = true;
  }
  stop() {
    this.running = false;
    if (this.built) { this.built.dispose(); this.built = null; }
    if (this.remotes) this.remotes.clear();
    if (this.zremotes) this.zremotes.clear();
    if (this.bremotes) this.bremotes.clear();
    Audio.stopKupi();
    if (this.loot) { this.loot.clear(); this.loot = null; }
    if (this.fxv) { this.fxv.clear(); this.fxv = null; }
    if (this.skv) { this.skv.clear(); this.skv = null; } this.skhud.reset(); this.odinShake = 0; this.view = null; this.input.streakKeys = false;
    if (this.modeView) this.modeView.clear();
    if (this.scene) this.scene.remove(this.rig.yawPivot);
  }
  // ------------------------------------------------------------ network events
  onSnap(s) {
    if (!this.running) return;
    this.lastTick = s.tick; this.phase = s.phase; this.modeState = s.mode; this.remotes.addSnap(s); if (s.zm) this.zremotes.addSnap(s, 'zm'); this.fxv.sync(s.pj, s.zn, s.wv); this.bremotes.addSnap(s, 'bd'); this.skv.sync(s.sk, s.odin); this.odin = s.odin; this.local.inView = !!(s.you.ss && s.you.ss.view); this.remotes.setMarks(s.you.marks); this.zremotes.setMarks(s.you.marks); this.bremotes.setMarks(s.you.marks); this.you = s.you; this.place = s.you.place || this.place;
    this.players = s.pl.filter(p => !p.ech).map(p => ({ ...p, name: this.names.get(p.id) || '?' }));         // Reserved Echelon bots are not scoreboard players
    const newEp = s.ep !== this.local.ep;
    this.local.reconcile(s);
    this.net.stats.recon = this.local.reconCount; this.net.stats.pending = this.local.pending.length;
    if (newEp) { this.rig.yaw = s.you.yaw || 0; this.rig.pitch = 0; this.ads.reset(); this.recoilPool = 0; }
  }
  onHit(d) {
    const kind = this.hud.hit(d);
    Audio.hit(kind === 'broke' || kind === 'headarmor' ? (kind === 'headarmor' ? 'head' : 'armor') : kind); this.lastPredHit = 0;
  }
  onDmg(d) { this.hud.damage(d.h, d.a); Audio.hurt(); const k = settings.shake * 0.03; this.rig.shake.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, 0); }
  onKill(d) { this.hud.killfeed(d, this.net.id); }
  onScore(d) { this.hud.score(d.pts, d.why); }
  // skills / throwables
  onSkill(d) { Audio.skill(); if (d.id === 'pulse') Audio.pulse(); }
  onThrow(d) { if (d.kind === 'stim') this.vm.playStim(); else this.vm.playThrow(); Audio.throwSfx(); }
  onBoom(d) { if (!this.running) return; this.fxv.boom(d); const dist = Math.hypot(d.x - this.pos.x, d.z - this.pos.z); Audio.boom(Math.max(0.15, 1 - dist / 90)); }
  onPulse(d) { if (!this.running) return; this.fxv.pulse(d); }
  onEnts(d) { if (this.running && this.loot) this.loot.set(d); }
  onDsr(d) { if (this.running && d.end) this.hud.banner(d.end === 'body' ? 'YOUR BODY WAS DEFEATED' : d.end === 'spirit' ? 'SPIRIT DEFEATED · BACK IN YOUR BODY' : 'BACK IN YOUR BODY', '', 1800); }
  audioError(url) { if (!this.audioWarned) this.audioWarned = new Set(); if (this.audioWarned.has(url)) return; this.audioWarned.add(url); this.hud.banner('AUDIO FILE MISSING', url, 4000); }
  onKupi(d) { if (this.running) Audio.startKupi(SKILLS.kupi.audio, d.dur, SKILLS.kupi.volume, (u) => this.audioError(u)); }        // Iphone Kupi: loud for everybody
  onKupiDeath() { if (this.running) Audio.playOnce(SKILLS.kupi.deathAudio, SKILLS.kupi.volume, (u) => this.audioError(u)); }       // the defeated player only
  onPlace(d) { this.place = d.place; this.hud.overlay(`#${d.place}`, '#ffffff', 3000); }                       // eliminated: every HUD element disappears, only the placement stays for 3 s
  onAnnounce(d) {
    if (d.text === 'HARDPOINT RELOCATED') this.hud.bannerRelocated(); else this.hud.banner(d.text, '', d.kind === 'round' ? 2400 : 1800);
    if (d.kind === 'go') Audio.go(); else if (d.kind === 'plant') Audio.beep(true);
  }
  // ---- scorestreak events
  onStreakReady(d) { this.skhud.toast(`${STREAKS[d.id].name} is ready`); }
  onStreakUse(d) { if (d.anim) this.skhud.phone(); }
  onUavPing() { Audio.beep(true); }                                           // the marks themselves are the Scout-Pulse style silhouettes (you.marks)
  onEmp(d) { const my = this.you ? this.you.tm : 0; if ((d.by === 'red' ? 0 : 1) !== my) this.skhud.emp(d.time); }
  onOdinStart() { Audio.beep(true); }
  onOdinBoom(d) { this.skhud.flash(); this.odinShake = (d && d.time) || 2; this.odinShakeMax = this.odinShake; Audio.boom(1.5); Audio.explosion(); }     // 2 s of violent shake + white-out; the match ends afterwards
  onMelee(d) { if (!this.running || d.id === this.net.id) return; Audio.swing(); }
  onTrophy(d) { if (this.skv) this.skv.zap(d); }
  // own Laser Sight: beam from the emitter along the weapon, dot where it hits the map
  updateLaser(L) {
    const lf = this.laserFx, em = this.vm.laser && this.vm.laser.emit; if (!lf) return;
    if (!em || !L.alive || L.down || this.view || this.vm.unarmed || this.vm.sprintT > 0.3) { lf.hide(); return; }
    em.updateWorldMatrix(true, false); const o = new THREE.Vector3().setFromMatrixPosition(em.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(em.matrixWorld);
    lf.set(o, d, this.map.boxes, 70);
  }
  onShot(d) {
    if (!this.running || d.id === this.net.id) return;
    const w = WEAPONS[d.w]; if (!w) return;
    const dist = Math.hypot(d.o[0] - this.pos.x, d.o[2] - this.pos.z); if (d.sup) { if (dist < 25) Audio.shot({ ...w, suppressed: true }, false); } else if (dist < 90 || w.laser) Audio.shot(w, false);
    if (w.laser) { this.fxv.beam(d.o, d.e[0]); return; }
    for (const e of d.e) this.addTracer([d.o[0], d.o[1] - 0.15, d.o[2]], e, w);
  }
  addTracer(a, b, w) {
    const t = this.tracers.find(x => x.life <= 0); if (!t) return;
    const p = t.l.geometry.attributes.position; p.setXYZ(0, a[0], a[1], a[2]); p.setXYZ(1, b[0], b[1], b[2]); p.needsUpdate = true;
    t.l.material.color.setHex(w.color); t.life = t.max;
  }
  // dead + waiting to respawn (TDM / Hardpoint): E opens the loadout screen
  canLoadout() { const t = this.modeState && this.modeState.type; if (!this.running || this.phase !== 'match' || !t) return false; if (t === 'range') return true; return !this.local.alive && ['tdm', 'hp'].includes(t); }      // shooting range: E works while alive too
  // ------------------------------------------------------------ simulation
  simTick() {
    const s = this.input.sample(), lt = this.net.renderTime();
    const { inp, r } = this.local.tick(s, this.rig.yaw, this.rig.pitch, lt);
    if (this.phase === 'match') this.net.sendInput(inp);
    const w = this.local.weapon;
    if (r.fired) this.onFire(inp, w);
    { const V = this.you && this.you.ss && this.you.ss.view; if (V && V.k === 'chopper') this.chopperFire(inp, V); }
    if (r.dryFire) Audio.dry();
    if (r.reloadStarted) Audio.reload();
    if (r.plateStarted) Audio.plate();
  }
  // Attack Chopper M134: muzzle flash + recoil + a tracer for every round (the server does the damage and sends the same tracers to everybody else)
  chopperFire(inp, V) {
    const w = WEAPONS.m134; this.chCd -= DT; if (!(inp.fire && V.ammo > 0)) { this.chCd = Math.min(0, this.chCd); return; }
    const eye = [V.x, V.y - 1.8, V.z];
    while (this.chCd <= 0) {
      this.chCd += 0.04; this.vm.fire(w); this.chSnd = (this.chSnd || 0) + 1; if (this.chSnd % 2 === 0) Audio.shot(w, true);
      const d = forwardVec(inp.yaw, Math.min(0.05, inp.pitch)); d[0] += (Math.random() - 0.5) * 0.028; d[1] += (Math.random() - 0.5) * 0.028; d[2] += (Math.random() - 0.5) * 0.028; const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
      const best = rayWorld(eye, d, this.map.boxes, 240), rt = rightVec(inp.yaw);
      this.addTracer([eye[0] + d[0] * 1.2 - rt[0] * 0.0, eye[1] + d[1] * 1.2 - 0.3, eye[2] + d[2] * 1.2], [eye[0] + d[0] * best, eye[1] + d[1] * best, eye[2] + d[2] * best], w);
    }
  }
  onFire(inp, w) {
    const ads = this.ads.e > 0.5;
    const rv = w.recoilV * D2R * (0.75 + Math.random() * 0.5) * (ads ? 0.65 : 1), rh = (Math.random() - 0.5) * 2 * w.recoilH * D2R * (ads ? 0.6 : 1);
    this.rig.pitch = Math.min(PITCH_MAX, this.rig.pitch + rv); this.rig.yaw += rh; this.recoilPool += rv * 0.6;     // aim really moves; 60% recovers on its own
    this.vm.fire(w); if (w.melee) { Audio.swing(); return; } Audio.shot(w, true);          // knife: swing sound, no recoil / tracers

    const k = settings.shake * 0.006 * w.recoilV; this.rig.shake.z += k;
    // predicted tracers + predicted hit feedback (deterministic spread shared with the server)
    const mv = this.local.mv, lo = mv.lean * LEAN.offset, eye = [this.pos.x + Math.cos(inp.yaw) * lo, this.pos.y + eyeHeightOf(mv), this.pos.z - Math.sin(inp.yaw) * lo];
    const base = forwardVec(inp.yaw, inp.pitch), rt = rightVec(inp.yaw), spread = spreadFor(w, inp.aim, mv.onGround);
    const start = [eye[0] + base[0] * 0.5 + rt[0] * (ads ? 0 : 0.14), eye[1] + base[1] * 0.5 - (ads ? 0.03 : 0.12), eye[2] + base[2] * 0.5 + rt[2] * (ads ? 0 : 0.14)];
    if (w.laser) { this.fxv.beam(start, [eye[0] + base[0] * w.maxRange, eye[1] + base[1] * w.maxRange, eye[2] + base[2] * w.maxRange]); return; }      // EM2: a fat beam, hits are decided by the server
    let predicted = false, rr = w.rayRadius || 0;
    for (let i = 0; i < Math.min(w.pellets, 4); i++) {
      const dir = spreadDir(base, inp.yaw, spread, mulberry32(hashSeq(inp.seq, i)));
      let best = rayWorld(eye, dir, this.map.boxes, w.tracerRange);
      const mt = this.modeState && this.modeState.type, myTm = this.you ? this.you.tm : 0;
      const bodies = this.bremotes.list.filter(q => q.data.owner !== this.net.id && q.team !== myTm);
      const targets = (mt === 'zm' || mt === 'range') ? this.zremotes.list : this.remotes.list.filter(q => q.team !== myTm).concat(bodies);
      for (const r of targets) {
        const sl = r.sliding, hw = PLAYER.bodyHalf + rr;
        const tb = rayAABB(eye, dir, r.pos.x - hw, r.pos.y - rr, r.pos.z - hw, r.pos.x + hw, r.pos.y + (sl ? PLAYER.slideBodyHeight : PLAYER.bodyHeight) + rr, r.pos.z + hw, best);
        const th = raySphere(eye, dir, r.pos.x, r.pos.y + (sl ? PLAYER.slideHeadY : PLAYER.headY), r.pos.z, PLAYER.headRadius, best);
        const t = Math.min(tb, th); if (t < best) { best = t; predicted = true; }
      }
      this.addTracer(start, [eye[0] + dir[0] * best, eye[1] + dir[1] * best, eye[2] + dir[2] * best], w);
    }
    if (predicted) { this.hud.hitmarker('normal'); this.lastPredHit = performance.now(); }
  }
  // F prompts: crate / gun / zipline
  usePrompt(L) {
    let text = '', frac = -1; const br = this.you && this.you.br;
    if (L.alive && L.down && br && br.dn) {                                                          // downed: Self-Revive Kit (hold V) or wait for a teammate
      if (br.dn.team > 0) { text = 'BEING REVIVED…'; frac = br.dn.team; }
      else if ((this.you.kits | 0) > 0) { text = `HOLD [V] TO USE A SELF-REVIVE KIT (×${this.you.kits})`; frac = br.dn.self > 0 ? br.dn.self : -1; }
      else text = 'YOU ARE DOWNED · WAIT FOR A TEAMMATE TO REVIVE YOU';
    } else if (L.alive && L.mv.heli) text = 'PRESS [SPACE] TO JUMP OUT OF THE HELICOPTER';
    else if (L.alive && !L.down && br && br.rt) { text = `HOLD [F] TO REVIVE ${String(br.rt.n).toUpperCase()}`; frac = br.rt.h ? br.rt.f : -1; }
    else if (L.alive && !L.mv.air) {
      if (L.mv.zl) text = 'PRESS [F] TO LET GO';
      else {
        const eye = [this.pos.x, this.pos.y + eyeHeightOf(L.mv), this.pos.z], t = this.loot.target(eye[0], eye[1], eye[2], this.rig.yaw, this.rig.pitch);
        if (t && t.type === 'crate') text = 'PRESS [F] TO OPEN THE CRATE';
        else if (t) { const it = this.loot.item(t.id), nm = it ? WEAPONS[it.wid].name.toUpperCase() : 'WEAPON', full = L.ws.guns.every(q => !WEAPONS[q.id].unarmed); text = `PRESS [F] TO PICK UP ${it ? RARITIES[it.rar | 0].name.toUpperCase() + ' ' : ''}${nm}${full ? ' (REPLACES YOUR CURRENT GUN)' : ''}`; }
        else if (this.map.ziplines) {
          let bd = ZIP.attach + 0.0;
          for (const z of this.map.ziplines) {
            const ax = z.b[0] - z.a[0], ay = z.b[1] - z.a[1], az = z.b[2] - z.a[2], l2 = ax * ax + ay * ay + az * az, px = this.pos.x - z.a[0], py = this.pos.y + 1.8 - z.a[1], pz = this.pos.z - z.a[2];
            const k = Math.max(0, Math.min(1, (px * ax + py * ay + pz * az) / l2)); bd = Math.min(bd, Math.hypot(px - ax * k, py - ay * k, pz - az * k));
          }
          if (bd < ZIP.attach) text = 'PRESS [F] TO RIDE THE ZIPLINE';
        }
      }
    }
    this.hud.interact(text, frac);
  }
  frame(dt, active, paused) {
    const inp = this.input, L = this.local, w = L.weapon;
    // look (per rendered frame for low latency)
    const [dx, dy] = inp.take(); this.lookDx = dx; this.lookDy = dy;
    if (aimLocked(L.ws)) { this.rig.yaw = L.ws.lock[0]; this.rig.pitch = L.ws.lock[1]; }      // EM2 wind-up (200 ms): the camera cannot move
    else if (inp.locked && active) {
      const zoom = Math.tan(this.rig.camera.fov * D2R / 2) / Math.tan(settings.fov * D2R / 2);
      this.rig.look(dx, dy, 0.0022 * settings.sens * zoom);
    }
    if (this.recoilPool > 0) { const r = Math.min(this.recoilPool, this.recoilPool * dt * 5 + dt * 0.02); this.rig.pitch -= r; this.recoilPool -= r; }
    // fixed-step prediction
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) { if (this.net.connected && active) this.simTick(); this.acc -= DT; }
    L.decay(dt); L.renderPos(this.acc / DT, this.pos);
    // Search & Destroy: eliminated players become invisible free-flying spectators (client-side camera only; they can do nothing else)
    const spectating = !L.alive && !!this.modeState && ['snd', 'br', 'zm'].includes(this.modeState.type);
    if (spectating) {
      if (!this.specInit) { this.spec = { x: this.pos.x, y: Math.max(2.5, this.pos.y + 2), z: this.pos.z }; this.specInit = true; }
      if (inp.locked && active) {
        const k = inp.keys, f = forwardVec(this.rig.yaw, this.rig.pitch), r = rightVec(this.rig.yaw), S = this.spec;
        const fw = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), rt = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0), up = (k.has('Space') ? 1 : 0) - ((k.has('KeyC') || k.has('ControlLeft')) ? 1 : 0);
        const sp = 9 * (k.has('ShiftLeft') ? 2.5 : 1) * dt;
        S.x += (f[0] * fw + r[0] * rt) * sp; S.y += (f[1] * fw + up) * sp; S.z += (f[2] * fw + r[2] * rt) * sp;
        S.x = Math.max(-BOUND + 0.5, Math.min(BOUND - 0.5, S.x)); S.z = Math.max(-BOUND + 0.5, Math.min(BOUND - 0.5, S.z)); S.y = Math.max(0.6, Math.min(40, S.y));
      }
    } else this.specInit = false;
    const wantEye = eyeHeightOf(L.mv) - (L.alive ? 0 : 1.1);
    this.eyeY += (wantEye - this.eyeY) * Math.min(1, dt * 18);
    const V = this.you && this.you.ss && this.you.ss.view; this.view = V || null;
    if (V) {                                                                   // Predator / Chopper: only the camera moves, the body stays where it is
      if (V.k === 'chopper') this.rig.setPosition(V.x, V.y - 1.8, V.z);
      else if (V.ph === 'missile' && V.m) this.rig.setPosition(V.m[0], V.m[1], V.m[2]);
      else { this.rig.setPosition(V.x, V.y - 1, V.z); this.rig.pitch = Math.min(this.rig.pitch, -0.12); }
    } else if (spectating) this.rig.setPosition(this.spec.x, this.spec.y, this.spec.z); else this.rig.setPosition(this.pos.x, this.pos.y + this.eyeY, this.pos.z);
    this.rig.shake.multiplyScalar(Math.exp(-dt * 14));
    // ADS + FOV
    const aiming = inp.aimHeld && inp.locked && L.alive && L.ws.plateT <= 0 && canAim(L.mv, L.fxs);
    this.ads.update(dt * fxOf(L.fxs).anim, aiming, w);          // Exoskeleton / Kinetic Armor change the aim speed
    this.sprintKick += (((L.mv.sprint && L.alive) ? 4 : 0) - this.sprintKick) * Math.min(1, dt * 8);
    this.rig.setFov(this.ads.fov(settings.fov, w) + this.sprintKick); this.rig.setLean(L.alive && !V ? L.mv.lean : 0);
    if (V && V.k === 'predator' && V.ph === 'missile' && V.m) { const sy = this.rig.yaw, sp = this.rig.pitch; this.rig.yaw = Math.atan2(-V.m[3], -V.m[5]); this.rig.pitch = Math.asin(Math.max(-1, Math.min(1, V.m[4]))); this.rig.apply(); this.rig.yaw = sy; this.rig.pitch = sp; }   // the missile camera looks along its flight path; the mouse keeps steering
    else this.rig.apply();
    if (this.odinShake > 0) {                                                  // ODIN impact: violent camera shake that fades over the 2 s white-out
      this.odinShake = Math.max(0, this.odinShake - dt); const a = 0.55 * (0.25 + 0.75 * this.odinShake / (this.odinShakeMax || 2)), c = this.rig.camera;
      c.position.x += (Math.random() - 0.5) * a; c.position.y += (Math.random() - 0.5) * a; c.position.z += (Math.random() - 0.5) * a * 0.6; c.rotation.z = (Math.random() - 0.5) * a * 0.22; c.rotation.x = (Math.random() - 0.5) * a * 0.08;
    }
    if (this.skv) this.skv.update(dt);
    this.skhud.frame(dt, this.you ? this.you.ss : null, this.odin, L.alive && this.modeState && this.modeState.type !== 'br' && this.modeState.type !== 'zm');
    const wv = V && V.k === 'chopper' ? WEAPONS.m134 : w;                       // Attack Chopper: the M134 replaces your gun, centred and lowered like a gunner camera
    const attNow = wv !== w ? '' : this.devAtt && this.devAtt.id === w.id ? this.devAtt.att : (w.att || '');          // DEV MODE hot-swap (visual only) wins over the real loadout
    if (this.vm.id !== wv.id || this.vm.att !== attNow) this.vm.equip(wv.id, attNow);
    // CHAMBERING bar: snipers + shotguns (not the AA-12) show how long until the next shot is possible
    const chamberGun = (w.sniper || w.cat === 'Shotgun') && w.id !== 'aa12';
    if (L.ws.cd > (this.prevCd || 0) + 1e-6 && L.ws.switchT <= 0 && !L.ws.reloading) this.chamberMax = L.ws.cd;      // a shot just set the cooldown
    this.prevCd = L.ws.cd;
    const chambering = chamberGun && !V && L.alive && !L.down && L.ws.cd > 0 && L.ws.switchT <= 0 && !L.ws.reloading && !(L.ws.burstLeft > 0) && this.chamberMax > 0;
    const chamberFrac = chambering ? Math.max(0, Math.min(1, 1 - L.ws.cd / this.chamberMax)) : 0;
    const rt = w.shellReload || w.reload || 1, reloadFrac = L.ws.reloading ? Math.max(0, Math.min(1, 1 - L.ws.reloadT / rt)) : 0;
    this.vm.update(dt, { ads: this.ads.e, speed: L.speed, onGround: L.mv.onGround, sliding: L.mv.slideT > 0, sprinting: L.mv.sprint && L.alive, reloading: L.ws.reloading, reloadFrac, plating: L.ws.plateT > 0, visible: L.alive && !L.down && (!V || V.k === 'chopper'), lookDx: dx, lookDy: dy });
    this.updateLaser(L);
    // remotes + effects
    const rt2 = this.net.renderTime(), nowS = performance.now() / 1000;
    this.remotes.update(rt2, this.net.id, nowS, dt); this.zremotes.update(rt2, null, nowS, dt); this.bremotes.update(rt2, this.net.id, nowS, dt); this.loot.update(dt);
    // hook lines (own + other players), effects
    const hooks = [], eyeP = [this.pos.x, this.pos.y + eyeHeightOf(L.mv) - 0.3, this.pos.z];
    if (L.alive && L.mv.hk) hooks.push([eyeP[0], eyeP[1], eyeP[2], L.mv.hx, L.mv.hy, L.mv.hz]);
    for (const r of this.remotes.list) if (r.data.hk) hooks.push([r.pos.x, r.pos.y + 1.2, r.pos.z, ...r.data.hk]);
    this.fxv.hooks(hooks); this.fxv.update(dt);
    // Poltergeist: enemies get a faint vignette when an invisible enemy is near
    const mt0 = this.modeState && this.modeState.type; let polterNear = 0;
    for (const r of this.remotes.list) if (r.invisible && r.team !== (this.you ? this.you.tm : 0) && mt0 !== 'zm') { const d = Math.hypot(r.pos.x - this.pos.x, r.pos.z - this.pos.z), R = SKILLS.polter.nearRange; if (d < R) polterNear = Math.max(polterNear, Math.min(1, 1.3 * Math.pow(1 - d / R, 0.8))); }
    for (const t of this.tracers) { if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / t.max); } else t.l.material.opacity = 0; }
    // HUD
    const gun = L.ws.guns[L.ws.slot], ms = this.modeState;
    const ppd = innerHeight / this.rig.camera.fov;
    const spreadPx = Math.min(60, spreadFor(w, this.ads.e > 0.5, L.mv.onGround) * ppd * 0.6 + L.speed * 1.1);
    let deadText = '';
    if (!L.alive) {
      if (ms && ms.type === 'br') { const br = this.you && this.you.br; deadText = br && br.cr ? `RESPAWNING IN THE HELICOPTER${L.respawn > 0 ? ' IN ' + Math.ceil(L.respawn) : '…'}${br.rl >= 0 ? ' · ' + br.rl + ' RESPAWN' + (br.rl === 1 ? '' : 'S') + ' LEFT' : ''}` : (this.place ? `YOU PLACED #${this.place} · ` : 'ELIMINATED · ') + 'SPECTATING · WASD fly · SPACE up · C down · SHIFT fast'; }
      else if (ms && ms.type === 'zm') deadText = 'DOWN · YOU RESPAWN WHEN THE NEXT WAVE STARTS · WASD fly · SPACE up · C down';
      else if (ms && ms.type === 'snd') deadText = 'ELIMINATED · SPECTATING · WASD fly · SPACE up · C down · SHIFT fast';
      else if (L.hold) deadText = 'LOADOUT · PRESS DEPLOY (or SPACE) TO RESPAWN';
      else deadText = (L.respawn > 0 ? `RESPAWNING IN ${Math.ceil(L.respawn)}` : 'RESPAWNING…') + '  ·  [E] CHANGE LOADOUT';
    }
    if (ms && ms.type === 'snd') {
      const bs = ms.bomb.state; if (bs !== this.lastBomb) { if (bs === 'exploded') Audio.explosion(); this.lastBomb = bs; }
    }
    this.hud.frame(dt, {
      hp: L.hp, armor: L.armor, plates: L.plates, maxArmor: L.maxArmor, weaponName: w.name.toUpperCase(), mag: gun.mag, magSize: w.magSize, infinite: w.infinite, unarmed: !!w.unarmed, finite: L.ws.finite, reserve: gun.reserve || 0,
      ringRate: this.you && L.alive ? this.you.ringRate : 0, gas: L.gas, polterNear, marked: !!(this.you && this.you.mk && L.alive), em2: !!(this.you && this.you.em2 && L.alive), flash: this.you && L.alive ? this.you.fl : 0, deb: this.you && L.alive ? this.you.deb : 0, spirit: !!(this.you && this.you.dsr && L.alive),
      skill: L.skill ? { name: SKILLS[L.skill].name, cost: SKILLS[L.skill].cost, e: L.energy, a: L.skillActive, ch: L.skillCharge || 0 } : null,
      thr: { name: L.thr && L.thr.id ? THROWABLES[L.thr.id].name : '', n: L.thr ? L.thr.n : 0 },
      chambering, chamberFrac, reloading: L.ws.reloading && L.alive, reloadFrac, plating: L.ws.plateT > 0 && L.alive, plateFrac: 1 - L.ws.plateT / PLAYER.plateTime, spreadPx,
      hideCross: this.ads.e > 0.6 || !L.alive || L.down || !!V, kits: this.you ? this.you.kits | 0 : 0, down: L.down, scoped: w.sniper && this.ads.scoped && L.alive, paused, alive: L.alive, deadText, showBoard: inp.tab,
    });
    if (inp.tab && (this.boardT -= dt) <= 0) { this.boardT = 0.25; this.hud.scoreboard(this.players, this.net.id, !!(this.modeState && this.modeState.type === 'br')); }
    this.modeView.apply(ms, { team: L.team, selfId: this.net.id, pos: this.pos, camera: this.rig.camera, alive: L.alive, air: L.mv.air && !L.mv.heli, heli: L.alive && L.mv.heli, down: L.down, you: this.you });
    const ds = this.you && L.alive ? this.you.dsr : 0;                   // marker above the real body while the spirit is out
    if (ds) { const bp = this.modeView.project(ds.b[0], ds.b[1] + 2.1, ds.b[2], this.rig.camera); this.hud.marker('dsr-body', `<span style="color:#7fb6ff">YOUR BODY</span><small>${ds.hp} HP · ${ds.ar} ARMOR · ${Math.round(Math.hypot(ds.b[0] - this.pos.x, ds.b[2] - this.pos.z))} m</small>`, bp.x, bp.y, bp.vis); }
    else this.hud.marker('dsr-body', '', 0, 0, false);
    if (ms && (ms.type === 'br' || ms.type === 'zm')) this.usePrompt(L);
    
  }
}
