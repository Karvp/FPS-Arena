// DEV MODE: live weapon calibration + diagnostics HUD.
//  U/O = Z (back/forward)   J/L = X (left/right)   I/K = Y (up/down)   P = reset current weapon
//  Shift = rotate instead of move   Alt = x5 step   (step 0.001 m / 0.1 deg)   C = copy calibration code
//  While aiming (RMB) the position keys edit the ADS offset instead of the hip position (U/O = closer / further, also with an optic).
//  With an OPTIC equipped the ADS offset is stored per weapon + optic (the gun stays centred on its iron sights, the optic swaps in your values); C copies it for attachcal.js ADS_OPTIC.
//  B = ATTACHMENT mode: cycles the slots this gun accepts (optic > foregrip > laser > muzzle > off); each slot first edits THIS weapon only, then ALL weapons (BASE).
//  ] / [ = HOT-SWAP: next / previous attachment in the selected slot (incl. none) without going back to the menu - visual only, the real loadout/stats are untouched. In this mode J/L I/K U/O move the attachment, Shift+J/L turns it (yaw),
//      N/M = smaller/bigger (steps 0.5 mm / 0.25 deg), P = reset it, C = copy its line for client/attachcal.js (TUNED).
import { getCal, CALIBRATION } from './calibration.js';
import { WEAPONS } from '/shared/weapons.js';
import { settings, saveSettings } from './settings.js';
import { loadStatus } from './assets.js';
import { getAttCal, resetAttCal, attCalCode, baseCal, resetBase, baseCode, getOpticAds, setOpticAds, resetOpticAds, opticAdsCode } from './attachcal.js';
import { parseAtt, attString, slotsFor, ATT, ATT_BY_SLOT, MAX_ATT } from '/shared/attachments.js';

