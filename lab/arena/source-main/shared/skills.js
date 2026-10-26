// Skills (T) and throwables (G): data shared by server, client prediction and UI.
// Every number that tunes a skill / throwable lives here; the server (server/abilities.js), the shared movement code and the client read it from this table.
// NOTE: the first sentence of every `desc` is shown as the short subtitle in the loadout list - keep decimal points out of it.
export const SKILLS = {
  hook:   { id: 'hook',   name: 'Grappling Hook', cost: 33, desc: 'Aim at a spot and press T: a personal zipline pulls you there fast. Range 51.75 m (+15 %). Steer with WASD while travelling.' },
  exo:    { id: 'exo',    name: 'Exoskeleton Momentary Overload', cost: 60, duration: 20, killBonus: 5, charge: 2, boost: 1.6, desc: '2 s charge (move only, your model flashes blue), then +60 % movement and handling speed (slide, jump, aim, reload) for 20 s, +5 s per kill. Leaves a golden trail.' },
  kinetic:{ id: 'kinetic',name: 'Kinetic Armor',  cost: 60, duration: 15, killBonus: 3, maxArmor: 100, regen: 2, regenEvery: 0.1, taken: 0.75, desc: 'Max armor 100 and +100 armor now; +2 armor every 0.1 s for 15 s; armor takes 25 % less damage, but you move and handle 15 % slower. +3 s per kill. Your model flashes yellow.' },
  polter: { id: 'polter', name: 'Poltergeist',    cost: 65, duration: 5,  nearRange: 20, desc: 'Invisible for 5 s. Firing, opening crates, planting or defusing ends it. Nearby enemies get a dark, heavy vignette.' },
  pad:    { id: 'pad',    name: 'Pneumatic Auxiliary Device', cost: 25, killEnergy: 25, desc: 'A quick leap forward (+30 % speed, +15 % distance). Any kill grants 25 energy.' },
  annih:  { id: 'annih',  name: 'Annihilator',    cost: 100, desc: 'A one-round handgun that deals 150 damage with an oversized hit box. You are slower while holding it and unarmed for 3 s after firing. A kill refills your energy at once. Others see a red glint.' },
  pulse:  { id: 'pulse',  name: 'Scout Pulse',    cost: 30, range: 40, mark: 2, desc: 'A red wave (40 m) marks enemies it touches: you and your teammates see them through walls for 2 s and they get a "You\'re Marked" warning.' },
  grav:   { id: 'grav',   name: 'Gravity Spike',  cost: 80, dmgMin: 70, dmgMax: 180, radius: 32, reduction: 0.35, desc: 'Leap high, then slam into the ground: 70-180 area damage and the Pneumatic Discharger knockback. You are unarmed and take 35 % less damage until you land.' },
  dsr:    { id: 'dsr',    name: 'Dissociative Surreality', cost: 50, duration: 10, opacity: 0.5, desc: 'Send out your spirit for 10 s and fight with it while your real body stays behind, completely vulnerable. If the spirit is defeated you simply return to your body (no kill for the enemy). If the body is defeated you die and the skill ends.' },
  em2:    { id: 'em2',    name: 'Electromagnetic Machinecannon 2nd Model', cost: 100, rounds: 2, markRange: 50, windup: 0.2, desc: 'A hand cannon with 2 rounds: a huge red laser that travels through walls. Enemies within 50 m are marked through walls for you until the skill ends. Each shot locks your aim for 200 ms before it fires.' },
  warm:   { id: 'warm',   name: 'Warmonger Activation Kit', cost: 75, duration: 15, charge: 2, killBonus: 5, move: 0.10, rate: 0.05, steal: 0.25, reduction: 0.35, stackMove: 0.05, stackRate: 0.05, stackSteal: 0.05, desc: '2 s charge (move only), then +10 % movement and handling speed, +5 % fire rate and 25 % lifesteal for 15 s, and you take 35 % less damage while it lasts. Every kill adds 5 s and another +5 % of each bonus (reset when it ends). Everybody sees a big red glint on you.' },
  tum:    { id: 'tum',    name: 'Therapeutic Undulating Module', cost: 35, speed: 22, range: 80, width: 13.5, height: 4.5, thick: 0.8,
    mark: 3, heavy: { move: 0.5, rate: 0.5, duration: 3 }, debuff: { move: 0.15, rate: 0.15, duration: 17, cleanse: 3 },
    ally: { heal: 50, duration: 6, rate: 0.2, move: 0.2, regenHp: 1, regenAr: 1, regenEvery: 0.1 },
    desc: 'Cast a huge green wave that passes through walls and players for 80 m. Enemies are marked for 3 s (your team sees them) and for those 3 s take a heavy debuff: -50 % movement, handling and fire rate. After that they keep a -15 % debuff for 17 s (hold F for 3 s to remove it). You and your teammates hit by the wave recover 50 health at once and get +20 % movement, handling and fire rate for 6 s, plus health and armor recovery.' },
  kupi:   { id: 'kupi',   name: 'Iphone Kupi',    cost: 80, duration: 30, volume: 1, audio: 'assets/audio/kupi-tone.wav', deathAudio: 'assets/audio/kupi-eliminated.wav', desc: 'Plays the Kupi audio loudly for EVERY player for 30 s. The file is kupiaudio.mp3; anyone who dies during those 30 s hears ggfuggingez.mp3 (the defeated player only).' },
};
export const SKILL_LIST = Object.keys(SKILLS);
export const MOVE_SKILLS = ['hook', 'pad', 'grav'];                 // skills executed by the shared movement code (prediction + server)
export const isMoveSkill = (id) => MOVE_SKILLS.includes(id);

