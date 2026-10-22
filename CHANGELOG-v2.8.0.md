# FPS Arena Combat Suite v2.8.0 — Vertical Navigation & Input Reliability

Date: 2026-10-10. Based on v2.7.9 Defense, retaining existing safety and resource arbitration.

## Changes

1. **Multi-level Oil Rig / BR navigation.** Introduced a bounded collision-aware A* over `(x,z,standingHeight)` instead of treating raised platforms as ground cells. Candidate transitions require legal <=0.6 m upward steps and capsule clearance; stair/ramp waypoints are preserved rather than skipping floors. The ring, loot, pursuit and elevated sightline route planners use it. Routes that cannot be proven traversable return `null` rather than blindly crossing a wall or deck.
2. **3D shooter occlusion.** Tactical exposure now checks camera/head-to-target chest lines against the actual map boxes, including floors, decks and overhangs. A roof/floor is not mistaken for a ground-level horizontal wall, nor vice versa.
3. **Less reactive route arbitration.** Path following looks ahead across collision-clear same-floor waypoints while preserving vertical stair steps. Navigation commitments are longer except when urgently escaping the ring, dodging or detecting a block. The loot planner now measures progress by decreasing remaining path arc length: moving back and forth by 0.55 m no longer silently resets the stuck timer. Short snapshot interruptions can temporarily preserve a recently verified BR loot route.
4. **Manual weapon swap.** Player can tap **V** to switch between two equipped weapon slots when not using Autopilot. The key is configurable (V/X/Y/N/backquote/off) in the extension popup. It works even when Aim Assist is switched off; it is a single input edge, ignores typing and held-key repeats and respects server-enforced switch / plate cooldowns.
5. **Aim-but-does-not-shoot.** The final Autopilot arbitration restores an otherwise actionable `fire` input when intermediate cover/peek/navigation arbitration erased it. Visible verified hitbox slices can raise ADS, and valid longer rifle engagements are no longer unnecessarily clipped by preferred *tactical* range. Server range, hitbox LOS, reload, armor plating, throwables, skills and emergency constraints remain authoritative.
6. **Movement telemetry.** Headless arena now separately records forward/back key reversals and *world-space* displacement turns/reversals; camera-relative key flips by themselves are not conclusive proof of a physical U-turn.

## Validation & limitations

- `node --test --test-concurrency=1 tests/*.test.mjs`: **509 / 509 passed**.
- Real FPS Arena `stepMove()` collision checks confirmed an actual Oil Rig route from sea level to the 8 m deck, plus height 8→16 and height 16→24 planning, without teleporting or cutting through the deck.
- Bundled `page-agent.js` headless tests prove the V key generates a valid single `slot` command with Aim Assist off. The regular reload/plate/switch gating remains.
- Official server five-mode 8-second smoke: TDM, S&D, HP, BR, Zombies each had **0 agent errors**.
- Paired 34-second, 4-match stress holdout (`seed=345678`, same maps and opponents) shows more kills and more shots hitting, **but also more key reversals and world-space turns, and one more death**. This is not a general proof of smoother locomotion. BR behavior still sometimes oscillates near unreachable loot/cover and may need path-progress gating/geometry repair in further iterations.
- Prior 90% avoidance target is **not certified**. Simulated headless combat is not a live LibreWolf human-opponent trial.

See `reports/ROUTING-v2.8.0.md` for exact benchmark counts and reproducibility.
