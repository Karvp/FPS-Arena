// LocalPlayer: client-side prediction with server reconciliation.
//  * every fixed 60 Hz tick: sample input -> simulate locally with the SHARED movement/weapon code -> send input (keeps history by seq)
//  * on snapshot: take server state at `ack`, replay all not-yet-acked inputs, compare with the predicted state.
//    Small errors are blended out with a decaying render offset, large ones snap.
import { DT, MOVE, PLATE_AMOUNT, ENERGY } from '/shared/constants.js';
import { newMoveState, stepMove, copyMove, eyeHeightOf } from '/shared/movement.js';
import { makeWeaponState, stepWeapons, curGun, curWeapon, aimLocked } from '/shared/weaponstate.js';
import { moveMul, DEFAULT_PRIMARY, secondaryFor } from '/shared/weapons.js';
import { SKILLS, fxOf, canAim, isMoveSkill } from '/shared/skills.js';

export class LocalPlayer {
  constructor() {
    this.mv = newMoveState(); this.prev = newMoveState(); this.corr = { x: 0, y: 0, z: 0 };
    this.ws = makeWeaponState(DEFAULT_PRIMARY, secondaryFor(DEFAULT_PRIMARY));
    this.seq = 0; this.ep = 0; this.pending = []; this.map = { boxes: [] }; this.maxArmor = 50;
    this.alive = false; this.hp = 100; this.armor = 50; this.plates = 1; this.frozen = false; this.down = false; this.inView = false; this.hold = false; this.team = 'red'; this.respawn = 0;
    this.reconErr = 0; this.reconCount = 0;
    this.fxs = { exo: false, charge: false, stim: false, cryo: false, annih: false, lift: false };    // active effects (from the server) used for prediction
    this.skill = null; this.energy = 0; this.skillActive = 0; this.thr = { id: null, n: 0 }; this.marks = []; this.gas = 0;
  }
  setMap(map) { this.map = map; }
  tick(inp, yaw, pitch, lt) {
    if (aimLocked(this.ws)) { yaw = this.ws.lock[0]; pitch = this.ws.lock[1]; }      // EM2 wind-up: aim locked (same rule as the server)
    const i = { seq: ++this.seq, ep: this.ep, ...inp, yaw, pitch, lt };
    i.aim = i.aim && canAim(this.mv, this.fxs);                    // no ADS on a zipline / hook / in the air / launched (same rule as the server)
    copyMove(this.prev, this.mv);
    // movement skills (hook / leap): the client predicts the activation when it believes it has enough energy
    const sk = SKILLS[this.skill], mvSkill = isMoveSkill(this.skill);
    const act = !!(mvSkill && i.skill && !this.mv.skillPrev && this.alive && !this.down && this.energy >= sk.cost && !this.fxs.charge && !this.frozen && !this.mv.air && !this.mv.zl && !this.mv.gs);
    const fx = fxOf(this.fxs, mvSkill ? this.skill : null, act);
    const gid = curGun(this.ws).id, mul = moveMul(gid, i.aim, this.ws.plateT > 0);
    if (this.alive) stepMove(this.mv, i, DT, mul, this.map, this.frozen, fx);
    if (act && this.mv.skEv) this.energy -= sk.cost;
    this.energy = Math.min(ENERGY.max, this.energy + DT * ENERGY.regen);
    const r = stepWeapons(this.ws, i, DT, { alive: this.alive && !this.down && !this.inView, frozen: this.frozen || this.mv.air || fx.lock, armor: this.armor, plates: this.plates, maxArmor: this.maxArmor, anim: fx.anim, rate: fx.rate });
    if (r.plateDone) { this.armor = Math.min(this.maxArmor, this.armor + PLATE_AMOUNT); this.plates = Math.max(0, this.plates - 1); }
    this.pending.push({ inp: i, mul, frozen: this.frozen, fx, act: r.fired || r.reloadStarted || r.plateStarted || r.switched || r.reloadDone || r.plateDone || r.windStarted || this.ws.wind > 0 });
    if (this.pending.length > 240) this.pending.shift();
    return { inp: i, r };
  }
  reconcile(snap) {
    const y = snap.you;
    if (snap.ep !== this.ep) {                      // respawned / new round: authoritative reset
      this.ep = snap.ep; this.pending = []; copyMove(this.mv, y); copyMove(this.prev, y); this.corr.x = this.corr.y = this.corr.z = 0;
      this.ws = JSON.parse(JSON.stringify(y.ws));
    } else {
      while (this.pending.length && this.pending[0].inp.seq <= snap.ack) this.pending.shift();
      const s = copyMove({}, y);
      if (y.alive) for (const e of this.pending) stepMove(s, e.inp, DT, e.mul, this.map, e.frozen, e.fx);
      const dx = s.x - this.mv.x, dy = s.y - this.mv.y, dz = s.z - this.mv.z, err = Math.hypot(dx, dy, dz);
      this.reconErr = err;
      if (err > 0.003) {
        this.reconCount++;
        if (err > 2.5) { this.corr.x = this.corr.y = this.corr.z = 0; copyMove(this.prev, s); }
        else { this.corr.x -= dx; this.corr.y -= dy; this.corr.z -= dz; }   // render offset hides the correction
        copyMove(this.mv, s);
      } else { this.mv.stance = s.stance; this.mv.sprint = s.sprint; this.mv.lean = s.lean; }
      if (!this.pending.some(e => e.act) || y.ws.rev !== this.ws.rev) this.ws = JSON.parse(JSON.stringify(y.ws));   // nothing in flight (or loot/skill changed it): hard-sync
    }
    this.alive = y.alive; this.hp = y.hp; this.armor = y.armor; this.plates = y.plates; this.frozen = y.fz; this.down = !!y.dn; this.maxArmor = y.maxArmor || 50; this.hold = !!y.hold; this.team = y.team; this.respawn = y.respawn;
    this.fxs = y.fxs || this.fxs; this.skill = y.sk ? y.sk.id : null; this.energy = y.sk ? y.sk.e : 0; this.skillActive = y.sk ? y.sk.a : 0; this.skillCharge = y.sk ? y.sk.ch : 0;
    this.thr = y.thr || this.thr; this.marks = y.marks || []; this.gas = y.gas || 0;
  }
  decay(dt) { const k = Math.exp(-dt * 10); this.corr.x *= k; this.corr.y *= k; this.corr.z *= k; }
  // interpolated render position between the last two fixed ticks
  renderPos(alpha, out) {
    out.x = this.prev.x + (this.mv.x - this.prev.x) * alpha + this.corr.x;
    out.y = this.prev.y + (this.mv.y - this.prev.y) * alpha + this.corr.y;
    out.z = this.prev.z + (this.mv.z - this.prev.z) * alpha + this.corr.z;
    return out;
  }
  eye() { return eyeHeightOf(this.mv); }
  get weapon() { return curWeapon(this.ws); }
  get speed() { return Math.hypot(this.mv.vx, this.mv.vz); }
}
void MOVE;
