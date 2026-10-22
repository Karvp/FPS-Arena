import { newMoveState } from '../shared/movement.js';
import { makeWeaponState } from '../shared/weaponstate.js';
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, secondaryFor, isPistol, WEAPONS } from '../shared/weapons.js';
import { PLAYER } from '../shared/constants.js';
import { SKILLS, THROWABLES } from '../shared/skills.js';
import { STREAKS, STREAK_SLOTS } from '../shared/streaks.js';

export class ServerPlayer {
  constructor(id, name, socket) {
    Object.assign(this, newMoveState());              // x,y,z,vx,vy,vz,onGround,slide* (shared movement state)
    this.id = id; this.name = name; this.socket = socket;
    this.team = 'red';
    this.primary = DEFAULT_PRIMARY; this.nextPrimary = DEFAULT_PRIMARY; this.secondary = DEFAULT_SECONDARY; this.nextSecondary = DEFAULT_SECONDARY;
    this.alive = false; this.spawned = false; this.yaw = 0; this.pitch = 0; this.aim = false;
    this.hp = PLAYER.maxHealth; this.armor = PLAYER.maxArmor; this.plates = PLAYER.startPlates;
    this.ws = makeWeaponState(this.primary, secondaryFor(this.primary, this.secondary));
    this.queue = []; this.lastSeq = 0; this.epoch = 1; this.simT = 0;
    this.kills = 0; this.deaths = 0;
    this.lastDamageT = -99; this.regenAcc = 0; this.respawnAt = 0; this.protectUntil = 0;
    this.score = 0; this.killTimes = []; this.zoneT = 0;
    // skills / throwables / effects (see server/abilities.js)
    this.skill = null; this.nextSkill = null; this.nextThrow = 'frag'; this.thr = { id: null, n: 0 }; this.energy = 0;
    this.exoCharge = 0; this.exoT = 0; this.kaT = 0; this.kaAcc = 0; this.polterT = 0; this.annih = null; this.stimT = 0; this.cryoT = 0; this.cryoSlow = 0; this.cryoAcc = 0; this.baseMax = null; this.gas = 0; this.gasT = 0;
    this.lift = false; this.liftGrace = 0; this.marks = new Map(); this.skillPrevS = false; this.throwPrev = false;
    this.ready = false; this.queued = false; this.place = 0; this.maxArmor = PLAYER.maxArmor; this.maxPlates = PLAYER.maxPlates; this.ringT = 0; this.ringAcc = 0; this.ringRate = 0;
    // Battle Royale: helicopter seat, downed state (hp bleeds away), Self-Revive Kits, respawns left
    this.heli = false; this.heliT = 0; this.seat = 0; this.heliJumpPrev = false; this.down = false; this.downBy = null; this.revT = 0; this.selfT = 0; this.reviveTarget = null; this.kits = 0; this.respawnsLeft = 0;
    // Scorestreaks (Classic): loadout, earned streaks, score of this life, paralysis, special throwable in hand, camera view
    this.nextStreaks = []; this.streakSet = []; this.streakHave = []; this.streakGot = new Set(); this.lifeScore = 0; this.empT = 0; this.special = null; this.view = null; this.streakPrevSlot = -1; this.skThrowPrev = false; this.echelonOwner = null; this.bot = null;
    this.hold = false; this.frozen = false; this.interactHeld = false; this.hasBomb = false;
    this.history = []; this.vote = {}; this.lastQueued = -1;
  }
  // primary = any non-pistol weapon, secondary = a pistol. (A pistol sent as `primary` is treated as the sidearm choice.)
  setLoadout(primary, secondary, skill, throwable, streaks) {
    let ok = false;
    if (Array.isArray(streaks)) { const l = [...new Set(streaks.filter(id => STREAKS[id]))].slice(0, STREAK_SLOTS); this.nextStreaks = l; ok = true; }
    if (primary && WEAPONS[primary] && !WEAPONS[primary].unarmed && !WEAPONS[primary].skillWeapon) { if (isPistol(primary)) secondary = secondary || primary; else { this.nextPrimary = primary; ok = true; } }
    if (secondary && isPistol(secondary)) { this.nextSecondary = secondary; ok = true; }
    if (skill && SKILLS[skill]) { this.nextSkill = skill; ok = true; }
    if (throwable && THROWABLES[throwable]) { this.nextThrow = throwable; ok = true; }
    if (!this.spawned) { this.primary = this.nextPrimary; this.secondary = this.nextSecondary; }
    return ok;
  }
}
