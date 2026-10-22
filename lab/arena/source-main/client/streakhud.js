// HUD pieces for Scorestreaks: the 3 slots (keys 1 / 2 / 3), the small "<name> is ready" text, the radio / phone animation, the EMP glitch,
// the ODIN countdown + white flash, and the Predator / Chopper camera overlay (fuel gauge, missiles, ammo).
import { STREAKS, SPECIAL_THROWS } from '/shared/streaks.js';

const $ = (id) => document.getElementById(id);
export class StreakHud {
  constructor() { this.toastT = 0; this.phoneT = 0; this.empT = 0; this.flashT = 0; this.last = ''; }
  reset() { for (const id of ['streak-toast', 'phone-anim', 'emp-fx', 'white-flash', 'odin-count', 'view-hud']) { const e = $(id); if (e) e.classList.remove('show'); } this.toastT = this.phoneT = this.empT = this.flashT = 0; this.last = ''; }
  toast(text) { const e = $('streak-toast'); e.textContent = text; e.classList.add('show'); this.toastT = 3; }
  phone() { const e = $('phone-anim'); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); this.phoneT = 1.8; }
  emp(time) { this.empT = time; $('emp-fx').classList.add('show'); }
  flash() { const e = $('white-flash'); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); this.flashT = 2.2; }
  // ss = snap.you.ss, odin = snap.odin
  frame(dt, ss, odin, show) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('streak-toast').classList.remove('show');
    if (this.phoneT > 0 && (this.phoneT -= dt) <= 0) $('phone-anim').classList.remove('show');
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) $('white-flash').classList.remove('show');
    if (this.empT > 0 && (this.empT -= dt) <= 0) $('emp-fx').classList.remove('show');
    const od = $('odin-count');                                                  // red flashing "<name> has called ODIN" + a small white mm:ss:cc counter (hidden once the strike has hit)
    if (odin && !odin.hit) { od.classList.add('show'); $('odin-title').textContent = `${odin.name} has called ODIN`; const ms = Math.max(0, Math.round(odin.left * 100)); $('odin-time').textContent = `00:${String(Math.floor(ms / 100)).padStart(2, '0')}:${String(ms % 100).padStart(2, '0')}`; } else od.classList.remove('show');
    const root = $('streak-hud');
    if (!ss || !show) { root.innerHTML = ''; this.last = ''; this.viewHud(null); return; }
    const slots = []; for (let i = 0; i < 3; i++) {
      const id = ss.set[i]; if (!id) continue; const S = STREAKS[id], have = ss.have.includes(id), f = Math.min(1, ss.ls / S.cost);
      slots.push(`<div class="sk ${have ? 'ready' : ''} ${ss.sp === id ? 'armed' : ''}"><span class="sk-key">${i + 1}</span><span class="sk-name">${S.name}</span><span class="sk-bar"><i style="width:${have ? 100 : Math.floor(f * 100)}%"></i></span><span class="sk-st">${have ? (SPECIAL_THROWS.includes(id) ? 'READY' : 'READY') : Math.min(ss.ls, S.cost) + ' / ' + S.cost}</span></div>`);
    }
    const html = slots.join('') + (ss.sp ? `<div class="sk-hint">PRESS [G] TO THROW ${STREAKS[ss.sp].name.toUpperCase()}</div>` : '') + (ss.emp > 0 ? `<div class="sk-hint bad">EMP · SYSTEMS OFFLINE ${Math.ceil(ss.emp)} s</div>` : '');
    if (html !== this.last) { root.innerHTML = html; this.last = html; }
    this.viewHud(ss.view);
  }
  viewHud(v) {
    const e = $('view-hud'); if (!v) { e.classList.remove('show'); return; } e.classList.add('show');
    e.classList.toggle('missile', v.k === 'predator' && v.ph === 'missile'); e.classList.toggle('chopper', v.k === 'chopper');
    $('vh-title').textContent = v.k === 'chopper' ? 'ATTACK CHOPPER · M134' : v.ph === 'missile' ? 'GUIDED MISSILE' : 'UAV PREDATOR';
    $('vh-sub').textContent = v.k === 'chopper' ? `AMMO ${v.ammo}   [LMB] FIRE   [F] LEAVE` : v.ex ? 'LINK CLOSING…' : v.ph === 'missile' ? 'MOUSE: STEER' : `MISSILES ${v.left}   [LMB] LAUNCH`;
    $('vh-fuel').style.width = Math.round(v.fuel * 100) + '%'; $('vh-fuel').classList.toggle('low', v.fuel < 0.2);
  }
}
