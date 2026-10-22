// SCORESTREAKS (Classic modes: Team Deathmatch, Search & Destroy, Hardpoint). Data only - used by the server (rules), the loadout
// screen and the HUD. Score earned during a life fills the streaks of your loadout (keys 1 / 2 / 3); dying clears the score,
// but a streak you already earned stays until you use it.
export const STREAK_SLOTS = 3;
export const STREAKS = {
  trophy:    { id: 'trophy',    name: 'Trophy System',      cost: 250,  hp: 200,  keyHint: 'THROW [G]', desc: 'Throw it: a spinning machine that shoots down up to 4 enemy projectiles (grenades, missiles, artillery) within its range with a white beam; each interception causes a small blast (10-30 damage). Lasts 60 s.' },
  uav:       { id: 'uav',       name: 'UAV Recon',          cost: 300,  hp: 500,  desc: 'A plane crosses the sky for 20 s and pings 5 times, every 4 s. Each ping reveals every enemy through walls, at their LIVE position, for 2 s (like the Scout Pulse).' },
  charger:   { id: 'charger',   name: 'Kinetic Charger',    cost: 350,  hp: 350,  keyHint: 'THROW [G]', desc: 'Throw it: a tripod machine that restores +2 armor AND +1 health every 0.1 s to friendly players nearby. Lasts 30 s.' },
  artillery: { id: 'artillery', name: 'Artillery Beacon',   cost: 500,  keyHint: 'THROW [G]', desc: 'Throw the beacon: red fog marks the spot and 30 shells fall vertically around it, one every 0.3 s (20-125 damage).' },
  predator:  { id: 'predator',  name: 'UAV Predator',       cost: 550,  hp: 750,  desc: 'A hunter plane for 30 s. Look through its camera and fire up to 2 guided missiles that you steer with the mouse (50-250 damage).' },
  emp:       { id: 'emp',       name: 'EMP System',         cost: 700,  desc: 'Destroys every enemy scorestreak and paralyses all enemies for 10 s: no skills, throwables or scorestreaks, and a glitching screen.' },
  echelon:   { id: 'echelon',   name: 'Reserved Echelon',   cost: 750,  desc: 'Four AI soldiers (300 HP, 100 armor) glide into the battlefield, head for the objective and engage. They wear out after 45 s.' },
  chopper:   { id: 'chopper',   name: 'Attack Chopper',     cost: 900,  hp: 1500, desc: 'Take control of a helicopter circling the map: M134 minigun, 1500 rounds, 60 s of fuel.' },
  odin:      { id: 'odin',      name: 'Orbital Defense Initiative', cost: 2000, desc: 'A 10 s countdown for everyone, then the orbital strike hits: the screen shakes and whites out, and your team wins the match. Cannot be stopped.' },
};
export const STREAK_LIST = Object.keys(STREAKS).sort((a, b) => STREAKS[a].cost - STREAKS[b].cost);
export const STREAK_KILL_SCORE = 25;                    // kills made BY a scorestreak only give this ("Scorestreaks kill")
export const SK = {
  uav: { life: 20, pings: [4, 8, 12, 16, 20], markT: 2, alt: 105 },
  predator: { life: 30, alt: 95, missiles: 2, missileSpeed: 58, turn: 1.7, blast: 13.5, dmg: 250, minDmg: 50, exitHold: 2 },       // blast radius 9 x 1.5
  artillery: { shells: 30, interval: 0.3, spread: 13.2, delay: 1.2, blast: 9.8, dmg: 125, minDmg: 20, fall: 80, fog: 6 },          // radius 7 x 1.4, spread 11 x 1.2
  chopper: { life: 60, ammo: 1500, rpm: 1500, dmg: 20, alt: 55, radius: 0.42, omega: 0.32, spread: 0.014 },
  emp: { time: 10 },
  odin: { time: 10, alt: 420, afterglow: 2 },                                      // afterglow: seconds of violent shake + white-out between the impact and the end of the match
  trophy: { life: 60, shots: 4, range: 9.75, blast: 3.2, dmg: 30, minDmg: 10 },    // range 6.5 x 1.5
  charger: { life: 30, range: 8, every: 0.1, armor: 2, health: 1 },
  echelon: { count: 4, hp: 300, armor: 100, life: 45, drain: 10, shotEvery: 0.35, dmg: 20, miss: 0.35 },
  throwSpeed: 24,
};
export const SPECIAL_THROWS = ['artillery', 'trophy', 'charger'];       // streaks that arrive as a throwable (G)
