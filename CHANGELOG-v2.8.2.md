# FPS Arena v2.8.2 — BR Recovery & Airborne Aim

Based on v2.8.1 with no server weapon/hitbox changes.

## Changes

1. BR: recognize high airborne opponents as non-ground threats while selecting urgent opening loot. Do not suppress looting just because a newly respawned opponent is 100 m above the deck. Airborne players within 10 m vertically are still evaluated as normal threats. Opening loot on soft ring rotation is budgeted against reachable actual loot destinations; emergency ring escape still wins.
2. BR flight targeting: use newest valid remote snapshot instead of delayed rendered interpolation, permit diving vertical velocity as high as 34 m/s (reject >42 m/s likely teleports), choose torso first while gliding, predict at short horizon, apply 10 ms damped airborne-only camera steering. This is not projectile ballistics: the game is hitscan, and network delay is modeled only approximately.
3. TDM: remember *transition from at least one visible/tracked living enemy to zero threats*. After 0.45s cleared roster and 0.65s since last shot / 0.8s since last damage, allow recovery maintenance without waiting the ordinary 3.5–5s interval. If enemies are still present, original safety checks apply. Full reload/plate server restrictions remain. Auto Armor is controlled by the existing popup option.
4. Performance: reuse computed BR ring plan across candidates; maintain 60Hz-compatible bounded short candidate lookups.

## Test results and limitations

- 518/518 automated Node test cases passed, including six added tests for this pass.
- Real server-engine headless A/B tested 2 seeds (645321, 987123) against stress opponents, 32s/38s each for TDM Neon and BR Oil Rig. 2.8.2 used valid server inputs and the bundled extension.
- Seed 645321: BR loot interactions 0 → 3; TDM kills 4 → 4, deaths 1 → 0, hits/shots 24/28 → 22/26.
- Seed 987123: BR loot interactions 0 → 0; TDM kills 1 → 1, deaths 1 → 1, hits/shots 1/2 → 1/2.
- Synthetic constant-speed flight model: 34 m/s dive angular error 1.729° → 0.354° using 100ms delayed render and 65ms lookahead. **Not a verified live game hit-rate improvement**.
- Profiling remains mixed: no consistent CPU improvement demonstrated. The new logic uses bounded synchronous scans but performance spikes vary between independent runs. No confirmed improvement in overall battle win rate or real LibreWolf FPS.
- BR airborne targets were not hit in the short headless matches; flight accuracy still needs validation in a dedicated live trajectory encounter before assuming superiority.
