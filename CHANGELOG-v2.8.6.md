# FPS Arena v2.8.6 — Goal Progress & Safe Hide Hold

## Fixes

1. **Reload navigation progress watchdog.** Track the minimum remaining distance to the selected cover point; returning to the same point is not progress. Preserve a reachable cover point while making progress, limit commitment to 3.2s and release it after 1.35s without progress.
2. **Safe hide stabilization.** When already within 0.85m of the cover anchor, request zero movement only if all observed threats are blocked by exact 3-D LOS. Active peeking, visible combat, emergency dodge, and map-level navigation are not globally direction-locked.
3. **Safety invalidation.** New target/shooter, ring-invalid destination, removed cover geometry, or reload-state transition resets old cover intent.
4. **Regression scope.** Scope the progress commitment to active reload cover travel, after wider combat-scoped variants harmed kills on Arena. Preserve the v2.8.5 routing and weapon policies otherwise.

## Tests & limitations

- 537/537 deterministic Node test cases pass (7 additional checks).
- Paired 90-second TDM stress simulations on Neon and Arena, seed 472909/472910: kills 21→20, deaths 6→3, physical direction reversals 341→306, forward/back reversals 224→228.
- Full TDM Neon (seed 573221): naturally finished 243.12s baseline vs 231.23s candidate, kills 10→12, deaths 4→6, physical reversals 223→133. Rates should be time-normalized because durations differ.
- Foundry TDM 35s: physical reversals 34→51 (regression); BR Oil Rig 75s: 81→78, same 1/0 K/D. BR does not establish multi-floor/long-match gains.
- `enemyShotDodgeRate` remains a proxy based on incoming aimed shots, not pure dodging probability. No basis for a 90% success claim.
- Simulated on server/headless client, not browser render timing. No proof of a Firefox/LibreWolf FPS gain.
