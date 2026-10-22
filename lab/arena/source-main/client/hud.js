// DOM HUD. Reads state each frame and updates only what changed.
import { PLAYER } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);
const SHIELD = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2 L21 5 V12 C21 17 17 20.5 12 22 C7 20.5 3 17 3 12 V5 Z" fill="none" stroke="#7fb6ff" stroke-width="2"/></svg>';
const SHIELD_BROKEN = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M10.4 2.6 L3 5 V12 C3 16.8 6.4 20.2 10.7 21.8 L12.1 15.6 L9.3 11.8 L11.5 7.4 Z" fill="none" stroke="#ff8a8a" stroke-width="2" stroke-linejoin="round"/><path d="M13.9 3.4 L21 5 V12 C21 16.8 17.9 20 14 21.6 L13.4 16 L11.5 12.2 L13.6 8.8 Z" fill="none" stroke="#ff8a8a" stroke-width="2" stroke-linejoin="round" transform="translate(1.2 0.4)"/></svg>';
// Health + armor gauge. Armor (blue) overlaps the health bar (white). When a value drops, the lost part stays as a "shadow"
// (red for health, light blue for armor), holds briefly, then drains away.
class Gauge {
  constructor(ids) {
    const g = (k) => document.getElementById(ids[k]); this.el = { hp: g('hp'), hs: g('hs'), ar: g('ar'), as: g('as') };
    this.hp = 0; this.hpS = 0; this.ar = 0; this.arS = 0; this.hpMax = 100; this.arMax = 50; this.hold = { h: 0, a: 0 }; this.init = false;
  }
  reset(hp, ar) { this.hp = this.hpS = hp; this.ar = this.arS = ar; this.hold.h = this.hold.a = 0; this.init = true; }
  set(hp, hpMax, ar, arMax) {
    if (!this.init) this.reset(hp, ar);
    if (hp < this.hp) this.hold.h = 0.7; if (ar < this.ar) this.hold.a = 0.7;
    if (hp > this.hpS) this.hpS = hp; if (ar > this.arS) this.arS = ar;                     // heal / plate: the shadow follows immediately
    this.hp = hp; this.ar = ar; this.hpMax = Math.max(1, hpMax); this.arMax = Math.max(1, arMax);
  }
  update(dt) {
    if (this.hpS > this.hp) { if (this.hold.h > 0) this.hold.h -= dt; else this.hpS = Math.max(this.hp, this.hpS - this.hpMax * 0.6 * dt); }
    if (this.arS > this.ar) { if (this.hold.a > 0) this.hold.a -= dt; else this.arS = Math.max(this.ar, this.arS - this.arMax * 0.6 * dt); }
    const w = (v, m) => Math.max(0, Math.min(100, v / m * 100)).toFixed(2) + '%';
    this.el.hp.style.width = w(this.hp, this.hpMax); this.el.hs.style.width = w(this.hpS, this.hpMax);
    this.el.ar.style.width = w(this.ar, this.arMax); this.el.as.style.width = w(this.arS, this.arMax);
  }
}
export class HUD {
  constructor() {
    this.root = $('hud'); this.e = {}; for (const id of ['vignette-red', 'vignette-blue', 'scope', 'score-red', 'score-blue', 'score-target', 'hud-timer', 'marked-warn', 'vignette-gas', 'vignette-polter', 'vignette-flash', 'vignette-spirit', 'em2-warn', 'debuff-wrap', 'debuff-fill', 'debuff-text', 'skill-hud', 'sk-name', 'sk-fill', 'sk-cost', 'sk-state', 'throw-hud', 'th-name', 'th-count', 'hud-top', 'ring-warn', 'hud-objective', 'alive-count', 'killfeed', 'markers', 'crosshair', 'hitmarker', 'banner', 'banner-main', 'banner-sub', 'interact', 'interact-text', 'interact-fill', 'chamber-wrap', 'chamber-fill', 'reload-wrap', 'reload-fill', 'plate-wrap', 'plate-fill', 'respawn-msg', 'hp-fill', 'hp-shadow', 'hp-text', 'armor-fill', 'armor-shadow', 'armor-text', 'enemy-hp', 'eh-hp', 'eh-hp-shadow', 'eh-ar', 'eh-ar-shadow', 'eh-icon', 'dmg-numbers', 'score-feed', 'plate-count', 'ammo-weapon', 'ammo-mag', 'ammo-max', 'ammo-line', 'scoreboard', 'pause-hint', 'vignette-down', 'kit-hud', 'kit-count', 'place-overlay', 'po-main', 'po-sub']) this.e[id] = $(id);
    this.hmT = 0; this.bnT = 0; this.ovT = 0; this.vT = { r: 0, b: 0 }; this.markers = new Map(); this.lastHm = 0;
    this.gauge = new Gauge({ hp: 'hp-fill', hs: 'hp-shadow', ar: 'armor-fill', as: 'armor-shadow' });
    this.enemy = new Gauge({ hp: 'eh-hp', hs: 'eh-hp-shadow', ar: 'eh-ar', as: 'eh-ar-shadow' }); this.enemyT = 0; this.enemyId = null;
    this.hm = this.e['hitmarker'];
  }
  show(v) { this.root.classList.toggle('active', v); }
  set(id, txt) { const el = this.e[id]; if (el.textContent !== String(txt)) el.textContent = txt; }
  frame(dt, s) {
    const e = this.e;
    const mA = s.maxArmor || PLAYER.maxArmor;
    this.set('hp-text', Math.max(0, Math.round(s.hp))); this.set('armor-text', Math.round(s.armor));
    this.gauge.set(Math.max(0, s.hp), PLAYER.maxHealth, s.armor, mA); this.gauge.update(dt);
    // skill energy + throwable + status vignettes
    const k = s.skill, sh = e['skill-hud'];
    if (k) {
      const ready = k.e >= k.cost && !(k.a > 0), act = k.a > 0 || k.ch > 0;
      sh.className = ready ? 'ready' : act ? 'active' : '';
      e['sk-name'].innerHTML = `<b>${esc(k.name)}</b><span>[T] ${k.cost}</span>`; e['sk-fill'].style.width = Math.min(100, k.e) + '%'; e['sk-cost'].style.left = k.cost + '%';
      this.set('sk-state', k.ch > 0 ? 'CHARGING…' : k.a > 0 ? (k.al ? k.al : `ACTIVE ${k.a.toFixed(1)}s`) : ready ? 'READY · PRESS [T]' : `${Math.ceil(k.cost - k.e)} ENERGY TO GO`);
    } else { sh.className = 'none'; e['sk-name'].textContent = 'NO SKILL'; e['sk-fill'].style.width = '0%'; this.set('sk-state', ''); }
    const th = s.thr; e['throw-hud'].style.opacity = th && th.n > 0 ? 1 : 0.4; this.set('th-name', th && th.name ? th.name.toUpperCase() : 'NO THROWABLE'); this.set('th-count', th && th.n > 0 ? '×' + th.n : '');
    const gas = Math.min(0.98, (s.gas || 0) * 2); e['vignette-gas'].style.opacity = gas > 0.005 ? 1 : 0;       // gas: dark green vignette, twice as opaque as before, darker with every bit of gas damage
    this.set('marked-warn', s.marked ? 'You’re Marked' : '');
    if (gas > 0.005) e['vignette-gas'].style.background = `radial-gradient(ellipse at center, rgba(10,60,14,${(gas * 0.6).toFixed(3)}) 0%, rgba(4,34,8,${gas.toFixed(3)}) 100%)`;
    e['vignette-polter'].style.opacity = s.polterNear || 0;
    e['vignette-flash'].style.opacity = s.flash > 0 ? 1 : 0;                       // Flashbang: completely white while the server says so (2 s)
    e['vignette-spirit'].style.opacity = s.spirit ? 1 : 0;                         // Dissociative Surreality: bluish tint while the spirit is out
    this.set('em2-warn', s.em2 ? 'EM2 active' : '');
    const db = s.deb; e['debuff-wrap'].classList.toggle('show', !!db);              // Therapeutic wave debuff: hold F for 3 s to remove it
    if (db) {
      if (db.h) { this.set('debuff-text', `MARKED · -50% SPEED / HANDLING / FIRE RATE · ${Math.ceil(db.t)}s`); e['debuff-fill'].style.width = '0%'; }
      else { this.set('debuff-text', `DEBUFFED · -15% SPEED / HANDLING / FIRE RATE · HOLD [F] TO REMOVE · ${Math.ceil(db.t)}s`); e['debuff-fill'].style.width = (db.c * 100) + '%'; }
    }
    if (this.enemyT > 0) { this.enemyT -= dt; this.enemy.update(dt); e['enemy-hp'].style.opacity = Math.max(0, Math.min(1, this.enemyT / 0.6)); } else e['enemy-hp'].style.opacity = 0;   // visible 3 s after the last hit, then fades
    this.set('plate-count', s.plates);
    this.set('ammo-weapon', s.weaponName); this.set('ammo-mag', s.unarmed ? '—' : s.infinite ? '∞' : s.mag); this.set('ammo-max', s.unarmed ? '—' : s.infinite ? '∞' : (s.finite ? s.reserve : s.magSize));
    e['ammo-line'].classList.toggle('low', !s.unarmed && !s.infinite && s.mag <= s.magSize * 0.25);
    this.set('ring-warn', s.ringRate > 0 ? `OUTSIDE THE RING · -${s.ringRate} HP/s` : '');
    e['reload-wrap'].classList.toggle('show', s.reloading); if (s.reloading) e['reload-fill'].style.width = (s.reloadFrac * 100) + '%';
    e['chamber-wrap'].classList.toggle('show', !!s.chambering); if (s.chambering) e['chamber-fill'].style.width = (s.chamberFrac * 100) + '%';
    e['plate-wrap'].classList.toggle('show', s.plating); if (s.plating) e['plate-fill'].style.width = (s.plateFrac * 100) + '%';
    e['crosshair'].style.setProperty('--sp', s.spreadPx.toFixed(1) + 'px'); e['crosshair'].style.opacity = s.hideCross ? 0 : 1;
    e['scope'].style.opacity = s.scoped ? 1 : 0;
    e['pause-hint'].classList.toggle('show', !!s.paused);
    this.set('respawn-msg', s.alive ? '' : s.deadText);
    e['scoreboard'].classList.toggle('show', !!s.showBoard);
    // fading damage vignettes
    this.vT.r = Math.max(0, this.vT.r - dt); this.vT.b = Math.max(0, this.vT.b - dt);
    e['vignette-red'].style.opacity = Math.min(1, this.vT.r * 1.6); e['vignette-blue'].style.opacity = Math.min(1, this.vT.b * 1.6);
    if (this.ovT > 0 && (this.ovT -= dt) <= 0) this.clearOverlay();
    e['vignette-down'].classList.toggle('on', !!s.down);
    e['kit-hud'].classList.toggle('show', (s.kits | 0) > 0); this.set('kit-count', s.kits > 0 ? '×' + s.kits : '');
    if (this.bnT > 0 && (this.bnT -= dt) <= 0) e['banner'].classList.remove('show');
    if (this.hmT > 0 && (this.hmT -= dt) <= 0) { this.hm.classList.add('fade'); this.hm.classList.remove('show'); }          // 0.5 s visible, then a 0.5 s fade
  }
  damage(hpDmg, armorDmg) { if (hpDmg > 0) this.vT.r = 0.9; if (armorDmg > 0 && hpDmg <= 0) this.vT.b = 0.9; else if (armorDmg > 0) this.vT.b = 0.5; }   // red = health, blue = armor
  // kind: normal | armor | broke | head | headarmor | kill
  hitmarker(kind = 'normal') {
    const m = this.hm; m.className = 'show pop k-' + kind + (kind === 'head' || kind === 'headarmor' || kind === 'kill' ? ' ext' : '');
    const inn = m.firstElementChild; inn.style.animation = 'none'; void inn.offsetWidth; inn.style.animation = '';         // restart the outward pop
    this.hmT = 0.5;
  }
  // called for every server hit event: enemy health bar, hitmarker, floating damage number. Returns the hitmarker kind (for the sound).
  hit(d) {
    const armored = (d.ad || 0) > 0 || (d.ar || 0) > 0 || d.broke;
    const kind = d.kill ? 'kill' : d.head && armored ? 'headarmor' : d.head ? 'head' : d.broke ? 'broke' : (d.ad || 0) > 0 ? 'armor' : 'normal';
    this.hitmarker(kind);
    const prevHp = (d.hp || 0) + (d.hd || 0), prevAr = (d.ar || 0) + (d.ad || 0);
    if (this.enemyId !== d.v || this.enemyT <= 0) this.enemy.reset(prevHp, prevAr);                                 // new victim: start from the pre-hit values
    this.enemyId = d.v; this.enemy.set(d.hp || 0, d.mh || 100, d.ar || 0, d.ma || 1); this.enemyT = 3.6;
    this.e['eh-icon'].innerHTML = d.broke ? SHIELD_BROKEN : ((d.ad || 0) > 0 || (d.ar || 0) > 0) ? SHIELD : '';
    this.e['enemy-hp'].style.opacity = 1;
    this.damageNumber(d.dmg, d.head);
    return kind;
  }
  damageNumber(n, head) {
    const box = this.e['dmg-numbers']; if (!n || box.children.length > 24) return;
    const t = document.createElement('div'), ang = (-20 - Math.random() * 140) * Math.PI / 180, r0 = 34 + Math.random() * 14, r1 = r0 + 46 + Math.random() * 20;
    t.className = 'dn' + (head ? ' head' : ''); t.textContent = Math.round(n);
    t.style.left = Math.cos(ang) * r0 + 'px'; t.style.top = Math.sin(ang) * r0 + 'px'; t.style.setProperty('--dx', (Math.cos(ang) * (r1 - r0)).toFixed(1) + 'px'); t.style.setProperty('--dy', (Math.sin(ang) * (r1 - r0)).toFixed(1) + 'px');
    box.appendChild(t); setTimeout(() => t.remove(), 900);
  }
  // "+100  Enemy killed": pops in together, disappears after 3 s
  score(pts, why) {
    const f = this.e['score-feed']; const d = document.createElement('div'); d.className = 'sc';
    d.innerHTML = `<b>+${pts}</b><span>${esc(why)}</span>`; f.appendChild(d); while (f.children.length > 5) f.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 2700); setTimeout(() => d.remove(), 3000);
  }
  // Full-screen placement / VICTORY text: every other HUD element is hidden while it shows, then the normal HUD comes back
  overlay(main, color = '#fff', ms = 3000, sub = '') {
    const o = this.e['place-overlay']; this.set('po-main', main); this.set('po-sub', sub); this.e['po-main'].style.color = color;
    o.classList.remove('show'); void o.offsetWidth; o.classList.add('show'); this.root.classList.add('ui-off'); this.ovT = ms / 1000;
  }
  clearOverlay() { this.ovT = 0; this.e['place-overlay'].classList.remove('show'); this.root.classList.remove('ui-off'); }
  banner(main, sub = '', ms = 2200) { this.set('banner-main', main); this.set('banner-sub', sub); this.e['banner'].classList.add('show'); this.bnT = ms / 1000; }
  // smaller two-colour banner ("HARDPOINT" yellow + "RELOCATED" white)
  bannerRelocated(ms = 1800) { this.html('banner-main', '<span class="bn-small"><span style="color:#ffd400">HARDPOINT</span> RELOCATED</span>'); this.set('banner-sub', ''); this.e['banner'].classList.add('show'); this.bnT = ms / 1000; }
  killfeed(k, selfId) {
    const d = document.createElement('div'); d.className = 'kf' + (k.k === selfId ? ' me' : '');
    const col = (t) => (['red', 'blue', 'green', 'gold'].includes(t) ? t : 'blue');
    d.innerHTML = `<span class="${col(k.kt)}">${esc(k.kn || '—')}</span><span class="w">${k.dn ? '<span class="hs">DOWNED</span> ' : ''}${esc(k.wn || 'killed')}${k.h ? ' <span class="hs">◎</span>' : ''}</span><span class="${col(k.vt)}">${esc(k.vn)}</span>`;
    const f = this.e['killfeed']; f.appendChild(d); while (f.children.length > 6) f.firstChild.remove(); setTimeout(() => d.remove(), 6000);
  }
  scoreboard(players, selfId, br = false) {
    const NAMES = br ? ['RED', 'BLUE', 'GREEN', 'GOLD'] : ['RED', 'BLUE'], CLS = ['red', 'blue', 'green', 'gold'];
    const rows = (t) => players.filter(p => p.tm === t).sort((x, y) => (y.sc || 0) - (x.sc || 0) || y.k - x.k).map(p => `<tr class="${p.id === selfId ? 'me' : ''}"><td>${esc(p.name)}${p.dn ? ' <span class="hs">DOWNED</span>' : ''}</td><td class="n sc-col">${p.sc || 0}</td><td class="n">${p.k}</td><td class="n">${p.d}</td></tr>`).join('');
    const tbl = (t, name, w) => `<table class="board" style="width:${w}%;display:inline-table;vertical-align:top;margin:0 ${w < 100 ? 1 : 0}% 12px"><tr><th class="${CLS[t]}">${name}</th><th class="sc-col">SCORE</th><th>K</th><th>D</th></tr>${rows(t)}</table>`;
    const tms = [...new Set(players.map(p => p.tm))].sort();
    this.e['scoreboard'].innerHTML = tms.length > 1 ? tms.map(t => tbl(t, NAMES[t] || 'TEAM', 48)).join('') : tms.length ? tbl(tms[0], 'PLAYERS', 100) : '';
  }
  html(id, h) { const el = this.e[id]; if (el._h !== h) { el._h = h; el.innerHTML = h; } }
  interact(text, frac) { const i = this.e['interact']; i.classList.toggle('show', !!text); i.classList.toggle('nobar', frac < 0); if (text) { this.set('interact-text', text); this.e['interact-fill'].style.width = (Math.max(0, frac) * 100) + '%'; } }
  marker(key, html, x, y, visible) {
    let m = this.markers.get(key);
    if (!m) { m = document.createElement('div'); m.className = 'mk'; this.e['markers'].appendChild(m); this.markers.set(key, m); }
    if (m._h !== html) { m.innerHTML = html; m._h = html; }
    m.style.display = visible ? 'block' : 'none'; if (visible) { m.style.left = x + 'px'; m.style.top = y + 'px'; }
  }
  clearMarkers() { for (const m of this.markers.values()) m.remove(); this.markers.clear(); }
}
export function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