const GAS_RADIUS = 7.2;                                              // 6 m +20 %
export const THROWABLES = {
  frag:       { id: 'frag',       name: 'Frag Grenade',   desc: 'Bounces and explodes after 3 s. 30-200 damage, big blast.', fuse: 3, radius: 9.45, dmgMin: 30, dmgMax: 200, speed: 31 },
  impact:     { id: 'impact',     name: 'Impact Grenade', desc: 'Explodes on impact. 150 on a direct hit, 20-150 splash in a bigger blast.', radius: 6.1425, direct: 150, dmgMin: 20, dmgMax: 150, speed: 31 },
  cryo:       { id: 'cryo',       name: 'Cryo Splitter',  desc: 'Freezing field for 10 s: 30 % slow that keeps growing up to 75 %, no sprinting. The slow grows 5 % every half second.', radius: 6.5, duration: 10, slow0: 0.3, step: 0.05, interval: 0.5, maxSlow: 0.75 },
  gas:        { id: 'gas',        name: 'Gas Bomb',       desc: 'Toxic cloud that damages everyone inside and slows each victim a further 2 % with every tick of damage. 2 damage every 0.1 s plus a heavy screen-darkening vignette.', radius: GAS_RADIUS, duration: 8, slowPerHit: 0.02, maxSlow: 0.75, slowLinger: 2 },
  smoke:      { id: 'smoke',      name: 'Smoke Grenade',  desc: 'A giant, fully opaque smoke cloud (1.5x the Gas Bomb radius) for 8 s. No damage.', radius: GAS_RADIUS * 1.5, duration: 8 },
  foam:       { id: 'foam',       name: 'Foam Wall',      desc: 'A wide wall that blocks bullets and projectiles for 5 s. Players walk through.', duration: 5, length: 6.7275, height: 4.025, thick: 0.575, opacity: 0.65 },     // +15 % over 5.85 x 3.5 x 0.5, 35 % transparent
  stim:       { id: 'stim',       name: 'Stim Shot',      desc: 'Inject: +25 % movement and handling speed for 5 s and rapid health recovery. Recovers 10 health every 0.1 s for 1.5 s.', duration: 5, boost: 0.25, healAmount: 10, healEvery: 0.1, healDuration: 1.5 },
  discharger: { id: 'discharger', name: 'Pneumatic Discharger', desc: 'Sticks to a surface. Only YOU detonate it (G again): 10-80 damage in a huge radius and a long launch (no ADS while airborne).', radius: 9.45, dmgMin: 10, dmgMax: 80, push: 22, lift: 13 },
  tripmine:   { id: 'tripmine',   name: 'Trip Mine',      desc: 'Sticks to any surface and emits a ray from its head. An enemy touching the ray sets off a huge 50-350 damage blast. After 4 s the mine turns invisible and the ray almost vanishes.', radius: 11, dmgMin: 50, dmgMax: 350, rayLen: 8, rayRadius: 0.15, hideAfter: 4, rayOpacity: 0.85, rayOpacityHidden: 0.1 },
  flash:      { id: 'flash',      name: 'Flashbang',      desc: 'Bounces and explodes without dealing damage. 2.5 s after the throw anyone looking at the blast is blinded in white for 2 s.', fuse: 2.5, blind: 2, viewCos: 0.5, range: 60, speed: 31 },
  unveiler:   { id: 'unveiler',   name: 'Unveiler',       desc: 'Sticks to the ground and turns invisible (bounces off walls). An enemy stepping into its blast range sets it off: no damage, but a 50 % slow and a 2 s mark visible to your team.', radius: 9.45 * 1.3, slow: 0.5, slowFor: 2, mark: 2 },
};
export const THROW_LIST = Object.keys(THROWABLES);
export const THROW_SPEED = 25;               // default throw speed (grenades are faster, see THROWABLES.*.speed)
export const THROW_START = 2;
export const THROW_MAX = 4;
// Movement modifiers from the active effects; the SAME function runs on the server and in client prediction.
// f: {exo, ka, charge, stim, cryo (slow fraction), slow (slow fraction), annih, warM / warR (Warmonger move+handling / fire-rate bonus fractions), deb (Therapeutic debuff), buff (Therapeutic ally buff)}
// -> speed (movement), anim (handling: slide / jump / aim / reload speed), rate (fire rate), lock (charging: move only)
export function fxOf(f, skill = null, skillAct = false) {
  let speed = 1, anim = 1, rate = 1;
  if (f.exo) { speed *= SKILLS.exo.boost; anim *= SKILLS.exo.boost; }          // Exoskeleton Momentary Overload: +60 % movement and handling
  if (f.ka) { speed *= 0.85; anim *= 0.85; }                       // Kinetic Armor: -15 % movement and handling
  if (f.stim) { speed *= 1 + THROWABLES.stim.boost; anim *= 1 + THROWABLES.stim.boost; }
  if (f.cryo) speed *= 1 - f.cryo;                                 // Cryo Splitter: f.cryo = current slow fraction (0.30 and growing)
  if (f.slow) speed *= 1 - f.slow;                                 // Gas Bomb stacks / Unveiler slow
  if (f.annih) speed *= 0.85;
  if (f.warM) { speed *= 1 + f.warM; anim *= 1 + f.warM; rate *= 1 + (f.warR || 0); }      // Warmonger Activation Kit
  if (f.deb2) { const d = SKILLS.tum.heavy; speed *= 1 - d.move; anim *= 1 - d.move; rate *= 1 - d.rate; }   // Therapeutic wave: heavy debuff while marked (first 3 s)
  else if (f.deb) { const d = SKILLS.tum.debuff; speed *= 1 - d.move; anim *= 1 - d.move; rate *= 1 - d.rate; }   // Therapeutic wave: enemy debuff
  if (f.buff) { const a = SKILLS.tum.ally; speed *= 1 + a.move; anim *= 1 + a.move; rate *= 1 + a.rate; }    // Therapeutic wave: ally buff
  return { speed, anim, rate, lock: !!f.charge, noSprint: !!f.cryo, skill, skillAct };
}
// can this player aim down sights right now?  (s = movement state)
export function canAim(s, f) { return !s.zl && !s.air && !s.hk && !s.gs && !(f.lift && !s.onGround); }
