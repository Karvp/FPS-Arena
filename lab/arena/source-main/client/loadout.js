// Loadout screen: weapon list + rigid rotating 3D preview with its own renderer / scene / camera (never touches the gameplay camera).
// Hierarchy:  previewPivot (spins around Y) -> orientationWrapper (auto orientation R) -> centeredWrapper (moves bbox centre to origin) -> clonedGLB
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from '/shared/weapons.js';
import { prepared } from './assets.js';
import { instantiate, buildProcedural } from './weaponmodel.js';
import { settings, saveSettings } from './settings.js';
import { SKILLS, SKILL_LIST, THROWABLES, THROW_LIST, THROW_START } from '/shared/skills.js';
import { onLoaded } from './assets.js';
import { ATT, SLOT_NAME, MAX_ATT, slotsFor, gunStats, parseAtt, attList } from '/shared/attachments.js';
import { buildAttachments, ensureAtt, onAttLoaded, loadAttachment, getAttModel } from './attachments.js';
import { attOf, attIds, setAttIds } from './settings.js';
import { STREAKS, STREAK_LIST, STREAK_SLOTS } from '/shared/streaks.js';

const $ = (id) => document.getElementById(id);
export class Loadout {
  constructor(onPick) {
    this.onPick = onPick; this.canvas = $('preview-canvas'); this.raf = 0; this.running = false;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50); this.camera.position.set(0, 0.55, 4.3); this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 4, 5); this.scene.add(d);
    const rim = new THREE.DirectionalLight(0xffd400, 1.0); rim.position.set(-4, 2, -3); this.scene.add(rim);
    this.pivot = new THREE.Group(); this.pivot.name = 'previewPivot'; this.orientation = new THREE.Group(); this.orientation.name = 'orientationWrapper';
    this.centered = new THREE.Group(); this.centered.name = 'centeredWrapper'; this.pivot.add(this.orientation); this.orientation.add(this.centered); this.scene.add(this.pivot);
    this.attPrev = new THREE.Group(); this.attPrev.name = 'previewAttachments'; this.pivot.add(this.attPrev);       // attachments (metres, weapon frame) -> scaled to the preview's raw units in show()
    this.list = $('wl-weapons'); this.buttons = new Map(); this.tab = 'weapons'; this.sbtn = new Map(); this.tbtn = new Map();
    for (const [cat, ids] of WEAPON_ORDER) {
      const h = document.createElement('div'); h.className = 'wl-cat'; h.textContent = cat.toUpperCase(); this.list.appendChild(h);
      for (const id of ids) {
        const b = document.createElement('button'); b.className = 'wl-item'; b.textContent = WEAPONS[id].name.toUpperCase(); b.dataset.id = id;
        b.addEventListener('click', () => { this.pick(id); b.blur(); }); b.addEventListener('mouseenter', () => this.show(id)); b.addEventListener('mouseleave', () => this.show(this.sel || settings.primary));
        this.list.appendChild(b); this.buttons.set(id, b);
      }
    }
    for (const id of SKILL_LIST) {                                 // skills (T)
      const s = SKILLS[id], b = document.createElement('button'); b.className = 'wl-item'; b.innerHTML = `${s.name.toUpperCase()}<span class="cost">${s.cost} EN</span><small>${s.desc.split('.')[0]}.</small>`;
      b.addEventListener('click', () => { settings.skill = id; saveSettings(); this.showSkill(id); this.onPick(id); b.blur(); }); b.addEventListener('mouseenter', () => this.showSkill(id)); b.addEventListener('mouseleave', () => this.showSkill(settings.skill || id));
      $('skill-list').appendChild(b); this.sbtn.set(id, b);
    }
    for (const id of THROW_LIST) {                                 // throwables (G)
      const t = THROWABLES[id], b = document.createElement('button'); b.className = 'wl-item'; b.innerHTML = `${t.name.toUpperCase()}<small>${t.desc.split('.')[0]}.</small>`;
      b.addEventListener('click', () => { settings.throwable = id; saveSettings(); this.showThrow(id); this.onPick(id); b.blur(); }); b.addEventListener('mouseenter', () => this.showThrow(id)); b.addEventListener('mouseleave', () => this.showThrow(settings.throwable));
      $('throw-list').appendChild(b); this.tbtn.set(id, b);
    }
    this.kbtn = new Map();
    for (const id of STREAK_LIST) {                                // scorestreaks: click to add / remove (up to 3, bound to keys 1 / 2 / 3 in the order picked)
      const S = STREAKS[id], b = document.createElement('button'); b.className = 'wl-item'; b.innerHTML = `<span class="slot"></span>${S.name.toUpperCase()}<small>${S.cost} score</small>`;
      b.addEventListener('click', () => { this.toggleStreak(id); b.blur(); }); b.addEventListener('mouseenter', () => this.showStreak(id)); b.addEventListener('mouseleave', () => this.showStreak(id));
      $('streak-list').appendChild(b); this.kbtn.set(id, b);
    }
    for (const [k, id] of [['weapons', 'tab-weapons'], ['skills', 'tab-skills'], ['throw', 'tab-throw'], ['streaks', 'tab-streaks']]) $(id).addEventListener('click', () => this.setTab(k));
    this.show(settings.primary);
    onLoaded((wid) => { if (this.current === wid) this.show(wid); });
    onAttLoaded(() => { if (this.current && this.tab === 'weapons') this.show(this.current); });
  }
  // weaponsAllowed=false (Battle Royale / Zombies rooms): only skills + throwables can be chosen
  setTab(t) {
    this.tab = t; $('wl-weapons').style.display = t === 'weapons' ? '' : 'none'; $('skill-list').classList.toggle('show', t === 'skills'); $('throw-list').classList.toggle('show', t === 'throw'); $('streak-list').classList.toggle('show', t === 'streaks');
    for (const [k, id] of [['weapons', 'tab-weapons'], ['skills', 'tab-skills'], ['throw', 'tab-throw'], ['streaks', 'tab-streaks']]) $(id).classList.toggle('sel', k === t);
    if (t === 'weapons') this.show(this.sel || settings.primary); else if (t === 'skills') this.showSkill(settings.skill || SKILL_LIST[0]); else if (t === 'streaks') this.showStreak((settings.streaks || [])[0] || STREAK_LIST[0]); else this.showThrow(settings.throwable);
  }
  setWeaponsAllowed(ok) { $('tab-weapons').hidden = !ok; $('tab-streaks').hidden = !ok; if (!ok && this.tab === 'streaks') this.setTab('skills'); if (!ok && this.tab === 'weapons') this.setTab('skills'); else if (ok) this.setTab(this.tab); }
  toggleStreak(id) {
    const l = (settings.streaks || []).slice(), i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else if (l.length < STREAK_SLOTS) l.push(id); else l[STREAK_SLOTS - 1] = id;      // full: the last slot is replaced
    settings.streaks = l; saveSettings(); this.showStreak(id); this.onPick(id);
  }
  showStreak(id) {
    const S = STREAKS[id], l = settings.streaks || [];
    for (const [k, b] of this.kbtn) { const i = l.indexOf(k); b.classList.toggle('sel', i >= 0); b.querySelector('.slot').textContent = i >= 0 ? `KEY ${i + 1}` : ''; }
    this.info(S.name, 'SCORESTREAK · CLASSIC · ' + (S.keyHint || 'KEYS [1] [2] [3]'), S.desc, [['Score needed', S.cost], ['Hit points', S.hp ? S.hp : 'cannot be shot down'], ['Equipped', l.includes(id) ? 'KEY ' + (l.indexOf(id) + 1) : 'click to equip (max 3)']]);
  }
  info(name, cat, desc, rows) { this.centered.clear(); $('pv-name').textContent = name.toUpperCase(); $('pv-cat').textContent = cat; $('pv-desc').textContent = desc; $('pv-stats').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join(''); }
  showSkill(id) {
    const s = SKILLS[id]; for (const [k, b] of this.sbtn) b.classList.toggle('sel', k === settings.skill);
    this.info(s.name, 'SKILL · KEY [T]', s.desc, [['Energy cost', s.cost], ['Duration', s.duration ? s.duration + ' s' : 'instant'], ['Energy gain', '+1 / s, +10 / kill'], ['Selected', settings.skill === id ? 'YES' : 'click to select']]);
  }
  showThrow(id) {
    const t = THROWABLES[id]; for (const [k, b] of this.tbtn) b.classList.toggle('sel', k === settings.throwable);
    this.info(t.name, 'THROWABLE · KEY [G]', t.desc, [['Start with (Classic)', THROW_START], ['Found in crates', 'Battle Royale / Zombies'], ['Selected', settings.throwable === id ? 'YES' : 'click to select']]);
  }
  // a pistol sets the SIDEARM (secondary slot); anything else sets the PRIMARY
  pick(id) { this.sel = id; if (WEAPONS[id].cat === 'Pistol') settings.secondary = id; else settings.primary = id; saveSettings(); this.show(id); this.onPick(id); }
  show(id) {
    const base = WEAPONS[id], att = attOf(id), w = gunStats(id, att); this.current = id;
    for (const [k, b] of this.buttons) { const on = k === settings.primary || k === settings.secondary; b.classList.toggle('sel', on); b.dataset.tag = on ? (k === settings.secondary ? 'SIDEARM' : 'PRIMARY') : ''; }
    const prep = prepared.get(id) || buildProcedural(id);
    this.centered.clear(); this.centered.add(instantiate(prep));
    this.centered.position.copy(prep.center).negate(); this.orientation.quaternion.copy(prep.R);
    const size = Math.max(prep.ext.z, prep.ext.y * 1.6, 1e-3); this.pivot.scale.setScalar(2.5 / size); this.pivot.rotation.set(0, Math.PI * 0.25, 0);
    this.attPrev.clear(); if (att && prep.anchors) { ensureAtt(att); const r = buildAttachments(prep, att, id, false); r.group.scale.setScalar(1 / prep.scale); this.attPrev.add(r.group); }
    $('pv-name').textContent = base.name.toUpperCase(); $('pv-cat').textContent = base.cat.toUpperCase(); $('pv-desc').textContent = base.desc;
    const row = (a, b, hot) => `<div><span>${a}</span><b${hot ? ' style="color:#ffd400"' : ''}>${b}</b></div>`, ch = (k) => Math.abs((w[k] || 0) - (base[k] || 0)) > 1e-6;
    if (base.melee) { $('pv-cat').textContent = 'MELEE SIDEARM'; $('pv-stats').innerHTML = row('Damage', base.dmg[0]) + row('Swing interval', Math.round(base.interval * 1000) + ' ms') + row('Reach', base.reach + ' m') + row('Ammo', 'none') + row('Mobility', Math.round(base.move * 100) + '%'); this.renderAtt(id); return; }
    $('pv-stats').innerHTML = row('Damage', w.pellets > 1 ? `${w.dmg[0]} x${w.pellets}` : `${w.dmg[0]} → ${w.dmg[1]}`) + row('Fire rate', w.rpm + ' rpm') + row('Magazine', w.infinite ? '∞' : w.magSize) +
      row('Reload', w.infinite ? '—' : w.shellReload ? `${w.shellReload}s / shell` : w.reload + 's') + row('Mobility', Math.round(w.move * 100) + '%') + row('ADS time', w.adsTime.toFixed(2) + 's', ch('adsTime')) +
      row('Fire mode', w.unarmed ? '—' : w.burst ? `${w.burst}-ROUND BURST` : w.auto ? 'AUTO' : 'SEMI') + row('Range', `${Math.round(w.range[0])}–${Math.round(w.range[1])} m`, w.range[0] !== base.range[0]) + row('Head mult', w.headMul >= 100 ? 'INSTANT KILL' : 'x' + w.headMul) +
      row('Recoil', `${w.recoilV.toFixed(2)} / ${w.recoilH.toFixed(2)}`, ch('recoilV') || ch('recoilH')) + row('Hip spread', w.spreadHip.toFixed(2) + '°', ch('spreadHip')) + row('ADS spread', w.spreadAds.toFixed(2) + '°', ch('spreadAds'));
    this.renderAtt(id);
  }
  // WEAPON MODIFICATION: two accessory squares under the stats. Empty = plus sign, filled = spinning model of the attachment. Click a square to pick (or remove) its attachment.
  renderAtt(id) {
    const box = $('pv-att'), ok = slotsFor(id).length > 0; box.innerHTML = ''; this.icons = [];
    const title = document.createElement('div'); title.className = 'att-title'; title.textContent = 'ATTACHMENTS (' + MAX_ATT + ')'; box.appendChild(title);
    if (!ok) { const n = document.createElement('div'); n.className = 'att-none'; n.textContent = 'This weapon cannot be modified.'; box.appendChild(n); return; }
    const ids = attIds(id), squares = document.createElement('div'); squares.className = 'att-squares'; box.appendChild(squares);
    const desc = document.createElement('div'); desc.className = 'att-desc'; const picker = document.createElement('div'); picker.className = 'att-picker';
    for (let i = 0; i < MAX_ATT; i++) {
      const aid = ids[i], sq = document.createElement('button'); sq.className = 'att-sq' + (aid ? ' full' : ''); sq.title = aid ? ATT[aid].name : 'Add an attachment';
      if (aid) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 112; sq.appendChild(cv); const nm = document.createElement('i'); nm.textContent = ATT[aid].name.toUpperCase(); sq.appendChild(nm);
        this.icons.push({ id: aid, cv, ctx: cv.getContext('2d') }); loadAttachment(aid);
        sq.addEventListener('mouseenter', () => { desc.textContent = ATT[aid].desc; });
      } else { sq.textContent = '+'; sq.addEventListener('mouseenter', () => { desc.textContent = 'Click to choose an attachment.'; }); }
      sq.addEventListener('click', () => { this.openPicker(id, i, picker, desc); sq.blur(); });
      squares.appendChild(sq);
    }
    box.appendChild(picker); box.appendChild(desc);
  }
  // picker for square #index: every attachment this gun accepts, except the mounts already taken by the other square; "REMOVE" empties the square
  openPicker(id, index, picker, desc) {
    const ids = attIds(id), cur = ids[index], other = ids.filter((_, k) => k !== index), taken = new Set(other.map(x => ATT[x].slot)); picker.innerHTML = '';
    const set = (aid) => { const n = other.slice(); if (aid) n.splice(index, 0, aid); setAttIds(id, n.slice(0, MAX_ATT)); this.show(id); this.onPick(id); };
    const opts = Object.values(ATT).filter(a => slotsFor(id).includes(a.slot) && !taken.has(a.slot));
    for (const a of opts) {
      const b = document.createElement('button'); b.textContent = a.name.toUpperCase() + ' · ' + SLOT_NAME[a.slot].toUpperCase(); b.classList.toggle('sel', a.id === cur);
      b.addEventListener('mouseenter', () => { desc.textContent = a.desc; }); b.addEventListener('click', () => set(a.id)); picker.appendChild(b);
    }
    if (cur) { const r = document.createElement('button'); r.textContent = 'REMOVE'; r.className = 'rm'; r.addEventListener('click', () => set(null)); picker.appendChild(r); }
    const x = document.createElement('button'); x.textContent = 'CLOSE'; x.addEventListener('click', () => { picker.innerHTML = ''; }); picker.appendChild(x);
  }
  // spinning attachment icons (one small shared renderer, copied into each square's canvas)
  drawIcons() {
    if (!this.icons || !this.icons.length) return;
    if (!this.ir) {
      this.ir = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); this.ir.setSize(112, 112, false);
      this.is = new THREE.Scene(); this.ic = new THREE.PerspectiveCamera(30, 1, 0.01, 10); this.ic.position.set(0, 0.05, 0.55); this.ic.lookAt(0, 0, 0);
      this.is.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1, 2, 3); this.is.add(d); this.ig = new THREE.Group(); this.is.add(this.ig);
    }
    for (const ic of this.icons) {
      const m = getAttModel(ic.id); if (!m) continue;
      this.ig.clear(); const wrap = new THREE.Group(); wrap.add(m); const box = new THREE.Box3().setFromObject(wrap), c = box.getCenter(new THREE.Vector3()), sz = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1e-3);
      m.position.sub(c); wrap.scale.setScalar(0.22 / sz); wrap.rotation.set(0.35, this.spin, 0); this.ig.add(wrap);
      this.ir.render(this.is, this.ic); ic.ctx.clearRect(0, 0, 112, 112); ic.ctx.drawImage(this.ir.domElement, 0, 0, 112, 112);
    }
  }
  loop = () => {
    if (!this.running) return;
    const c = this.canvas, w = c.clientWidth, h = c.clientHeight;
    if (w && h && (c.width !== Math.floor(w * this.renderer.getPixelRatio()) || c.height !== Math.floor(h * this.renderer.getPixelRatio()))) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.pivot.rotation.y += 0.012;                                 // rigid rotation of the pivot only
    this.spin = (this.spin || 0) + 0.03; this.drawIcons();
    this.renderer.render(this.scene, this.camera); this.raf = requestAnimationFrame(this.loop);
  };
  open() { this.setTab(this.tab); if (!this.running) { this.running = true; this.raf = requestAnimationFrame(this.loop); } }
  close() { this.running = false; cancelAnimationFrame(this.raf); }
}
