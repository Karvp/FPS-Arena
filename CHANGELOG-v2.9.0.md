# FPS Arena 2.9.0 — Adaptive ADS / Hip-Fire and Macro Combat Posture

## Problem and implementation

v2.8.9 already sometimes hip-fired at point-blank range but made ADS decisions using static distance thresholds per gun archetype. v2.9.0 adds `ads-tactics.mjs` and integrates it into both the normal weapon decision and the final safe fire-restoration gate. This is a locomotion-vs-accuracy **macro combat posture decision**, not unconditional scoping.

- Approximate server spread cone from `spreadHip`, `spreadAds`, observed target range, actual shared `spreadDir` disk distribution, and reduced spread when ADS. Choose to hip-fire when geometric torso coverage is adequate and staying mobile avoids the ADS speed penalty (`adsMove`).
- Scoped snipers and DMRs still ADS at useful ranges, shotgun can remain mobile while hip-firing at close range, and guns with no meaningful ADS accuracy gain do not unnecessarily slow movement.
- Fast escapes (slide/sprint), utility use, weapon switch and recovery cancel ADS. A 220 ms transition hysteresis prevents rapid ADS toggling, with exceptions for urgent long-range precision. Motion/camera/aim target remain independently controlled.
- Includes `adaptiveADS` toggle in the popup. Disable it to restore v2.8.9's weapon-class distance-threshold policy, without disabling aim or hip-fire.
- Player-controlled Assist still retains its own ADS activation rules. Neither mode changes weapon damage/spread statistics or directly manipulates server hit detection.
- Extended headless training with `--trainee-primary` (official `ServerPlayer.setLoadout`) and actual `adsShots`, `hipShots` recorded from authoritative server events. Same headless harness was used in both versions to avoid telemetry discrepancies.

## Validation

- **571 / 571 Node tests passed**. Added 9 ADS policy tests; older tests that asserted ADS was compulsory were revised to assert valid shooting or realistic close-range hip-fire. All 5 server modes (TDM, S&D, Hardpoint, BR, Zombies) completed 24-second stress smoke tests without runtime faults.
- Seven paired TDM episodes with matched seed, map, weapon, opponent configuration and duration (55–75s each):

| Metric | v2.8.9 | v2.9.0 |
|---|---:|---:|
| Kills | 16 | 22 |
| Deaths | 7 | 10 |
| Shots | 137 | 164 |
| Hits | 97 | 121 |
| Hits per shot | 70.80% | 73.78% |
| Physical movement reversals | 469 | 458 |
| Runtime AI errors | 0 | 0 |

Note that the old v2.8.9 release did **not** implement `adsShots`/`hipShots` counters; the benchmark harness was equalized for paired replay measurements. The seven-case totals should not be used as a measure of win rate in human PvP. More kills also came with more deaths, and Arena M4A1 fell from 6 to 4 kills. The observed hit-per-shot change is not a controlled proof of improved aim precision.

## Five-mode smoke and real gun posture

- 24-second BR (seed 650311) v2.9.0: **27 hip-fire / 25 ADS shots**, 1 kill and no deaths. Baseline 2.8.9: 16 hip / 29 ADS, zero kills and no deaths.
- 24-second Hardpoint (seed 640304) v2.9.0: 19 hip / 25 ADS, 3 kills; v2.8.9: 0 hip / 38 ADS, 3 kills. HP hit rate declined; adopting hip fire is not automatically an accuracy improvement.
- 75-second Foundry M4A1 (seed 472909): 6 hip / 63 ADS, 9 kills / 1 death; baseline 0 hip / 44 ADS, 5 kills / 1 death.
- 75-second Arena MP5SD (seed 472909): 5 hip / 10 ADS, 4 kills / 2 deaths; baseline 5 hip / 7 ADS, 1 kill / 1 death.
- Foundry Benelli M4 (seed 812377) recorded zero shots in both versions: engagement routing, not ADS, is the likely separate bottleneck. This test proves neither improved shotgun accuracy nor failure of the new ADS geometry.

## Limitations and next steps

- A full Foundry headless match was attempted but timed out without a completed result. It is explicitly **excluded** from the tables.
- The simplified headless CameraRig and game-server instant `aim` state cannot replace LibreWolf rendering/framerate testing, and server bot opponents are not real players. Do not claim 90% evasion or universal K/D improvements.
- Next: measure 60Hz macro state transitions and offensive commitment with shotgun/SMG, so close-range guns can close safely instead of repeatedly repositioning at too long a distance. Validate via full-match and controlled cover scenarios before enabling new movement arbitration defaults.
