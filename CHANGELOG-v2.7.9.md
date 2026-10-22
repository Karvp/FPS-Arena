# FPS Arena Combat Suite v2.7.9 — Defense, Respawn Positioning & Auto Throwables

Based on v2.7.8 Evasion Lab. Client-only LibreWolf extension; FPS Arena server, weapons, collision and damage rules are unmodified.

## Fixed / enhanced

1. **Reload + armor survival:** A single movement arbiter evaluates the *current tick* reload/armor command as well as running server reload/plate timers. Finds a verified hard-covered goal with a multi-contact, camera-angle-aware search, evaluates the risk of the traversed route and takes risk-weighted A* waypoints. Ordinary combat/dodge paths cannot override this while recovering. Imminent explosives and an urgent BR ring still take precedence. Holds real hard cover when already protected. If snapshots temporarily lose opponents while plating, retains recent intelligence; otherwise prevents routine chase into open streets.
2. **Hard-cover geometry:** Fixed `cameraOccluded` to use actual 3D segment/AABB intersection, avoiding false protection behind low cover or beneath overhanging platforms. Multi-angle risk and changing camera heading trigger replanning. Fallback local predictive sidestep is used only when cover is unavailable and a movement corridor is safe.
3. **TDM respawn positioning:** Observes *public* enemy alive/dead transitions and public map spawn candidates; estimates a short window (not privileged exact respawn timings), approaches a navigable outside-spawn staging angle with a LOS to some possible spawns and stops to hold position. Aborts for living nearby opponents, other modes, loot priorities and urgent dodges; does not aim for the spawn point itself or assume one guaranteed spawn.
4. **Automatic throwable (G):** New Autopilot-only `autoThrowables` toggle, on in Autopilot preset. Reads authoritative snapshot `you.thr`, sends a legal single G-key edge with a release/cooldown, ballistic arc selection and checks for geometry, self/friendly splash and ongoing reload, plating, interaction and emergency actions. Stim recovery and enemy-facing frag, impact, cryo, gas and emergency foam supported. Discharger automatic placement/detonation is intentionally excluded: ownership of already-stuck projectiles is not established from the public snapshot. Throw trajectory and blast effects remain subject to authoritative server physics.
5. **Lifecycle:** New recovery, death and throw states are cleared between matches/modes. Training runner accepts `--trainee-throw <id>` and records server-accepted thrown-item events.

## Verification

- `node scripts/build.mjs` generated bundled `page-agent.js` from modular source.
- `node --test tests/*.test.mjs` — **496/496 passed**.
- 5-mode authoritative server smoke, 4 seconds/mode: 0 extension runtime errors.
- TDM stress 3x22-second aligned-seed (Neon, Arena, Foundry): **77.27%** aimed-shot avoidance proxy vs **71.11%** for unchanged v2.7.8; 6 K / 1 D vs 3 K / 2 D. Small-sample, not proof of general improvement or of 90% true dodge probability.
- A 35-second Arena stress smoke with `--trainee-throw stim` yielded **2 server-accepted stim usages**, zero extension errors. Attack throwable decisions have deterministic unit tests and real server G-edge integration tests, but were not observed in the small 3-map match sample. Real LibreWolf PvP testing remains needed.

## Safety / regression limits

- No changes to server hitboxes, enemy stats, weapons, opponent AI or lag compensation.
- Exact throwable landing and respawn positions are inherently uncertain. No false guarantee of 90% dodging.
- A long 70s × 3-map impact-throw benchmark exceeded the allotted execution window and has **no valid completion result**; it is not counted as a pass.
- Manual inputs are not overwritten in Aim Assist; new G commands belong solely to enabled Autopilot.
