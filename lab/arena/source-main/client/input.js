// Keyboard / mouse / pointer lock. Edge-type actions are queued so that a tap shorter than one 60 Hz tick is never lost.
// Keys: WASD move (auto-sprint) · Space jump · C/Shift crouch (slide when sprinting) · X prone (dive when sprinting) · Q/E lean ·
//       F use (crates, guns, zipline, plant/defuse) · V armor plate · G throwable · T skill · R reload · 1/2 weapon slot · Tab scoreboard
export class Input {
  constructor(canvas) {
    this.canvas = canvas; this.keys = new Set(); this.dx = 0; this.dy = 0; this.locked = false; this.enabled = false;
    this.useQ = false; this.fireHeld = false; this.fireQ = false; this.aimHeld = false; this.reloadQ = false; this.plateQ = false; this.slotQ = -1; this.streakKeys = false; this.streakQ = -1; this.streakFrames = 0;
    this.proneQ = false; this.skillQ = false; this.throwQ = false;
    this.onLockChange = null; this.onKey = null; this.tab = false;
    addEventListener('keydown', (e) => this.kd(e)); addEventListener('keyup', (e) => this.ku(e));
    addEventListener('mousedown', (e) => this.md(e)); addEventListener('mouseup', (e) => this.mu(e));
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } });
    addEventListener('wheel', (e) => { if (this.locked) this.slotQ = e.deltaY > 0 ? 1 : 0; }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; this.aimHeld = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked) { this.fireHeld = false; this.aimHeld = false; } this.onLockChange && this.onLockChange(this.locked); });
  }
  lock() { if (this.enabled && !this.locked) { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  kd(e) {
    if (!this.enabled) return;
    if (e.code === 'Tab') { e.preventDefault(); this.tab = true; }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'KeyR') this.reloadQ = true;
      if (e.code === 'KeyV') this.plateQ = true;
      if (e.code === 'KeyF') this.useQ = true;
      if (e.code === 'KeyX') this.proneQ = true;
      if (e.code === 'KeyT') this.skillQ = true;
      if (e.code === 'KeyG') this.throwQ = true;
      if (this.streakKeys && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) { this.streakQ = +e.code.slice(5) - 1; this.streakFrames = 6; }     // Classic: 1 / 2 / 3 = scorestreaks (held for a few frames: inputs are sent unreliably). Weapons are swapped with the mouse wheel only.
    }
    this.keys.add(e.code);
    this.onKey && this.onKey(e, true);
  }
  ku(e) { this.keys.delete(e.code); if (e.code === 'Tab') this.tab = false; this.onKey && this.onKey(e, false); }
  md(e) { if (!this.enabled) return; if (!this.locked) { this.lock(); return; } if (e.button === 0) { this.fireHeld = true; this.fireQ = true; } if (e.button === 2) this.aimHeld = true; }
  mu(e) { if (e.button === 0) this.fireHeld = false; if (e.button === 2) this.aimHeld = false; }
  take() { const d = [this.dx, this.dy]; this.dx = this.dy = 0; return d; }
  // sample one input frame for the 60 Hz simulation
  sample() {
    const k = this.keys, live = this.locked && this.enabled, use = live && (this.useQ || k.has('KeyF'));
    const s = {
      forward: live && k.has('KeyW'), backward: live && k.has('KeyS'), left: live && k.has('KeyA'), right: live && k.has('KeyD'),
      jump: live && k.has('Space'), crouch: live && (k.has('KeyC') || k.has('ShiftLeft') || k.has('ControlLeft')), prone: live && this.proneQ,
      lean: live ? (k.has('KeyE') && this.leanOnE !== false ? 1 : 0) - (k.has('KeyQ') ? 1 : 0) : 0,
      aim: live && this.aimHeld, use, interact: use,
      fire: live && (this.fireHeld || this.fireQ), reload: live && this.reloadQ, plate: live && (this.plateQ || k.has('KeyV')), slot: live ? this.slotQ : -1, streak: live && this.streakFrames > 0 ? this.streakQ : -1,
      skill: live && (this.skillQ || k.has('KeyT')), throw: live && (this.throwQ || k.has('KeyG')),
    };
    if (this.streakFrames > 0 && --this.streakFrames === 0) this.streakQ = -1;
    this.fireQ = false; this.reloadQ = false; this.plateQ = false; this.useQ = false; this.proneQ = false; this.skillQ = false; this.throwQ = false; this.slotQ = -1;
    return s;
  }
}
