# FPS ARENA – browser multiplayer FPS (Three.js + Node + Express + Socket.IO)

## Run
```
npm install
node server.js          # or: npm start
```
Open **http://localhost:3000/** (open it in several tabs/browsers to play against yourself).

Requires Node 18+. Three.js is served straight from `node_modules/three` (`/vendor/three`), so `npm install` is mandatory.

## Game types (main menu)
Every type has ONE shared room: **menu → type → callsign → JOIN → waiting room → match → results → back to the waiting room → …**
Classic: players who join while a match is running enter it right away (Search & Destroy: they spectate until the next round starts, or spawn at once during the freeze phase). Battle Royale and Zombies: late joiners wait in the room and enter the next match automatically.

| Menu button | Waiting room | Match |
|---|---|---|
| **CLASSIC** | 60 s countdown (starts when the first player enters). Pick RED/BLUE, vote for mode + map (TDM / S&D / Hardpoint on Arena / Neon / Foundry), `START (n/m)` – when everybody is ready the match starts at once | TDM, Search & Destroy, Hardpoint |
| **BATTLE ROYALE** | 180 s countdown (forced start), pick one of 4 teams (up to 3 players each), vote **Resurgence** / **Incursion**, `+ ADD AI`, `START (n/m)` | **Oil Rig** – last team standing (Resurgence) / most Hardpoint points (Incursion) |
| **ZOMBIES** | 60 s countdown, `START (n/m)` | **Dead Marsh** – co-op waves, PvP off |

## Controls
WASD move (**auto-sprint**, +20 %) · Space jump · **C / Shift** crouch (while sprinting = **slide**) · **X** prone (while sprinting = **dive**) ·
**Q / E** lean left / right (also while jumping; sliding cancels it) · Mouse look · LMB fire · **RMB ADS** · R reload · **V** armor plate (3 s, +50) ·
**F** use: open crate / pick up gun / ride zipline / **plant & defuse (hold)** · **T** skill · **G** throwable (G again detonates a placed Pneumatic Discharger) ·
1/2 or wheel switch weapon slot · Tab scoreboard · Esc release mouse · M (while released) leave.
Classic: while dead & waiting to respawn **E** opens the loadout (respawn is held until **DEPLOY** / Space).
Firing, aiming and leaning drop the sprint instantly; you can only slide from a sprint. Base speed is 6.9 (+15 %), sprint 8.3, crouch ×0.65, prone ×0.3.

## Skills (T) and energy
Pick ONE skill in LOADOUT → SKILLS before you can press START (when the waiting-room timer runs out without a choice a random skill is assigned).
Energy: +1 per second, +10 per kill (Pneumatic Auxiliary Device: +25, Annihilator kill: refills to 100), max 100. In Classic modes energy is kept when you die; in Battle Royale / Zombies it resets.
All numbers live in `shared/skills.js` (SKILLS / THROWABLES). Kill-based bonuses (energy, Warmonger extension, Annihilator refill) apply to kills on players (zombie kills never gave energy).
| Skill | Energy | Effect |
|---|---|---|
| Grappling Hook | 33 | aim at a surface within 51.75 m and press T: a personal zipline pulls you there fast (28 m/s), WASD steers while travelling |
| Exoskeleton Momentary Overload | 60 | 2 s charge (move only, your model flashes blue), then 20 s (+5 s per kill): +60 % movement AND handling speed, golden trail |
| Kinetic Armor | 60 | max armor 100 and +100 armor now, +2 armor every 0.1 s for 15 s (+3 s per kill); armor takes 25 % less damage, but you move and handle 15 % slower; model flashes yellow |
| Poltergeist | 65 | invisible for 5 s; firing / opening a crate / planting / defusing ends it; enemies within 20 m get a dark, heavy vignette that grows as you get closer |
| Pneumatic Auxiliary Device | 25 | quick leap forward (~12.4 m, +30 % speed); any kill gives +25 energy |
| Annihilator | 100 | one-round handgun, 150 damage, hit box padded by 0.45 m; slower while held, unarmed for 3 s after firing; a kill refills energy to 100; red glint |
| Scout Pulse | 30 | red wave (40 m) marks enemies for 2 s: you AND your teammates see them through walls; the marked get a "You’re Marked" warning |
| Gravity Spike | 80 | leap up (~5 m) and slam down: 70-180 AoE damage (32 m) with the Pneumatic Discharger knockback; unarmed + 35 % damage reduction until you land |
| Dissociative Surreality | 50 | 10 s spirit (50 % transparent, fresh 100 hp / mode start armor) fights while your body stays behind as a normal target. Spirit defeated = back in the body, no kill, no death. Body defeated = you die, skill ends |
| Electromagnetic Machinecannon 2nd Model | 100 | hand cannon, 2 rounds: red laser (150 dmg, 1 m hit-box padding) through walls AND through every enemy on its line; trigger = 200 ms aim lock, then it fires. Enemies within 50 m are marked (for you only) until the skill ends; marked players see "EM2 active" |
| Warmonger Activation Kit | 75 | 2 s charge (move only), then 15 s of +10 % movement/handling, +5 % fire rate, 25 % lifesteal and 35 % less damage taken; each kill +5 s and +5 % of each bonus (reset when it ends). Everybody sees a big red glint on you |
| Therapeutic Undulating Module | 35 | green wave (13.5 x 4.5 m, 22 m/s, 80 m, fades over the last 10 m) through walls and players. Enemies: marked 3 s (your team sees it) with a heavy -50 % movement/handling/fire rate debuff during those 3 s, then -15 % for 17 s (hold **F** 3 s to remove; the heavy phase cannot be removed). You and teammates hit by the wave: +50 health at once, +20 % fire rate/movement/handling for 6 s, +1 hp and +1 armor per 0.1 s |
| Iphone Kupi | 80 | `assets/audio/kupiaudio.mp3` loudly for every player for 30 s; a player who dies in that window hears `assets/audio/ggfuggingez.mp3` (only them). **Both files must be added to `assets/audio/`** |

