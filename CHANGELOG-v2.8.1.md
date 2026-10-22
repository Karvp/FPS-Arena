# FPS Arena Combat Suite v2.8.1 — Cooperative Navigation Performance

Date: 2026-10-10. Based strictly on v2.8.0; no weapon/server/hitbox changes.

## Implementation

1. **Yieldable multi-layer A*.** `multiLevelRouteSteps` preserves state between up-to-64-node work slices; `multiLevelRouteProgressive` and `gridRouteCooperative` resume across client ticks while legacy `multiLevelRoute`/`gridRoute` continue to return synchronously for tests/offline callers. Stale planner requests are invalidated if start/goal change materially. BR ring, BR loot, pursuit and precision sightline paths use resumable requests with safe existing fallbacks.
2. **Per-map collision index.** `mlSpatialIndex` groups collision boxes by static 2D location using a WeakMap. Invalidates if `map.boxes` identity/length changes. State expansions and segment validity inspect overlapping nearby boxes. Per-search surface-choice cache avoids repeated standing-height evaluation at the same grid cell/reference level.
3. **No-path backoff for TDM spawn staging.** Previously `!memory.target` caused route search to repeat up to 60 times/second while there was no safe staging point. Cache the miss for 1.4s; preserve the original weighted risk route and enemy-cover candidate rules.
4. **Headless frame-time diagnostics.** Optional `node lab/arena/train.mjs ... --profile-agent` records elapsed *real* time for the patched `simTick()` callback (mean, p50, p95, p99, max, >16ms).
5. **No forced movement lock.** Longer open-ground steering locks were tried and rejected because they did not consistently lower world-space reversals. Movement remains able to react to shots, cover and emergency ring changes.

## Validation and non-goals

- Automated JS suite: 512/512 passing, including cooperative-vs-synchronous Oil Rig path parity, planner invalidation and failed-respawn-route cache.
- 4 authoritative server-engine headless matches, stress opponents; seed 345678, 32 s per match, TDM Neon/Foundry + BR Oil Rig, each side same seed and enemy options.
- AI ticks >16 ms: **74/7,680 (2.8.0) vs 2/7,680 (2.8.1)**, p99 TDM 92.2/84.3ms → 5.2/3.3ms. Worst observed tick 347.3ms → 28.8ms.
- TDM physical near-opposite world turns: 82 → 53. Sampled half-second U-turns in >3.25m obstacle clearance: 26 → 14. **Not zero.**
- TDM kills: 7 → 3 (regression); deaths: 1 → 2 (regression). This is a performance-focused experimental release, not a validated competitive improvement.
- No actual browser rendering benchmark, visual frame capture or verified 90% bullet-avoidance claim.
