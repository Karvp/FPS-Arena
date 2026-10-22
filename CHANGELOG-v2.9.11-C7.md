# FPS Arena — v2.9.11 C7: Uploaded-Main Compatibility Sync

Date: 2026-10-12. Scope: **read and incorporate the user's uploaded `fps-arena-main(1).zip` into the AI simulation suite while preserving the C6 research baseline.** This is NOT a direct push to GitHub or a production deployment.

## Integrity and provenance

- Uploaded ZIP: `fps-arena-main(1).zip`; SHA-256: `7e0ba4efb2a209dd0b83365a8e272427779ac2a1562f9045d4e5c05907bdf8b0`.
- Archive integrity (CRC): passed. A Git commit cannot be established from the upload because it contains no `.git` metadata.
- Game engine upload: 162 actual files, stored **byte for byte** in `lab/arena/source-main/`.
- C6 authoritative simulator snapshot: 32 files, preserved in `lab/arena/source/`. These are deliberately different.
- Common paths: 32, unchanged: 18, modified: 14, upstream-only: 130.

## Integration and version skew

The uploaded ZIP is the game engine (Node/Three.js), while the C6 archive is a LibreWolf extension / page-agent suite with its own server simulation fixture. Replacing C6's fixture with main caused **9 failures out of 736 AI tests**. That does not indicate 9 regressions in the main game: the AI fixtures assume an older/different catalog and physics/stats.

Major new upstream elements include:

- Shooting Range (new `range` mode and map)
- Weapon attachments, dynamic stats, updated loadout and weaponstate
- New/rebalanced skills, movement/combat and late-join flow
- Expanded full-game client smoke tests
- Different weapon balance/catalog: **75** C6 playable catalog entries vs **38** in uploaded main; `benelli_m4` no longer exists in the current active weapon table despite its model asset being present. AA-12 is a valid replacement shotgun for new simulations.

The 14 altered common files are:

- `maps/index.js`
- `package.json`
- `server/abilities.js`
- `server/combat.js`
- `server/game.js`
- `server/hub.js`
- `server/modes/snd.js`
- `server/player.js`
- `shared/constants.js`
- `shared/movement.js`
- `shared/rarity.js`
- `shared/skills.js`
- `shared/weapons.js`
- `shared/weaponstate.js`

The C7 layout preserves the pinned baseline and adds a second simulator entrypoint:

```
lab/arena/source/                 # pinned C6 authoritative test snapshot
lab/arena/train.mjs              # pinned C6 simulation
lab/arena/source-main/            # uploaded full FPS Arena main game, byte-for-byte
lab/arena/train-main.mjs          # equivalent simulation using uploaded main engine
lab/arena/headless-client-main.mjs
lab/arena/unrestricted-opponent-main.mjs
```

## Verification

- C7 combined regression: **740/740 pass** (736 original C6 tests + 4 compatibility tests).
- Game's own test suite: **733/733 pass**.
- Uploaded game server smoke: passed.
- Uploaded game client smoke (including shooting range, weapon attachments): passed.
- Headless main engine in TDM, S&D, Hardpoint, BR, Zombies: passed with zero reported runtime errors.
- **Not tested in real browser; live compatibility with the current LibreWolf UI is not established.**

## 65-second matched TDM test on uploaded main

Conditions: 5 stress bots, 65ms delayed observation. Two profiles: Release and research-only episode-active, with the same seed/map/loadout.

| Map | Weapon | Seed | Release K/D | Episode-active K/D | Shots release/active | Result |
|---|---|---:|---|---|---|---|
| arena | mp5sd | 999703 | 2/1 | 2/1 | 46/46 | identical |
| foundry | aa12 | 911106 | 0/1 | 0/1 | 2/2 | identical |
| arena | mp5sd | 628506 | 1/0 | 1/0 | 18/18 | identical |
| neon | m4a1 | 803301 | 6/1 | 6/1 | 50/50 | identical |
| foundry | aa12 | 803302 | 0/2 | 0/2 | 0/0 | identical |

All five matched pairs retained identical measured kills/deaths/shots/hits and tracked movement metrics; no improvement is established. These are smoke/compatibility results, not a statistically conclusive combat evaluation. No neutralized safety gating.

## Runbook

```bash
# Existing AI regression (C6 preserved, C7 compatibility tests added)
node --test --test-concurrency=1 tests/*.test.mjs

# Game main tests and smoke
(cd lab/arena/source-main && npm test)
(cd lab/arena/source-main && npm run smoke)

# New main game headless simulation
node lab/arena/train-main.mjs --modes tdm,snd,hp,br,zm --seconds 12 --profile release --out reports/MAIN_SMOKE.json

# Original pinned C6 simulation is unchanged
node lab/arena/train.mjs --modes tdm --seconds 12 --profile release --out reports/C6_SMOKE.json
```

## Engineering decision

The upload is real and validated. It is now included in the C7 research package as a separate authoritative engine source. Do not replace the previous 75-weapon research results with current main results; do not use old weapon seeds/loadouts without verifying new weapon availability. No automatic production enablement. Next major task: adapt policies to main's 38-weapon current roster, re-evaluate skills and attachments, and gather non-overlapping episode data on main before neural training.
