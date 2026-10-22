# FPS Arena Combat Suite v2.8.4 — Camera LOS and Cover Search CPU Hotfix

## Code changes

1. `camera-tactics.mjs`: prune off-ray AABBs using conservative 3D segment bounding intervals before the original precise slab intersection. Occlusion semantics unchanged.
2. `camera-tactics.mjs`: remember `null` cover searches for 0.8 seconds if target and reload state are unchanged. Recheck immediately when enemy or recovery mode changes, and preserve positive-cover refresh cadence.
3. `tests/camera-cache-los-v284.test.mjs`: 2,500 randomized exact-geometry parity checks and negative-cache invalidation/regression tests.

## Excluded experimental changes

Extended strafe commitment and open-ground heading locks were tested against 2.8.3 in seeded TDM. They reduced some reversals but could sharply reduce kills or increase reversals on alternate maps/seeds. They are intentionally **not enabled or shipped**.

## Verification

- 525/525 deterministic JS regression tests pass with `node --test --test-concurrency=1 tests/*.test.mjs`.
- Same-seed 90s Neon + Arena stress headless A/B: kills/deaths and actual world reversals exactly match 2.8.3; >16ms AI ticks fall 17 to 8 across 10,800 ticks.
- BR CPU and long-match parity were not fully verified under this pass. Browser UI FPS not measured. Never interpret server headless timings as LibreWolf FPS.
- The user-requested elimination of all useless TDM reversing is **not yet achieved**; reject unproven motion policies rather than silently weakening combat.