## Throwables (G)
Choose one in LOADOUT → THROWABLES (Classic starts with 2; Battle Royale / Zombies crates drop them, max 4). Grenades fly ~30 m/s, the rest ~25 m/s.
Frag (3 s fuse, 30-200, 9.5 m blast) · Impact (explodes on contact, 150 direct, 20-150 splash, 6.1 m blast) ·
**Cryo Splitter** (10 s field, 6.5 m radius: 30 % slow that grows 5 % every 0.5 s up to 75 %, no sprint) ·
Gas Bomb (7.2 m cloud, 2 damage / 0.1 s, every damage tick adds a 2 % slow (max 75 %, gone 2 s after leaving), heavy screen-darkening vignette) ·
**Smoke Grenade** (8 s, opaque cloud with 1.5x the Gas Bomb radius = 10.8 m, no damage) · Foam Wall (6.7 m wide, 4 m high, 35 % transparent, 5 s, blocks bullets and projectiles, players walk through) ·
Stim Shot (+25 % movement and handling for 5 s, +10 health every 0.1 s for 1.5 s) · Pneumatic Discharger (sticks to a surface; **only you** detonate it with G again: 10-80 damage in a 9.5 m radius, long launch) ·
**Trip Mine** (sticks to any surface, perpendicular to it; the ray along its axis from the head, 8 m max, is triggered by enemies: 50-350 damage in an 11 m blast; after 4 s the mine is invisible and the ray 90 % transparent) ·
**Flashbang** (bounces, 2.5 s, no damage; everybody - friend, foe, thrower - with the blast inside a 60° view cone and line of sight is blinded white for 2 s) ·
**Unveiler** (sticks to the ground and is invisible to enemies, bounces off walls; an enemy within 12.3 m sets it off: no damage, 50 % slow and 2 s mark for your team).
Explosives never hurt teammates. Players who ADS with a **sniper** show a white glint at their head to everybody else.

