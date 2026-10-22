// Skills (T) and throwables (G): data shared by server, client prediction and UI.
export const SKILLS = {
  hook:   { id: 'hook',   name: 'Grappling Hook', cost: 56, desc: 'Aim at a spot (45 m) and press T: a personal zipline pulls you there fast. Steer with WASD while travelling.' },
  exo:    { id: 'exo',    name: 'Exoskeleton',    cost: 60, duration: 20, killBonus: 5, charge: 1, desc: '1 s charge (move only), then +40 % movement and handling speed (slide, jump, aim, reload) for 20 s, +5 s per kill. Leaves a golden trail.' },
  kinetic:{ id: 'kinetic',name: 'Kinetic Armor',  cost: 60, duration: 15, killBonus: 3, maxArmor: 100, regen: 2, regenEvery: 0.1, taken: 0.75, desc: 'Max armor 100 and +100 armor now; +2 armor every 0.1 s for 15 s; armor takes 25 % less damage, but you move and handle 15 % slower. +3 s per kill. Your model flashes yellow.' },
  polter: { id: 'polter', name: 'Poltergeist',    cost: 65, duration: 7,  desc: 'Invisible for 7 s. Firing, opening crates, planting or defusing ends it. Nearby enemies get a faint vignette.' },
  pad:    { id: 'pad',    name: 'Pneumatic Auxiliary Device', cost: 25, desc: 'A quick leap forward. Kills refresh it instantly instead of giving energy.' },
  annih:  { id: 'annih',  name: 'Annihilator',    cost: 80, desc: 'A one-round handgun that deals 150 damage. You are slower while holding it and unarmed for 3 s after firing. Others see a red glint.' },
  pulse:  { id: 'pulse',  name: 'Scout Pulse',    cost: 45, range: 24, mark: 2, desc: 'A red wave (24 m) marks enemies it touches: you see them through walls for 2 s and they get a "You\'re Marked" warning.' },
};
export const SKILL_LIST = Object.keys(SKILLS);
export const THROWABLES = {
  frag:       { id: 'frag',       name: 'Frag Grenade',   desc: 'Bounces and explodes after 3 s. Up to 175 damage, big blast.', fuse: 3, radius: 9.45, dmg: 175, speed: 31 },
  impact:     { id: 'impact',     name: 'Impact Grenade', desc: 'Explodes on impact. 150 on a direct hit, smaller blast.', radius: 4.725, direct: 150, splash: 60, speed: 31 },
  cryo:       { id: 'cryo',       name: 'Cryo Splitter',  desc: 'Freezing field for 10 s: 30 % slow that grows 5 % every 0.5 s, no sprinting.', radius: 6.5, duration: 10, slow0: 0.3, step: 0.05, interval: 0.5, maxSlow: 0.75 },
  gas:        { id: 'gas',        name: 'Gas Bomb',       desc: 'Toxic cloud: 2 damage every 0.1 s and a heavy screen-darkening vignette.', radius: 6, duration: 8 },
  foam:       { id: 'foam',       name: 'Foam Wall',      desc: 'A wide transparent wall that blocks bullets and projectiles for 5 s. Players walk through.', duration: 5, length: 5.85 },
  stim:       { id: 'stim',       name: 'Stim Shot',      desc: 'Inject: +8 % speed for 5 s and immediate health recovery.', duration: 5 },
  discharger: { id: 'discharger', name: 'Pneumatic Discharger', desc: 'Sticks to a surface. Only YOU detonate it (G again): 25-150 damage in a huge radius and a long launch (no ADS while airborne).', radius: 9.45, dmgMin: 25, dmgMax: 150, push: 22, lift: 13 },
};
export const THROW_LIST = Object.keys(THROWABLES);
export const THROW_SPEED = 25;               // default throw speed (grenades are faster, see THROWABLES.*.speed)
export const THROW_START = 2;
export const THROW_MAX = 4;
// Movement modifiers from the active effects; the SAME function runs on the server and in client prediction.
// f: {exo, ka, charge, stim, cryo (slow fraction), annih}
export function fxOf(f, skill = null, skillAct = false) {
  let speed = 1, anim = 1;
  if (f.exo) { speed *= 1.4; anim *= 1.4; }                        // Exoskeleton: +40 % movement and handling
  if (f.ka) { speed *= 0.85; anim *= 0.85; }                       // Kinetic Armor: -15 % movement and handling
  if (f.stim) speed *= 1.08;
  if (f.cryo) speed *= 1 - f.cryo;                                 // Cryo Splitter: f.cryo = current slow fraction (0.30 and growing)
  if (f.annih) speed *= 0.85;
  return { speed, anim, lock: !!f.charge, noSprint: !!f.cryo, skill, skillAct };
}
// can this player aim down sights right now?
export function canAim(s, f) { return !s.zl && !s.air && !s.hk && !(f.lift && !s.onGround); }
