# FPS Arena Combat Suite v2.6.9 — Weapon Recovery + Combat Lab

## Fixed

- If a firearm is selected after a weapon swap and its magazine is empty while reserve ammo exists, Autopilot issues a real reload **after the authoritative 0.4-second switch lock**. This is coordinated with the primary-first policy (Classic / BR) and strongest-wave-clear-slot preference (Zombies).
- Zombie targeting uses a close-range emergency score instead of over-favoring the direction of the existing crosshair. A nearby shootable zombie takes priority over one farther away. Walls are still respected, and hardcoded target ordering does not bypass geometry.
- Existing restrictions on plating, switch cooldown, shell reloads, and emergency sidearm swaps remain in place.
- Popup version display is synchronized to 2.6.9, including the corrected reload policy description.

## Added

- `tools/simulate-all-modes.mjs`: deterministic offline aim/ballistics simulator for TDM, Search & Destroy, Hardpoint, Battle Royale and Zombies.
- The range reuses actual shared FPS Arena source for spread, head-sphere/body AABB intersection and weapon state machine. It assesses both controlled and stress scenarios; results explicitly distinguish hit rate from headshot rate *among hits*.
- `lab/replay.html`: offline browser Match Recorder JSON viewer with spatial playback, player/enemy/zombie positions, HUD information, crate and ring overlays, and event timeline. Open it from the popup or directly in the browser. No recorded data is included in the extension release.
- `reports/SIMULATION_ALL_MODES.{md,json}`: reproducible synthetic benchmark results, plus aggregate diagnostics from the uploaded record (no raw recording included).
- `tests/multi-mode-lab-v269.test.mjs`: regression tests for near-zombie threat, wall occlusion, empty-gun recovery after switching in all five modes, and BR rifle protection.

## Evaluation limits

The user's exported Match Recorder bundle contains 4 TDM records, 1 BR record and 4 short unknown/pending records. It contains no Zombies sample and no server-confirmed per-shot headshot flag. The simulated 90% target does not establish a live multiplayer 90% hit or headshot rate. Full server-side game rooms, multi-client network jitter, moving cover and real user opponents are not emulated.
