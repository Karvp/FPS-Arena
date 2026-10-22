# FPS Arena Combat Suite v2.6.6 — Tactical Action Arbitration

## Code changes

1. `combat-core.mjs`: prevent premature reload top-ups in close-range combat; interrupt a started detachable-mag reload via an authoritative double-switch only when it is worthwhile; maintain existing empty-primary fallback. `planProMovement()` now remembers aperiodic movement windows and reacts to server-observed enemy weapon categories.
2. `camera-tactics.mjs`: history-weighted non-alternating peeks, randomized exposure/travel/hold windows; opponent-gun-specific view-sector exposure while retaining blind-side uncertainty.
3. `threat-intel.mjs`: carry weapon category and range from the published gun ID.
4. `weapon-policy.mjs` and `loot-core.mjs`: BR-specific evaluation of both inventory slots, opportunistic loot windows, guarded against close/long-range aimed contacts and unsafe rings.
5. `agent-entry.js`: pass enemy gun data into the movement planner and keep persistent pro-movement timing state.
6. `tests/combat-v266.test.mjs`: authoritative reload state-machine cases, dynamic peek, gun-specific exposure, and BR upgrade scenarios.

## Known limitations

- No instant cancel of non-shell magazine reloads. Two switches require two 0.4s switch lockouts and interrupt normal gameplay; near-complete reload is intentionally allowed to finish.
- Enemy camera angles and weapon IDs reflect last received snapshots. Magazine and reserve ammunition of opponents are unavailable, so no guaranteed opening is inferred.
- Loot selection and pathfinding remain heuristic; exposed routes, multi-floor obstacles and short ring closures can still fail.
- Browser tests use Chromium with mocked Firefox APIs, not live LibreWolf PvP.

## Verification

Run `node --test tests/*.test.mjs` and `node tools/check-game-compat.mjs /path/to/fps-arena-main`. For popup `python tests/browser-popup-smoke.py`.