const f = (n) => +n.toFixed(4);
export class DevMode {
  constructor(input, net) {
    this.input = input; this.net = net; this.el = document.getElementById('dev-hud'); this.game = null; this.fps = 0; this.fc = 0; this.ft = performance.now(); this.defaults = {}; this.attMode = null; this.attAll = false;
    input.onKey = (e, down) => {
      if (!down || !this.on || !this.game || e.repeat) return;
      if (e.code === 'KeyC') this.copy(); else if (e.code === 'KeyB') this.cycleAtt(); else if (e.code === 'BracketRight') this.swapAtt(1); else if (e.code === 'BracketLeft') this.swapAtt(-1);
    };
  }
  get on() { return settings.dev; }
  toggle() { settings.dev = !settings.dev; saveSettings(); this.el.classList.toggle('show', settings.dev); return settings.dev; }
  refresh() { this.el.classList.toggle('show', settings.dev); }
  code(id) {
    const c = getCal(id), r = (a) => '[' + a.map(f).join(', ') + ']';
    return `${id}: { position: ${r(c.position)}, rotationDeg: ${r(c.rotationDeg)}, ads: ${r(c.ads)}, scale: ${f(c.scale)}, eyeRelief: ${f(c.eyeRelief)} },`;
  }
  cycleAtt() {
    const sel = parseAtt(this.game.vm.att), steps = [];                                   // targets: for every slot this gun accepts first THIS weapon only, then ALL weapons
    for (const s of slotsFor(this.game.vm.id)) steps.push([s, false], [s, true]);
    const i = steps.findIndex(x => x[0] === this.attMode && x[1] === this.attAll), nx = i + 1 < steps.length ? steps[i + 1] : (i === -1 && steps.length ? steps[0] : null);
    this.attMode = nx ? nx[0] : null; this.attAll = nx ? nx[1] : false;
    toast(nx ? `Slot ${nx[0].toUpperCase()}: ${sel[nx[0]] ? ATT[sel[nx[0]]].name : 'empty ( ] / [ to equip one )'} - ${nx[1] ? 'ALL WEAPONS' : 'this weapon only'}` : 'Editing the weapon');
  }
  // hot-swap the attachment of the selected slot (client-side override on the current gun; Game reads it every frame)
  swapAtt(dir) {
    const g = this.game; if (!this.on || !g || !this.attMode) { toast('Press B first to pick a slot'); return; }
    const id = g.vm.id, cur = parseAtt(g.vm.att), opts = [null, ...ATT_BY_SLOT[this.attMode]], i = opts.indexOf(cur[this.attMode]);
    const nxt = opts[(i + dir + opts.length) % opts.length], before = cur[this.attMode]; cur[this.attMode] = nxt;
    if (nxt && !before && Object.values(cur).filter(Boolean).length > MAX_ATT) { toast('Only ' + MAX_ATT + ' attachments per gun - remove one first ( ] / [ on its slot, to none)'); return; }
    g.devAtt = { id, att: attString(cur) };
    toast(`${this.attMode.toUpperCase()}: ${cur[this.attMode] ? ATT[cur[this.attMode]].name : 'none'}`);
  }
  attTarget() { const id = this.game.vm.id, aid = parseAtt(this.game.vm.att)[this.attMode]; return aid ? (this.attAll ? baseCal(aid) : getAttCal(id, aid)) : null; }          // null = the slot is empty
  attReset() { const id = this.game.vm.id, aid = parseAtt(this.game.vm.att)[this.attMode]; if (aid) { if (this.attAll) resetBase(aid); else resetAttCal(id, aid); }
  }
  copy() {
    const id = this.game.vm.id, c = getCal(id), r = (a) => '[' + a.map(f).join(', ') + ']', coy = getOpticAds(id, 'coyote');
    const txt = [`// ===== ${WEAPONS[id] ? WEAPONS[id].name : id} (${id}) =====`,
      `// Gun name: ${WEAPONS[id] ? WEAPONS[id].name : id}`,
      `// Normal (hip) gun position + rotation + scale -> client/calibration.js TUNED:`, `${id}: { position: ${r(c.position)}, rotationDeg: ${r(c.rotationDeg)}, scale: ${f(c.scale)}, eyeRelief: ${f(c.eyeRelief)}, ads: ${r(c.ads)} },`,
      `// Iron sight ADS gun position (the 'ads' offset above): ${r(c.ads)}`,
      `// Coyote Red Dot ADS position -> client/attachcal.js ADS_OPTIC: ${coy ? '' : '(not edited - automatic estimate in use)'}`, coy ? `${id}: { coyote: ${r(coy)} },` : '',
      `// Attachment positions (this weapon) -> client/attachcal.js TUNED:`, attCalCode(id),
      `// Attachment positions (ALL weapons) -> client/attachcal.js BASE:`, baseCode()].filter(l => l !== '').join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); });
    console.log('[DEV] calibration:\n' + txt); toast('Copied: ' + id);
  }
  update(dt, game) {
    this.game = game; this.fc++; const now = performance.now(); if (now - this.ft > 500) { this.fps = Math.round(this.fc * 1000 / (now - this.ft)); this.fc = 0; this.ft = now; }
    if (!this.on) return;
    const id = game.vm.id, c = getCal(id); if (!id) return;
    if (!this.defaults[id]) this.defaults[id] = JSON.parse(JSON.stringify(c));
    if (this.attMode && !slotsFor(id).includes(this.attMode)) { this.attMode = null; this.attAll = false; }                 // the new gun does not accept that slot
    const k = this.input.keys, shift = k.has('ShiftLeft') || k.has('ShiftRight'), step = (shift ? 0.1 : 0.001) * (k.has('AltLeft') || k.has('AltRight') ? 5 : 1);
    const ax = (k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0), ay = (k.has('KeyI') ? 1 : 0) - (k.has('KeyK') ? 1 : 0), az = (k.has('KeyO') ? 1 : 0) - (k.has('KeyU') ? 1 : 0);
    let changed = false;
    if (this.attMode) {                                                                      // ---- attachment editing (nothing to edit while the slot is empty)
      const ac = this.attTarget() || { pos: [0, 0, 0], yaw: 0, scale: 1 }, as = (shift ? 1 : 1) * (k.has('AltLeft') || k.has('AltRight') ? 5 : 1), st = 0.0005 * as, sc = (k.has('KeyM') ? 1 : 0) - (k.has('KeyN') ? 1 : 0);
      if (k.has('KeyP')) { this.attReset(); changed = true; }                                // (editing the throw-away copy while the slot is empty is harmless)
      else if (ax || ay || az || sc) {
        if (shift) ac.yaw += ax * 0.25 * as; else { ac.pos[0] += ax * st; ac.pos[1] += ay * st; ac.pos[2] -= az * st; }
        if (sc) ac.scale = Math.max(0.2, ac.scale * (1 + sc * 0.002 * as)); changed = true;
      }
      if (changed) game.vm.applyCal();
    } else if (k.has('KeyP')) { if (game.ads.e > 0.5 && game.vm.optic) resetOpticAds(id, game.vm.optic.id); else Object.assign(c, JSON.parse(JSON.stringify(this.defaults[id]))); changed = true; }
    else if (ax || ay || az) {
      const ov = game.vm.optic, adsNow = game.ads.e > 0.5;
      if (shift) { c.rotationDeg[0] += ay * step; c.rotationDeg[1] += ax * step; c.rotationDeg[2] += az * step; }
      else if (adsNow && ov) {                                           // aiming with an optic: edit the optic's own ADS offset (stored per weapon + optic)
        const a = getOpticAds(id, ov.id) || setOpticAds(id, ov.id, (game.vm.opticAdsAuto || [0, 0, 0]).slice());
        a[0] += ax * step; a[1] += ay * step; a[2] -= az * step;          // O = further away, U = closer
      } else { const t = game.ads.e > 0.5 ? c.ads : c.position; t[0] += ax * step; t[1] += ay * step; t[2] += az * step * (game.ads.e > 0.5 ? -1 : 1); }
      changed = true;
    }
    if (changed) game.vm.applyCal();
    const g = game, n = this.net, st = loadStatus.get(id) || {}, cam = g.rig.camera, w = WEAPONS[id], vm = g.vm;
    const roll = cam.rotation.z + g.rig.pitchPivot.rotation.z + g.rig.yawPivot.rotation.z + g.rig.roll;   // roll is only ever non-zero while leaning
    this.el.textContent =
`FPS ${this.fps}   ping ${n.rtt.toFixed(0)}ms   clock-offset ${n.offset.toFixed(3)}s
snap/s ${n.stats.snapsSec}   input/s ${n.stats.inputsSec}   ack ${n.stats.ack}   pending ${g.local.pending.length}
reconcile ${n.stats.recon}   last-err ${g.local.reconErr.toFixed(4)}   server-tick ${g.lastTick}
--- CAMERA  yaw ${g.rig.yaw.toFixed(3)} pitch ${g.rig.pitch.toFixed(3)} roll ${roll.toFixed(6)} fov ${cam.fov.toFixed(1)}
stance ${g.local.mv.stance} sprint ${g.local.mv.sprint ? 1 : 0} lean ${g.local.mv.lean.toFixed(2)} hook ${g.local.mv.hk} | skill ${g.local.skill} energy ${g.local.energy.toFixed(0)} fx ${JSON.stringify(g.local.fxs)}
--- WEAPON ${w.name} [${id}]  slot ${g.local.ws.slot}
model ${st.ok ? 'LOADED' : 'FALLBACK'} ${st.file || ''} ${st.error ? '(' + st.error + ')' : ''}
axes ${JSON.stringify(vm.prep && vm.prep.axes)}
model len ${vm.prep ? (vm.prep.ext.z * vm.prep.scale * c.scale).toFixed(3) : '?'} m
ADS ${g.ads.e.toFixed(2)}  adsPos [${vm.adsPos.map(f)}]  adsFov ${w.adsFov}
hip pos [${c.position.map(f)}]  rot [${c.rotationDeg.map(f)}]  adsOff [${c.ads.map(f)}]${vm.optic ? '  OPTIC adsOff [' + (vm.opticAdsUsed || []).map(f) + ']' + (getOpticAds(id, vm.optic.id) ? '' : ' (auto)') : ''}
ATTACH ${this.attMode ? 'SLOT ' + this.attMode + ': ' + (parseAtt(vm.att)[this.attMode] || 'empty') + ' [' + (this.attAll ? 'ALL WEAPONS' : 'this weapon') + ']' + (this.attTarget() ? ' pos [' + this.attTarget().pos.map(f) + '] yaw ' + f(this.attTarget().yaw) + ' scale ' + f(this.attTarget().scale) : '  ( ] / [ = equip one )') : '(B = pick attachment slot,  ] [ = hot-swap)'}   equipped '${vm.att || '-'}'  optic-aim ${vm.optic ? '[' + vm.optic.aim.toArray().map(f) + ']' : '-'}\nkeys: J/L x  I/K y  U/O z  Shift=rotate  Alt=x5  P=reset  C=copy   (RMB held = edit ADS offset)   B = attachment mode (N/M scale)`;
  }
}
export function toast(msg, ms = 1800) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
void CALIBRATION;
