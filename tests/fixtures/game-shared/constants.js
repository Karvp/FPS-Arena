// Constants shared by server and client so that prediction == authoritative simulation.
export const TICK_RATE = 60;       // server simulation + client input rate (Hz)
export const SNAPSHOT_RATE = 30;   // remote-player snapshots (Hz)
export const DT = 1 / TICK_RATE;
export const BOUND = 68;           // playable half extent (world units)

export const MOVE = {
  speed: 6.9, jumpSpeed: 7, gravity: 20,                       // 6.9 = the old 6.0 + 15 %
  slideDuration: 0.55, slideSpeed: 12.6, slideCooldown: 1.0,
  groundAccel: 70, groundFriction: 60, airAccel: 14,
  radius: 0.4, height: 1.8, slideHeight: 1.1,
  eyeHeight: 1.6, slideEyeHeight: 0.95,
};

export const PLAYER = {
  maxHealth: 100, maxArmor: 50, startPlates: 1, maxPlates: 9,
  plateTime: 3.0, plateMove: 0.7,
  regenDelay: 5.0, regenInterval: 0.2,
  respawnDelay: 3.0, spawnProtect: 1.5,
  headRadius: 0.24, bodyHalf: 0.36, bodyHeight: 1.4, slideBodyHeight: 0.9,
  headY: 1.62, slideHeadY: 1.02,
  bodyH: [1.4, 0.95, 0.5], headYs: [1.62, 1.15, 0.55],         // per stance (stand / crouch / prone)
};

// stances: 0 stand, 1 crouch, 2 prone
export const STANCE_H = [1.8, 1.25, 0.6];
export const STANCE_EYE = [1.6, 1.1, 0.5];
export const STANCE_SPEED = [1, 0.65, 0.3];
export const SPRINT = 1.2;                                        // sprint speed multiplier
export const LEAN = { offset: 0.35, deg: 18, rate: 7 };           // metres sideways, camera roll, lean units per second
export const DIVE = { speed: 9, vy: 3.6 };                        // prone while sprinting = dive forward
export const HOOK = { range: 45, speed: 28, steer: 6, arrive: 1.5 };
export const PAD = { speed: 19.6, vy: 5.5 };                      // Pneumatic Auxiliary Device leap (+40 % range)
export const ENERGY = { max: 100, regen: 1, perKill: 10 };
export const TEAMS = ['red', 'blue'];
export const PLATE_AMOUNT = 50;    // armor restored per plate (Classic max armor is 50, BR / Zombies 150)
export const MODES = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', desc: 'First team to 50 kills.' },
  snd: { id: 'snd', name: 'Search & Destroy', short: 'S&D', desc: 'One life per round. Plant or defuse. First to 5 rounds.' },
  hp:  { id: 'hp',  name: 'Hardpoint', short: 'HP', desc: 'Hold the rotating zone. First to 100 points.' },
  br:  { id: 'br',  name: 'Battle Royale', short: 'BR', desc: 'Drop in, loot crates, survive the closing ring.' },
  zm:  { id: 'zm',  name: 'Zombies', short: 'ZM', desc: 'Co-op waves of zombies. No PvP.' },
};
export const CLASSIC_MODES = ['tdm', 'snd', 'hp'];
// Battle Royale: 4 teams of up to 3, two sub-modes voted for in the waiting room
export const BR_TEAMS = ['red', 'blue', 'green', 'gold'];
export const BR_TEAM_NAMES = { red: 'RED', blue: 'BLUE', green: 'GREEN', gold: 'GOLD' };
export const BR_TEAM_SIZE = 3;
export const BR_SUBMODES = {
  resurgence: { id: 'resurgence', name: 'Resurgence', desc: 'Each player respawns up to 2 times during the first 3:30. Last team standing wins.' },
  incursion:  { id: 'incursion',  name: 'Incursion',  desc: 'Infinite respawns. Hold the Hardpoint on top of the rig. Most points after 5:00 (or 150) wins.' },
};
export const WAIT_TIME = { classic: 60, br: 180, zm: 60 };     // waiting-room countdown (seconds)
export const ROOM_KINDS = { classic: { mode: null, map: null }, br: { mode: 'br', map: 'oilrig' }, zm: { mode: 'zm', map: 'marsh' } };
export const BR = {
  dropAlt: 170, glide: 16, fall: 15, dive: 34, slow: 7,
  ringStart: 30, shrinkTime: 20, period: 60, widths: [0.85, 0.65, 0.45, 0.25, 0.05],   // % of the initial width after each shrink
  closeAfter: 60, closeTime: 60, dps: 5, tripleEvery: 5,
  maxArmor: 150, maxPlates: 5, crates: 48,
  randomFrom: 1,          // shrink index from which each ring gets its own random centre (0 = the first -15 % shrink stays map-centred)
  glideGuard: 0.8,        // damage reduction while gliding (removed on landing)
  resurgence: { respawns: 2, window: 210 },                       // respawns per player, seconds after the start during which they are possible (3:30)
  incursion: { time: 300, scoreToWin: 150, zone: { x: 0, y: 32, z: 0, r: 6, dy: 4 } },   // Hardpoint on the highest deck of the Oil Rig
  heli: { x: 0, y: 175, z: 0, maxStay: 10, seatsX: [-0.8, 0, 0.8], seatsZ: [-2.2, -0.8, 0.6, 2.0], leaveSpeed: 28, leaveClimb: 6 },   // helicopter hovering above the map
  kitMax: 2,              // Self-Revive Kits a player can carry
  endOverlay: 3,          // seconds of "VICTORY" / "#2" before the scoreboard
};
// Downed state (Battle Royale)
export const DOWN = { hp: 100, bleed: 5, selfTime: 5, reviveTime: 7, reviveHp: 20, reviveRange: 2.2 };
export const ZM = { speedMul: 1.05,   /* x player speed (6.9) = 7.25 m/s */ nextWaveFrac: 0.8, maxAlive: 36, attackDmg: 22, attackCd: 0.9, attackRange: 1.45, spawnGap: 0.45, crateEvery: 22, maxCrates: 14, startCrates: 10 };
export const ZIP = { speed: 12, attach: 2.4, hang: 2.0 };
export const USE_RANGE = { crate: 2.8, gun: 2.6, pickup: 1.7 };
export const SND = { roundsToWin: 5, freezeTime: 5, plantWindow: 120, plantTime: 6.5, bombTime: 40,
  defuseTime: 6.5, resultTime: 5, siteRadius: 4.5, defuseRange: 3, pickupRange: 1.6 };
export const TDM = { killsToWin: 50 };
export const HARDPOINT = { zoneTime: 35, scoreToWin: 100, radius: 6 };
export const VOTE_TIME = 15;
export const RESULT_TIME = 7;
export const LAG_COMP_MAX = 0.25;  // seconds the server may rewind targets for hit detection
export const INTERP_DELAY = 0.1;   // remote players are rendered 100 ms in the past
export const PITCH_MAX = 1.5607;   // just below +-90 degrees