## Game rules
Classic: health 100 (regen after 5 s), armor 50, +1 plate per kill, headshot 1.3x (snipers: instant kill), no friendly fire.
* **TDM** – first to 50 kills. **Search & Destroy** – 5 rounds, plant/defuse, "2 vs 2" survivor counter, invisible free-fly spectators. **Hardpoint** – 35 s zones, first to 100.
* **Battle Royale (Oil Rig)** – everybody is teleported to ~170 m altitude *inside the map*, glides freely (WASD steer, Space dive, C slow; no fall damage, no ADS),
  lands unarmed with 0 armor. **Crates** (`F`, lid animation) have a RARITY (Grey < Green < Blue < Purple < Orange < Red, tiers in `shared/rarity.js`): it colours the crate's beam / mist and the ground circles, picks the one weapon from that tier and scales the ammo / plates / equipment / energy that comes with it (Zombies: Purple+ only). Drops: guns (real models, spinning), ammo packs (brown/yellow) and armor plates (dark thin packs);
  `F` on a gun swaps it. Armor max **150**, plates max **5** (+50 armor each), finite ammo. Ring: first shrink at 30 s (−15 %), then −20 % every minute
  (85/65/45/25/5 % of the map width; each shrink takes 20 s), one minute later the ring closes completely. The first shrink stays map-centred; each of the four -20 % shrinks closes into its own random centre (a white circle on the map shows the next one). Outside the ring: 5 HP/s straight to health, ×3 every 5
  undisrupted seconds. Health regenerates like in the other modes; gliding players take 80 % less damage until they land. Dead players spectate (free-fly) and see their placement; at the end the placement list is shown.
  Oil Rig has ziplines (F): from the derrick platform to the four satellite rigs and between the satellites.
* **Zombies (Dead Marsh)** – players spawn on fixed points with a pistol. Zombies follow a navigation flow field (they climb stairs) at **105 %** of player speed.
  The next wave starts after 80 % of the current wave is dead. Crates appear at random spots. Dead players respawn when a new wave starts. All players down = game over.

## Weapons (38 + knife)
All stats live in `shared/weapons.js` (class baselines + per-weapon overrides). Primary = any non-pistol; **sidearm = a pistol (default Makarov)**, chosen in the loadout (click a pistol). BR/Zombies start with a Makarov.
Burst weapon: **SRM Model 1216** (4-shell burst shotgun). **AR-57** is a 50-round SMG. Snipers and shotguns (not the AA-12) show a **CHAMBERING** bar between shots.
* **Assault Rifle** (11): M4A1, FN SCAR-L, AK-74, Honey Badger, A-545, Bushmaster ACR, HK416, Ruger AC-556, QBZ-95, B&T APC-308, FN FNC
* **SMG** (11): Colt 9mm, MP5SD, SIG MPX, APC9, AR-57, AEK-918G, AEK-919K, IMI Uzi, PP-93, Thompson M1928, UMP45
* **Marksman** (3): HK SL8, SKS, Beretta ARX200
* **Sniper** (3): L115A3, WA2000, Haenel RS9
* **LMG** (3): M249 SAW, RPD, RPK
* **Shotgun** (3): AA-12, SRM Model 1216 [4-burst], M26 MASS
* **Special** (1): Laser Rifle
* **Pistol** (3): Makarov, Micro Uzi, RSh-12 (all automatic)
* **Melee sidearm** (1): Knife (not lootable, takes no attachments). The Attack Chopper minigun (M134), Annihilator and EM2 are skill / scorestreak weapons.

## Shooting range
LOADOUT screen -> **SHOOTING RANGE** joins a shared, permanent room (any number of players). No PvP; 14 target dummies at 10/20/30/40 m. **E** opens the loadout at any time (even alive); DEPLOY applies it in place. Lean-right is off in the range because E is used. Turn on DEV MODE in the menu to calibrate; **C** copies everything.

## Structure
```
server.js            Express + Socket.IO entry point
server/hub.js        one room per game type
server/game.js       a room: waiting room, queue, match lifecycle, 60 Hz sim, 30 Hz snapshots
server/loot.js       crates + dropped items
server/combat.js     hitscan, headshots, lag compensation (rewinds targets up to 250 ms)
server/modes/*.js    tdm, snd, hardpoint, br (Resurgence / Incursion, teams, helicopter, downed, ring), zombie (waves, AI), range (Shooting Range, no PvP)
server/streaks.js    Classic scorestreaks;  server/bot.js  AI players;  server/abilities.js  skills + throwables
shared/              code used by BOTH sides: constants, weapons table (38 selectable weapons + knife + skill weapons), attachments (table, compatibility, stat multipliers),
                     skills / throwables, scorestreaks, loot rarity, movement/collision (stairs, ziplines, air glide, helicopter seat), weapon state, nav grid, loot targeting, geometry
maps/                arena, neon, foundry (Classic), oilrig (BR), marsh (Zombies), range (Shooting Range); boxes = visual + collision, util builder (stairs, slabs, mounds)
client/              main.js (state machine + render loop), game.js (prediction loop), camera.js (yaw->pitch->camera rig, roll = 0),
                     weapons.js (viewmodel), ads.js, weaponmodel.js (GLB analysis/orientation), calibration.js, assets.js,
                     network.js, remote.js (interpolation), player.js (prediction/reconciliation), hud.js, modes.js,
                     lobby.js, loadout.js (rigid rotating preview, attachment squares, scorestreak tab), menuscene.js, devmode.js, audio.js, settings.js,
                     attachments.js + attachcal.js (attachment models / placement), laserfx.js (laser beams), streaks.js + streakhud.js (scorestreaks)
tools/               validate-maps.js (reachability), check.js (static checks)
test/run.js          headless server/mode/movement tests
tools/smoke/         client smoke tests: real client renderers + the full client Game run in node against a THREE stub and real server snapshots
assets/models/       weapon GLBs (laser_rifle is procedural), knife.glb, m134.glb
assets/attachments/  attachment GLBs
```
Weapon stats live in **one table**: `shared/weapons.js`. Per-weapon viewmodel pose lives in `client/calibration.js`.

