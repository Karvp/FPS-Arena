// Mode presentation: header scores/timer/objective, interaction prompts, world visuals (hardpoint zone, bombsites, bomb) and screen markers.
import * as THREE from 'three';
import { SND, BR_TEAMS, BR_TEAM_NAMES } from '/shared/constants.js';

const TEAM_HEX = { red: 0xff4d4d, blue: 0x4d9dff, green: 0x4cd964, gold: 0xf2c230 }, TEAM_CSS = { red: '#ff4d4d', blue: '#4d9dff', green: '#4cd964', gold: '#f2c230' };

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export class ModeView {
  constructor(scene, hud) {
    this.scene = scene; this.hud = hud; this.vis = new THREE.Group(); scene.add(this.vis); this.key = '';
    this.zone = null; this.sites = []; this.bomb = null; this.ringMesh = null; this.nextMesh = null; this.v = new THREE.Vector3(); this.heliMesh = null; this.incZone = null;
  }
  clear() { while (this.vis.children.length) this.vis.remove(this.vis.children[0]); this.ringMesh = null; this.nextMesh = null; this.heliMesh = null; this.incZone = null; this.zone = null; this.sites = []; this.bomb = null; this.key = ''; this.hud.clearMarkers(); }
  ring(r, col) {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 6, 40, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); cyl.position.y = 3;
    const rim = new THREE.Mesh(new THREE.RingGeometry(r - 0.2, r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.06;
    g.add(cyl, rim); g.userData = { cyl, rim }; return g;
  }
  project(x, y, z, camera) {
    this.v.set(x, y, z).project(camera);
    return { x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight, vis: this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 };
  }
  // "2 vs 2": survivors per team, own team first, each number in its team colour
  aliveHtml(ms, my) {
    const a = ms.alive || { red: 0, blue: 0 }, opp = my === 'red' ? 'blue' : 'red', col = (t) => (t === 'red' ? '#ff4d4d' : '#4d9dff');
    return `<span style="color:${col(my)}">${a[my]}</span><span class="vs">vs</span><span style="color:${col(opp)}">${a[opp]}</span>`;
  }
  // procedural helicopter (hovers over the map until respawning is disabled, then flies away). Front = -z (players face -z), seats inside.
  makeHeli() {
    const g = new THREE.Group(), hull = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.7, transparent: true, opacity: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.8 }),
      glass = new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.2, transparent: true, opacity: 0.4 }), accent = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.6 });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
    box(3, 0.12, 7.6, dark, 0, -0.06, 0.1);                       // cabin floor (the part players stand on)
    box(3, 2.5, 7.4, hull, 0, 1.25, 0.1);                         // cabin
    box(2.6, 1.7, 1.8, glass, 0, 1.2, -4.4);                      // cockpit
    box(1, 0.25, 5.6, accent, 0, 2.62, 0.4);                      // roof stripe
    box(0.7, 0.7, 6, hull, 0, 1.9, 6.6);                          // tail boom
    box(0.12, 1.6, 1.1, dark, 0, 2.5, 9.4);                       // tail fin
    for (const sx of [-1, 1]) { box(0.14, 0.14, 7.6, dark, sx * 1.6, -0.7, 0); for (const sz of [-2, 2]) box(0.1, 0.7, 0.1, dark, sx * 1.55, -0.35, sz); }   // skids
    box(0.3, 0.6, 0.3, dark, 0, 2.8, 0);                           // rotor mast
    const rotor = new THREE.Group(); rotor.position.set(0, 3.15, 0);
    const bm = new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 2; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(13, 0.05, 0.38), bm); bl.rotation.y = i * Math.PI / 2; rotor.add(bl); }
    g.add(rotor); const tail = new THREE.Group(); tail.position.set(0.2, 2.5, 9.4); const tb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.2), bm); tail.add(tb); g.add(tail);
    g.userData = { rotor, tail }; return g;
  }
  heliUpdate(hs) {
    if (!hs) { if (this.heliMesh) this.heliMesh.visible = false; return; }
    if (!this.heliMesh) { this.heliMesh = this.makeHeli(); this.heliMesh.position.set(hs.x, hs.y, hs.z); this.vis.add(this.heliMesh); }
    const m = this.heliMesh, now = performance.now() / 1000; m.visible = true;
    m.position.x += (hs.x - m.position.x) * 0.25; m.position.z += (hs.z - m.position.z) * 0.25;
    m.position.y += (hs.y + (hs.st === 'hover' ? Math.sin(now * 1.3) * 0.08 : 0) - m.position.y) * 0.25;
    m.rotation.z = hs.st === 'leaving' ? -0.12 : 0; m.rotation.x = hs.st === 'leaving' ? 0.08 : 0;      // nose down a little while flying away
    m.userData.rotor.rotation.y = now * 28; m.userData.tail.rotation.x = now * 40;
  }
  battleRoyale(ms, ctx) {
    const h = this.hud, r = ms.ring, you = ctx.you, br = you && you.br, inc = ms.inc, my = ctx.team;
    const ringTxt = r.phase === 'wait' ? `RING MOVES IN ${fmt(r.next)}` : r.phase === 'shrinking' ? 'THE RING IS SHRINKING' : 'THE RING IS CLOSING';
    if (inc) {                                                                   // Incursion: points of every team, own team highlighted
      h.html('alive-count', BR_TEAMS.filter(t => t in inc.scores).map(t => `<span style="color:${TEAM_CSS[t]};${t === my ? 'text-decoration:underline;' : ''}">${inc.scores[t]}</span>`).join('<span class="vs">·</span>'));
      h.set('score-target', `INCURSION · FIRST TO ${inc.target}`); h.set('hud-timer', `${fmt(inc.left)}  ·  ${ringTxt}`);
    } else {
      h.html('alive-count', `<span style="color:#fff">${ms.teamsLeft}</span><span class="vs">teams</span><span style="color:#fff">${ms.alive}</span><span class="vs">alive</span>`);
      const rl = br ? (br.rl > 0 ? `${br.rl} RESPAWN${br.rl > 1 ? 'S' : ''} LEFT` : 'NO RESPAWNS') : '';
      h.set('score-target', `RESURGENCE · ${ms.win > 0 ? `RESPAWN WINDOW ${fmt(ms.win)}${rl ? ' · ' + rl : ''}` : 'RESPAWNS DISABLED'}`);
      h.set('hud-timer', ringTxt);
    }
    const dc = Math.hypot(ctx.pos.x - r.cx, ctx.pos.z - r.cz), inside = dc <= r.r;
    let obj = !ctx.alive ? '' : inside ? 'FIND CRATES · WEAPONS · AMMO · ARMOR' : 'GET INSIDE THE RING!';
    if (inc && ctx.alive && inside) obj = inc.status === 'contested' ? 'HARDPOINT CONTESTED' : inc.status === 'empty' ? 'CAPTURE THE HARDPOINT ON TOP OF THE RIG' : inc.status === my ? 'YOUR TEAM IS SCORING' : 'AN ENEMY TEAM IS SCORING';
    if (ctx.air) obj = 'GLIDE DOWN · WASD STEER · SPACE DIVE · C SLOW · SPAWN PROTECTION: -80% DAMAGE';
    if (ctx.heli) obj = `IN THE HELICOPTER · [SPACE] OR [F] TO JUMP · AUTO-JUMP IN ${Math.ceil(br ? br.hl : 0)}`;
    if (ctx.down) obj = '';
    h.set('hud-objective', obj);
    this.heliUpdate(ms.heli);
    if (inc) {                                                                   // Hardpoint on the highest deck
      const Z = inc.zone;
      if (!this.incZone) { this.incZone = this.ring(Z.r, 0xffffff); this.incZone.position.set(Z.x, Z.y, Z.z); this.vis.add(this.incZone); }
      const col = inc.status === 'contested' ? 0xffd400 : TEAM_HEX[inc.status] || 0xffffff;
      for (const c of [this.incZone.userData.cyl, this.incZone.userData.rim]) c.material.color.setHex(col);
      const pz = this.project(Z.x, Z.y + 3.5, Z.z, ctx.camera);
      h.marker('zone', `<span style="color:#ffd400">◆</span><small>${Math.round(Math.hypot(ctx.pos.x - Z.x, ctx.pos.z - Z.z))} m</small>`, pz.x, pz.y, pz.vis);
    } else if (this.incZone) { this.vis.remove(this.incZone); this.incZone = null; }
    if (!this.ringMesh) {
      this.ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 400, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      this.ringMesh.position.y = 190; this.vis.add(this.ringMesh);
    }
    this.ringMesh.position.x = r.cx; this.ringMesh.position.z = r.cz; this.ringMesh.scale.set(Math.max(0.5, r.r), 1, Math.max(0.5, r.r));
    this.nextZone(r.nxt);
    const d = Math.abs(r.r - dc); h.set('score-red', ''); h.set('score-blue', '');
    h.marker('ring', inside ? `<small style="color:#ff8060">RING EDGE ${Math.round(d)} m</small>` : '', innerWidth / 2, 70, inside && d < 40);
    return null;
  }
  // the circle the ring is about to close into (its randomized centre) as a thin white wall
  nextZone(n) {
    if (!n) { if (this.nextMesh) this.nextMesh.visible = false; return; }
    if (!this.nextMesh) { this.nextMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 400, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })); this.nextMesh.position.y = 190; this.vis.add(this.nextMesh); }
    this.nextMesh.visible = true; this.nextMesh.position.x = n.cx; this.nextMesh.position.z = n.cz; this.nextMesh.scale.set(Math.max(0.5, n.r), 1, Math.max(0.5, n.r));
  }
  zombies(ms, ctx) {
    const h = this.hud; h.html('alive-count', `<span style="color:#6cff9a">${ms.alive}</span><span class="vs">/ ${ms.players} survivors</span>`);
    h.set('score-target', `ZOMBIES · WAVE ${ms.wave}`); h.set('hud-timer', `${ms.left} LEFT`);
    h.set('hud-objective', ms.next ? 'NEXT WAVE INCOMING…' : ms.killed >= ms.need ? '' : `KILL ${ms.need - ms.killed} MORE TO CALL THE NEXT WAVE`);
    return null;
  }
  // ctx: {team, selfId, pos:{x,y,z}, camera, onGround, alive, hasBomb}
  apply(ms, ctx) {
    const h = this.hud; if (!ms) return null;
    const my = ctx.team, opp = my === 'red' ? 'blue' : 'red';
    h.e['hud-top'].classList.toggle('nobox', ms.type === 'br' || ms.type === 'zm' || ms.type === 'range');
    if (ms.type !== 'br' && this.ringMesh) { this.vis.remove(this.ringMesh); this.ringMesh = null; if (this.nextMesh) { this.vis.remove(this.nextMesh); this.nextMesh = null; } }
    if (ms.type === 'br') return this.battleRoyale(ms, ctx);
    if (ms.type === 'zm') return this.zombies(ms, ctx);
    if (ms.type === 'range') {
      h.html('alive-count', ''); h.set('score-red', ''); h.set('score-blue', ''); h.set('score-target', 'SHOOTING RANGE · PVP DISABLED'); h.set('hud-timer', '');
      h.set('hud-objective', 'PRESS [E] TO CHANGE LOADOUT · TARGETS AT 10 / 20 / 30 / 40 m · DEV MODE [C] COPIES CALIBRATION'); return null;
    }
    h.html('alive-count', ms.type === 'snd' ? this.aliveHtml(ms, my) : '');
    if (ms.type === 'tdm') {
      h.set('score-red', ms.scores.red); h.set('score-blue', ms.scores.blue); h.set('score-target', `TEAM DEATHMATCH · FIRST TO ${ms.target}`); h.set('hud-timer', ''); h.set('hud-objective', '');
      return null;
    }
    if (ms.type === 'hp') {
      h.set('score-red', ms.scores.red); h.set('score-blue', ms.scores.blue); h.set('score-target', `HARDPOINT · FIRST TO ${ms.target}`); h.set('hud-timer', fmt(ms.zone.left));
      const st = ms.status; h.set('hud-objective', st === 'contested' ? 'ZONE CONTESTED' : st === 'empty' ? 'CAPTURE THE HARDPOINT' : st === my ? 'YOU ARE SCORING' : 'ENEMY IS SCORING');
      if (!this.zone || this.key !== ms.zone.id) { this.vis.clear(); this.zone = this.ring(ms.zone.r, 0xffffff); this.zone.position.set(ms.zone.x, 0, ms.zone.z); this.vis.add(this.zone); this.key = ms.zone.id; }
      const col = st === 'red' ? 0xff4d4d : st === 'blue' ? 0x4d9dff : st === 'contested' ? 0xffd400 : 0xffffff;
      for (const c of [this.zone.userData.cyl, this.zone.userData.rim]) c.material.color.setHex(col);
      const p = this.project(ms.zone.x, 3.5, ms.zone.z, ctx.camera);
      h.marker('zone', '<span style="color:#ffd400;font-size:22px">◆</span>', p.x, p.y, p.vis);
      return null;
    }
    // ---------------- search & destroy ----------------
    h.set('score-red', ms.wins.red); h.set('score-blue', ms.wins.blue);
    h.set('score-target', `SEARCH & DESTROY · ROUND ${ms.round} · FIRST TO ${ms.target} · ${my === ms.attackers ? 'ATTACKING' : 'DEFENDING'}`);
    h.set('hud-timer', ms.phase === 'freeze' ? `FREEZE ${Math.ceil(ms.timer)}` : ms.phase === 'result' ? '' : fmt(ms.timer));
    const key = ms.sites.map(s => s.id + s.x + s.z).join('|') + ms.round;
    if (this.key !== key) {
      this.vis.clear(); this.key = key; this.sites = [];
      for (const s of ms.sites) { const r = this.ring(SND.siteRadius, 0xffd400); r.position.set(s.x, 0, s.z); this.vis.add(r); this.sites.push({ s, r }); }
      const bm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2020, emissiveIntensity: 0.6 })); bm.visible = false; this.vis.add(bm); this.bomb = bm;
    }
    const b = ms.bomb, planted = b.state === 'planted';
    for (const { s, r } of this.sites) {
      const col = planted && b.site === s.id ? 0xff2020 : 0xffd400; for (const c of [r.userData.cyl, r.userData.rim]) c.material.color.setHex(col);
      const p = this.project(s.x, 4, s.z, ctx.camera); const dist = Math.round(Math.hypot(ctx.pos.x - s.x, ctx.pos.z - s.z));
      h.marker('site' + s.id, `<span style="color:${planted && b.site === s.id ? '#ff4040' : '#ffd400'};font-size:30px">${s.id}</span><small>${dist} m</small>`, p.x, p.y, p.vis);
    }
    if (this.bomb) {
      const show = b.state === 'dropped' || planted; this.bomb.visible = show;
      if (show) { this.bomb.position.set(b.x, (b.y || 0) + 0.15, b.z); this.bomb.material.emissiveIntensity = planted ? 0.4 + 0.6 * (Math.sin(performance.now() / (60 + ms.timer * 8)) > 0 ? 1 : 0) : 0.5; }
      const p = this.project(b.x, (b.y || 0) + 1, b.z, ctx.camera);
      h.marker('bomb', show ? '<span style="font-size:22px">💣</span>' : '', p.x, p.y, show && p.vis);
    }
    let obj = '';
    if (ms.phase === 'active') obj = my === ms.attackers ? (b.state === 'carried' && b.pid === ctx.selfId ? 'YOU HAVE THE BOMB · PLANT AT A OR B' : b.state === 'dropped' ? 'RECOVER THE BOMB' : 'PROTECT THE BOMB CARRIER') : 'DEFEND THE BOMBSITES';
    else if (ms.phase === 'planted') obj = my === ms.attackers ? 'DEFEND THE BOMB' : 'DEFUSE THE BOMB';
    else if (ms.phase === 'result' && ms.result) obj = `${ms.result.winner.toUpperCase()} WINS · ${ms.result.reason}`;
    h.set('hud-objective', obj);
    // interaction prompt
    let text = '', frac = 0;
    if (ctx.alive && ms.phase === 'active' && my === ms.attackers && b.state === 'carried' && b.pid === ctx.selfId) {
      const near = ms.sites.find(s => Math.hypot(ctx.pos.x - s.x, ctx.pos.z - s.z) <= SND.siteRadius);
      if (near) { text = `HOLD [F] TO PLANT AT ${near.id}`; frac = ms.plantPid === ctx.selfId ? ms.plant : 0; }
    }
    if (ctx.alive && ms.phase === 'planted' && my !== ms.attackers && Math.hypot(ctx.pos.x - b.x, ctx.pos.z - b.z) <= SND.defuseRange + 0.3) { text = 'HOLD [F] TO DEFUSE'; frac = ms.defusePid === ctx.selfId ? ms.defuse : 0; }
    h.interact(text, frac);
    return null;
  }
}