## Networking
Client sends inputs at 60 Hz (seq, yaw, pitch, keys, plus `lt` = the server time it is rendering others at). Server simulates each input with the same
`shared/movement.js` / `shared/weaponstate.js` the client predicts with, and sends snapshots at 30 Hz with the last acked seq.
Client replays un-acked inputs on top of the server state (reconciliation; small errors are blended out, >2.5 m snaps).
Remote players are rendered 100 ms in the past by interpolating timestamped snapshots (≤100 ms extrapolation).
Bullet spread is deterministic per input seq, so client tracers and server hits agree. Ammo/reload/plating are predicted and hard-synced when nothing is in flight.

## DEV MODE (weapon calibration)
Menu → **DEV MODE: ON**, join a match (alone is fine – S&D/TDM work solo). Then:
`J/L` x · `I/K` y · `U/O` z · **Shift** = rotate · **Alt** = ×5 · step 0.002 m / 0.2° · `P` reset weapon · **`C` copy** ·
holding **RMB** edits the *ADS offset* instead of the hip position.
The copied line (`m4a1: { position: [...], rotationDeg: [...], ads: [...] ... }`) goes into `client/calibration.js`.
The HUD also shows FPS, ping, clock offset, snapshots/s, inputs/s, ack, pending inputs, reconciliation count/error, camera yaw/pitch/**roll**, model load status and the detected model axes.
If a gun points backwards / upside-down, set `orient: { flip: true }` / `{ flipUp: true }` for that weapon in `calibration.js`, or rotate it 180° in DEV MODE.
Console lines: `[MODEL] LOADED: id / file` or `[MODEL] FAILED: id / file / error` (failed models fall back to a procedural gun).

## Checks
```
npm run check        # syntax, asset files, import/export resolution, DOM ids vs index.html, importmap, static routes
node tools/validate-maps.js
npm test             # headless tests (720) + server.js boot with stubbed deps
npm run smoke        # client smoke tests (renderers + the full client Game against real server snapshots)
```

## Known limitations
* The GLBs are Sketchfab exports with arbitrary axes/scale/armatures. Orientation, muzzle end, up direction and sight point are **detected heuristically** at load time;
  a few weapons may need a `flip`/`flipUp` or a small DEV MODE adjustment, and ADS sight alignment is per-weapon fine-tunable but not guaranteed pixel-perfect out of the box.
* The laser rifle is procedural. DEV MODE: press **C** to copy the gun name, hip position, iron-sight ADS, Coyote ADS and attachment positions in one go.
* Weapons without an entry in `client/calibration.js` use auto-detected orientation / pose - tune them in DEV MODE and paste the lines into `client/calibration.js`. Models load in the background after the menu appears; until a model arrives a procedural gun is shown.
* Sound is synthesised (WebAudio); no recorded audio. Remote players are simple procedural humanoids (no animation beyond slide pose).
* Hit detection uses AABB body + head sphere. AI players can be added in the Classic / Battle Royale waiting rooms (`+ ADD AI`); to fight real players you need another browser tab.
* Oil Rig / Dead Marsh geometry is made of boxes (stairs are stepped boxes), so it looks blocky; the sea is walkable shallow water (slower). Everything about the new maps, crates, ziplines and zombies has been tested headlessly but NOT seen in a browser.

## Battle Royale: teams, sub-modes, helicopter, downed (phase 2 + 3)
- **Teams:** 4 teams (red / blue / green / gold) of up to 3. Pick a team in the waiting room (`lobby:team`); the 13th player waits for the next match. Teammates never damage each other.
- **Sub-modes** (voted in the waiting room, `config.sub`): **Resurgence** - 2 respawns per player during the first 3:30, unused ones are lost, last team standing wins. **Incursion** - infinite respawns, a Hardpoint on the derrick deck (`BR.incursion`), most points after 5:00 or 150 points wins; the ring works as usual.
- **Helicopter:** everybody (and every respawn) appears seated in a hovering helicopter. Space / F jumps out and starts the glide; after 10 s you are thrown out. When respawning ends the helicopter flies away. Server: `server/modes/br.js` (`heli`, `exitHeli`), shared pinning flag `heli` in `shared/movement.js`.
- **Downed:** lethal damage (not while gliding / in the helicopter) downs you: 100 hp bleeding 5/s, no moving / firing / skills, you can look around, lying on your back and flashing red. Hold **V** with a **Self-Revive Kit** (5 s, no bleeding meanwhile) or a teammate holds **F** next to you (7 s); you get up with 20 hp and recover immediately. Damage while downed, or bleeding out, is the real death (the player who downed you gets the kill). Kits come from Orange / Red crates as part of their "equipment" (max 2 carried).
- **Screens:** a team that is eliminated sees `#N` alone for 3 s; at the end the winner sees `VICTORY` and the runner-up `#2` for 3 s, then the scoreboard.
- Tunables live in `shared/constants.js` (`BR`, `BR_TEAMS`, `DOWN`).

## AI players + Scorestreaks (phase 4 + 5)
- **AI players** (Battle Royale and Classic waiting rooms, `+ ADD AI`, one per click, up to 12 players; Classic bots keep the teams balanced and play the objective: Hardpoint zone, S&D plant / defuse): `server/bot.js` is a brain that writes ordinary inputs for a normal ServerPlayer, so bots follow every rule. They jump out of the helicopter, glide to crates, open them (F) and pick up weapons, follow the navigation graph to the nearest enemy while avoiding the ring, strafe, fire without aiming down sights, jump / slide periodically, use Self-Revive Kits and revive teammates.
- **Scorestreaks** (Classic only; `shared/streaks.js` = data, `server/streaks.js` = rules, `client/streaks.js` + `client/streakhud.js` = visuals): choose up to 3 in the loadout (SCORESTREAKS tab), keys **1 / 2 / 3**. Score of the current life fills them; dying clears the score but keeps earned streaks. Weapons are swapped with the mouse wheel only (the number keys 1 / 2 no longer swap in any mode); **X** stays the prone key. Kills made by a streak give +25 ("Scorestreaks kill"). All streak machines can be shot down with ordinary bullets.
  UAV Recon (500), Predator (950, camera + 2 guided missiles), Artillery Beacon (800), Attack Chopper (1250, M134), EMP (700), ODIN (4000), Trophy System (300), Kinetic Charger (600), Reserved Echelon (1000, 4 AI soldiers).
- Classic HUD: Hardpoint marker and S&D bomb marker are icons only, "HARDPOINT RELOCATED" banner, VICTORY / DEFEAT overlay before the leaderboard.

## Melee knife, SMG/pistol sprint, rebalanced Scorestreaks
- **Knife** (`knife`, sidearm, pick it in the loadout): hold LMB to slash, 75 damage to the enemy (or zombie) in front within 2.6 m, one swing per 750 ms, no ammo. Server: `meleeStrike` in `server/combat.js`. Viewmodel: sprint = free swing (no 90 degree turn, no move to the centre); slash = blade rolls horizontal and sweeps left to right. Model: `assets/models/knife.glb`.
- **SMG + pistol sprint pose** (only those): muzzle tilted up 75 degrees, gun pulled much closer and lowered a little, still swinging.
- **Scorestreak costs:** Trophy 250, UAV Recon 300, Kinetic Charger 350, Artillery Beacon 500, UAV Predator 550, EMP 700, Reserved Echelon 750, Attack Chopper 900, Orbital Defense Initiative 2000. All numbers live in `shared/streaks.js` (`STREAKS`, `SK`).
- **ODIN:** red flashing "<name> has called ODIN" + small white `00:SS:cc` counter; at 0 the strike hits, 2 s of violent shake + white-out, only then the team wins and VICTORY / DEFEAT shows.
- **Attack Chopper:** the M134 (`assets/models/m134.glb`, weapon id `m134`) replaces your gun, centred and lowered; muzzle flash + a tracer for every round.
- **Client smoke tests:** `npm run smoke` executes the real client renderers (loot, streak entities, remote players, zombies, mode views) AND the full client `Game` (prediction, viewmodel with attachments, laser beams, Chambering bar, skills, BR, Shooting Range) in node against a THREE stub, fed with real server snapshots. They catch runtime errors that `node --check` and the server tests cannot. Nothing here has been seen in a real browser.

## Weapon modification (attachments)

Every Classic weapon (primary and sidearm) has two accessory squares under its stats in the loadout screen. An empty square shows a **+**; click it to choose any attachment the gun accepts. A filled square shows a spinning model of the attachment; click it to swap or remove it. The two attachments must use different mounts (optic / foregrip / laser / muzzle). Each weapon keeps its own two.

| Attachment | Mount | Effect (all numbers in `shared/attachments.js`) |
|---|---|---|
| Coyote Reflex Sight | optic | the model's own reticle; changes the ADS position (see below); faster ADS |
| Daniel Defense / Vertical / Angled Grip | foregrip | less recoil (DD: horizontal, Vertical: vertical, Angled: faster ADS) |
| DBAL Laser | laser | -35 % hip-fire spread; the beam and dot are visible to every player |
| Suppressor | muzzle | no muzzle flash, quiet shots (others hear them only within 25 m), -12 % range, -5 % vertical recoil |

* Compatibility lives in `shared/attachments.js` (`OPTIC_CATS`, `GRIP_CATS`, `NO_OPTIC`, `NO_GRIP`, `NO_MUZZLE`): snipers/pistols take no optic, pistols no grip, the MP5SD and Honey Badger no suppressor, the laser rifle / skill weapons / fists nothing. The server validates every set against the real weapon before handing out the guns.
* Models: `assets/attachments/*.glb`. Orientation, size and mount point of each model are in `client/attachments.js` (`NORM`); the position on every gun is derived automatically from the weapon's geometry (muzzle tip, top surface, underside) in `client/weaponmodel.js`.
* Placement tuning (optic, foregrip, laser, suppressor): DEV MODE -> equip the attachments in the loadout, join a match, press **B**. It cycles through each equipped attachment twice: first *this weapon only*, then *all weapons* (the HUD shows which). J/L I/K U/O move it (+x right, +y up, U/O = closer to / further from the shoulder), Shift+J/L turns it (yaw), N/M scales it, P resets it, **C** copies the line: for *this weapon* it goes into `TUNED` in `client/attachcal.js` (`weaponId: { vgrip: { pos, yaw, scale }, ... }`, one entry per attachment, so every grip has its own placement on each gun), for *all weapons* into `BASE` (fix a model once, e.g. the suppressor; the per-weapon value is added on top).
* **Hot-swap in DEV MODE**: after pressing B (slot select - now every slot the gun accepts, also empty ones) press **]** / **[** to equip the next / previous attachment of that slot (or none) on the gun in your hands, without going back to the menu. It is visual only (a client-side override for that gun; the real loadout and the stats are unchanged), so you can tune every optic / grip combination in one session.
* **ADS with an optic**: an optic does not re-centre the gun. The gun stays centred on its own iron sights and the optic just swaps in the ADS offset you give (stored per weapon AND per optic in `ADS_OPTIC` in `client/attachcal.js`). A new combination starts from an automatic estimate (the offset that puts the optic's centre on the crosshair) so it is usable immediately; in DEV MODE, aim (RMB) with the optic equipped and use J/L, I/K, U/O (U = closer, O = further, works while aiming) - the first nudge makes the value yours. **C** copies the line, **P** (while aiming) goes back to the automatic estimate. The offsets are no longer clamped, so the gun can be moved freely in and out while aiming.
* DEV MODE steps are 1 mm / 0.1 deg for the weapon (0.5 mm / 0.25 deg for attachments); Alt = x5.
* The laser is a straight beam along the barrel (works for guns that your calibration turned 180 deg too) with a dot where it hits the map.
* If an attachment faces the wrong way, change its `yaw` by 180 in `NORM` (or use the yaw edit once per weapon).
