> **Research checkpoint C35-Y (2026-10-14):** See [`C35Y-ENGINEERING-REPORT.md`](C35Y-ENGINEERING-REPORT.md). New opt-in `--c35y-explore` enables 60/20/20 safe one-tick randomized TDM trials; production agent unchanged, neural policy not approved.

## C35 research technical pilot — randomized, safe, real-match actions (no neural promotion)

C35 combines historical C21 **1/3 per-encounter three-arm randomization**, C16 symmetric safety, and C34-style public snapshot/server label separation in actual `Game.step()`. Its preregistered **90-match** pilot yielded 1,193 offers, but only 19 hit-positive complete windows and 395 interrupted assignments. **This is an engineering PASS / causal-learning-sufficiency NO-GO**, not a neural dodge improvement. Source, raw pilot telemetry, independent verifier and reproducibility instructions are in `C35-ENGINEERING-REPORT.md` and `CHANGELOG-v2.9.11-C35.md`. Production `page-agent.js` unchanged.

---

## C34 research checkpoint — real-match observations (no policy deployment)

C34 records pre-decision client-visible world-frame encounter state and static cover geometry during real headless `Game.step()` matches; server truth/outcome enters a **separate retrospective audit**. 54 preregistered matches plus a transparent 18-match adaptive training addendum produce 3,526 complete 1.8-second windows. A validation-selected factual-hit **logistic** predictor improves sealed-test Brier over training-frequency baseline (0.042082 vs 0.048766), while 3 neural MLP candidates lose validation selection. **This is NOT a demonstrated causal dodge-policy improvement.** Production is unchanged. Read `C34-ENGINEERING-REPORT.md`, `CHANGELOG-v2.9.11-C34.md`, and `scripts/evaluate-c34-real-state.py`.

---

## C32 research checkpoint — observable cover and engine movement (NO production promotion)

C32 runs two independently registered, server-authored controlled 1v1 encounter datasets (2,520 scenes, 7,560 arm outcomes), with actual `stepMove()` collision and `fireWeapon()` damage. Neural 14→32→24→3 models are trained but **lose validation selection** to simple rules in both studies. A separate B study corrects the 72.7% positive-offset imbalance in A; a static cover-visibility heuristic, not neural, wins B's frozen validation. Both holdouts are audited, 974/974 AI and 733/733 upstream tests pass. Production remains unchanged.

Read `C32-ENGINEERING-REPORT.md` and `CHANGELOG-v2.9.11-C32.md` for hard limitations and reproduction steps.

---

## C31 research checkpoint — multi-weapon opponent transfer and falsification

Full controlled-gun TDM research study: 36 transfer games plus 108 matched-policy games across six **opponent** primaries. Frozen C30 network now chooses left/right, but is predominantly weapon-conditioned and does not outperform the always-left rule. No production AI changed. See `C31-ENGINEERING-REPORT.md` and `CHANGELOG-v2.9.11-C31.md`.

## Research checkpoint C29 — model transfer stop gate

**C29 is a full-scale feasibility/falsification study, not a neural policy release.**
48 authoritative headless matches × 105 seconds (84 simulated game minutes), 329 eligible offers,
49 supported neural actions (**14.9%**, 95% match bootstrap 10.4–19.6%) versus
80% precommitted minimum. The frozen C28 model **FAILS** the transfer gate;
therefore the 648-match three-policy efficacy study has **not** been run.
Read `C29-ENGINEERING-REPORT.md`, `reports/c29/long-study/TRANSFER-AUDIT.json`,
and `scripts/run-c29-research.py`. Production Autopilot stays unchanged.

## C27 — Temporal Threat Generalization (research-only)

C27 adds a genuinely trained 3-step GRU predictor and a preregistered 36-match factorial holdout across `stress`, `mixed`, and `official` simulated opponents at 35/125 ms synthetic snapshot delays. The validation-selected temporal logistic improves descriptive holdout Brier and log loss, but whole-match confidence intervals still include no advantage; GRU was not chosen by validation. **No production actuation change and no neural deployment.** See [C27 engineering report](C27-ENGINEERING-REPORT.md), `scripts/temporal-threat-gru-c27.py`, and `reports/c27/study36/`.

# C15 — Adaptive Opportunity Probe Scheduler (2026-10-12)

This checkpoint extends C14 on the **uploaded user main-engine snapshot**, retaining unmodified production `page-agent.js`. Rejected safety probes retry after 0.12 seconds, successful opportunities keep their 0.9-second offer cooldown and all C14 safety gates. In 12 paired **control-only** scenarios, legal offers increased from 6 to 18 with identical server gameplay. These offers are not evidence of improved combat. Separately, randomized treatment/control experimentation remains too sparse to train a policy.

Reproduce with `node --test --test-concurrency=1 tests/*.test.mjs`, `node lab/arena/source-main/test/run.js`, `python scripts/run-c15-study.py --workers 3`, `node scripts/analyze-c15-study.mjs`. Standalone execution requires Node 22 and Python 3. `--c15-dataset` enables research-only instrumentation; `--c14-force-arm` marks explicit interventions as nonrandomized diagnostics. Details: `CHANGELOG-v2.9.11-C15.md`, `C15-ENGINEERING-REPORT.md`, `reports/c15/study/analysis.json`.

---

# C9 — Ballistic Engagement Research (2026-10-12)

This bundle extends C8 with a main-weapon-aware static ballistic envelope. Main game source is located in `lab/arena/source-main` and the pinned legacy simulator remains under `lab/arena/source`. Research flags are **off by default**; no real browser actuation is enabled.

```sh
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node scripts/evaluate-c9-geometry.mjs
node scripts/export-c9-atlas.mjs
python scripts/evaluate-c9-main.py
```

See `CHANGELOG-v2.9.11-C9.md` and `reports/c9/`. The estimator describes static unoccluded bullet spread and does not predict match hit rates; safe route gates remain unchanged.

---

## C7 — FPS Arena uploaded main engine synchronization (headless research only)

The uploaded FPS Arena repository ZIP has been incorporated verbatim into `lab/arena/source-main/`. Run `node lab/arena/train-main.mjs` for real-main engine simulation; original C6 simulator remains `lab/arena/train.mjs`. Main 38-weapon roster differs from old 75-weapon research fixture. See `CHANGELOG-v2.9.11-C7.md`.

## v2.9.11 — Engagement Opportunity Lab (experimental)

The v2.9.11 Tactical Director can locate the first weapon-range + 3D LOS waypoint along a verified A* route and estimate *potential* time to fire earlier than the terminal flank location. Server-authoritative simulations now record actual `firstShotAt` and `firstHitAt`. Profiles `director-engagement-shadow-lab`, `director-engagement-lab`, and headless-only `director-engagement-trial-lab` are provided for research.

**Default LibreWolf Autopilot remains unchanged.** The sampled matched-seed evaluations showed no statistically defensible improvement in kills, survival or time-to-first-shot, and experimental trial was too conservative to take control. See `reports/v2911/RESEARCH-v2.9.11.md` and `CHANGELOG-v2.9.11.md`.

## v2.9.10 — Opportunity-Guarded Tactical Director (experimental)

Reinforces the v2.9.9 Tactical Director lab with whole-site geometric screening before the two A* calls, a public-observation target-range progress check, imminent firing-window protection, conservative time-to-fire and heading disagreement vetoes, distinct low-yield evidence confirmation, and rate-limited **per-reason** diagnostic events.

**Live LibreWolf behavior is unchanged.** The active option remains gated behind `globalThis.__FPSARENA_HEADLESS_LAB__ === true`, with the new `director-opportunity-lab` profile. **No claim of proven combat gain.** Prior wide active planning suppressed shots on Arena; a first guarded natural-end Foundry trial also suppressed shots until independent-evidence gating was added. See `CHANGELOG-v2.9.10.md`, `reports/v2910/VALIDATION-v2.9.10.json`, and `reports/v2910/RESEARCH-v2.9.10.md`.

Reproduce: `node scripts/build.mjs`, `node --test --test-concurrency=1 tests/*.test.mjs`, `python scripts/evaluate-opportunity.py --quick`. Other existing documentation is below.

## v2.9.9 Research Patch: Macro Combat Tactical Director 3.x

A bounded option-utility receding-horizon planner is integrated behind headless-only `director-shadow-lab` / `director-active-lab`. The normal LibreWolf release policy remains unchanged. See CHANGELOG-v2.9.9.md.

# FPS Arena Combat Suite v2.9.8 — Goal-Aware Tactical Arbitration Research

**Default gameplay unchanged.** v2.9.8 adds movement goal provenance, same-target low-yield cover-cycle arbitration and action-outcome attribution. `goalAwareShadow` is observation only; `goalAwareActive` runs only when explicitly selected by the headless lab. Do not enable as general gameplay policy: paired simulation did **not** show a combat gain. Tests: 631/631. See `CHANGELOG-v2.9.8.md` and `reports/v298/REPORT-v2.9.8.md`.

# FPS Arena Combat Suite v2.9.7 — Outcome-Aware Macro Diagnostics Lab

The opt-in Macro Combat 2.0 controller improves short-weapon range closing when camera cover behavior would otherwise block safe approach. Enable **Macro Combat 2.0 (thử nghiệm)** in the popup while using Autopilot. Defaults off. Four explicit phases: approach/engage/reposition/recover; never hijacks dodge, reload, plating, ring or objectives. See `CHANGELOG-v2.9.2.md`, `CHANGELOG-v2.9.1.md` and `reports/MACRO-COMBAT-v2.9.1.md`.

**2.9.2 research status (retained):** an isolated hard-cover corridor prototype was tested and rejected for normal play because it reduced kills. The default settings and original 2.9.1 macro feature are unchanged. See `reports/MACRO-APPROACH-v2.9.2.md`.

# FPS Arena Combat Suite v2.9.0 — Adaptive ADS / Hip-Fire

## New in v2.9.0

Autopilot now chooses ADS versus hip-fire based on actual weapon spread, target distance, movement speed penalty and emergency actions. It is **not** required to scope for every shot. Configure **ADS thông minh** in the popup; disable it to restore the previous class-distance posture logic. Human Aim Assist activation remains independent. Validation: 571/571 tests; see `reports/ADS-v2.9.0.md` and `reports/ADS-v2.9.0-Validation.json`. Macro target stability from v2.8.9 stays enabled in TDM.

# FPS Arena Combat Suite v2.8.6 — Firefox / LibreWolf WebExtension

## v2.8.6 — Goal Progress and Safe Hide Hold

- On reload-to-cover travel, retain a **3D-verified and ring-valid cover waypoint** while the remaining path distance actually decreases. Do not treat motion back-and-forth as progress. Release the waypoint after ~1.35s without progress, at 3.2s max commitment, or immediately on a new enemy/target, lost cover, or ring invalidation.
- **Do not** apply progress-commitment to ordinary combat peeking or visible engagements: broader experiments caused fewer kills on Arena.
- When within 0.85m of the hide destination and *all observed enemies' 3D sightlines are blocked*, request no further positional micro-correction. Peek cycles and emergency dodge still take precedence. Do not idle where any opponent has an unobstructed shot.
- Seven new deterministic tests; paired 90s simulations and a naturally finished Neon TDM paired match plus short Foundry/BR smoke tests. Improvement is **mixed** by map: Foundry's short-run physical reversals increased. Do not claim elimination of oscillation, 90% true evasion, or browser FPS gain.
- Full benchmark breakdown: `reports/GOAL-MOVEMENT-v2.8.6.md` and `reports/VALIDATION-v2.8.6.json`.

## v2.8.5 — Cover Arrival Stability & Replay Diagnostics

- Preserve the camera-cover arrival state briefly across small real position corrections (1.35m activation; at most 1.95m and 1.1s dwell), but **only** while the actual observed enemy-to-player segment is obstructed by a 3D map solid. A new cover anchor/target/reload phase invalidates the old state.
- Avoid the repetitive `peek-reposition-cover` → `camera-peek-hide` state transition near a cover edge without freezing combat strafes, chase routes, dodge commands or aim/fire decisions.
- Added `tools/analyze-motion-replay.mjs` to count physical displacement reversals and return-to-origin candidates from recorded replays. Metrics at 0.5s sampling are NOT identical to 60Hz movement transitions; neither is automatically a dodge success rate.
- Six paired 75/90s TDM stress episodes (Neon, Arena, Foundry; 2 seeds): combined kills 31→40, deaths 6→6, tick-level direction reversals 575→526; three episode-level reversal counts regress, so the motion issue is **not** fully solved. Additional short profile found no CPU regression. See `reports/COVER-ARRIVAL-v2.8.5.md` and detailed validation JSON.
- Simulated a 55s BR smoke episode without errors; full-length BR combat and complete candidate natural-finish TDM holdout are not validated.

## v2.8.4 — Safe Cover/LOS Performance Hotfix

- Exact 3D segment-vs-box occlusion keeps the same slab test, but first skips obstacles whose XY/ground-projected bounding intervals cannot intersect the firing ray. No changes to weapon stats, aim validity, server hit detection, or fire cadence.
- The camera-cover planner caches *unsuccessful* searches for 0.8 seconds while the target and reload state remain unchanged. A new target or reload transition invalidates the cache immediately; valid cover still refreshes on the original 1.2-second schedule.
- Tested 2,500 randomized 3D segments across 330 obstacles for parity with an independent exact slab reference, including vertical floors. All 525 deterministic JS tests pass when run with `--test-concurrency=1`.
- Long-match follow-up included ablation of heading lock and strafe cadence. Those variants caused inconsistent kills/deaths on independent TDM seeds and **are not enabled**. Physical oscillation remains a known issue.
- Paired 90-second TDM stress run, seed 472909: identical K/D and world reversals on Neon/Arena, with fewer >16ms AI ticks (17→8) and lower tail latency. Node.js simulation is not a LibreWolf render FPS measurement. See `reports/PERFORMANCE-v2.8.4.md`.

## v2.8.3 — Per-Gun Long-Range Threat Routing and Evasion

- Reconciles AI tactical detection with real server **`maxRange`** rather than a universal 65–70 m threat cutoff. Aiming opponents up to their gun's legitimate hitscan reach can trigger 3-D cover/route planning; fully blocked sightlines do not.
- Models **all 75 ordinary firearms** using each gun's damage/falloff, spread, cadence, magazine and ADS handling. Tactical counterplay is weapon-specific; movement remains collision/zone checked and server-authoritative.
- Autopilot automatically acquires enemies out to the selected weapon's server reach (400 m for sniper, 300 m for DMR, 200 m for most rifles). Aim Assist still respects the manually selected distance. Valid far-range hitscan firing is no longer prohibited by the shorter *preferred* combat distance.
- Calibrated geometry experiments use 75 guns x 10 distances x hip/ADS/tracking stress and 6,000 gun-versus-archetype decisions. This is an **analytic / deterministic spread simulation**, not proof of 90% evasion or real-human hit rates.
- Per-gun threat utility is quantized and cached (not the actual bullet-hit geometry). No new per-frame full-map search was added; measured p99 and spikes remain mixed on short headless samples. See `CHANGELOG-v2.8.3.md` and `reports/WEAPON-DUEL-v2.8.3.md`.

## v2.8.2 — BR Opening Loot, Respawn Maintenance, Airborne Aim

- **BR landing/loot:** airborne opponents more than 10 m above the loot plane no longer count as grounded close-range threats, and initial crates are evaluated against the actual safe-route time budget, not a global proxy. Grounded enemies and unsafe ring excursions remain guarded.
- **Glider targeting:** on airborne BR contacts, start from the most recent authoritative remote snapshot, allow verified up-to-34 m/s vertical dive velocity, predict short-term fall and prefer torso hits for reliability. Add light 10 ms angle damping for airborne autopilot targets only. Grounded aim and hitbox handling are unchanged.
- **TDM recovery:** when enemy roster has *transitioned from present to entirely absent*, allow quick reload and plating after a short stable gap and recent action safety checks. Threat reappearance cancels the opportunity. Auto Armor must still be enabled in the popup for plating.
- **CPU protection:** one ring-plan result is reused across candidates in a loot decision; no new per-frame A* or excessive raycasts.
- **Validation:** 518/518 JS tests; headless seeded TDM/BR A/B comparisons and a synthetic falling-target angular-error benchmark. These do not establish live-browser FPS or a human-opponent hit rate.

See `CHANGELOG-v2.8.2.md` and `reports/BR-RECOVERY-AIM-v2.8.2.md`.

## v2.8.1 — Lower-stutter pathfinding (performance-focused)

- Expensive multi-floor A* searches are resumed over 64-node slices across subsequent game ticks instead of monopolizing one simulation frame; this preserves the route found by the existing 3D engine. BR ring escape keeps an immediate fallback while searching.
- Static geometry gets a per-map collision-box spatial index; repeated stair checks reuse candidate standing-height results.
- Respawn-staging routes cache failed searches (a previous bug retried up to 60 times per second). Respawn positions still honor the candidate safety checks and weighted route planning.
- Headless trainer supports `--profile-agent` for actual agent callback timing percentiles and >16ms tail count (not a browser FPS benchmark).
- **Independent 4-match stress comparison:** AI ticks over 16ms dropped 74 → 2 / 7,680. Extreme sample fell from 347.30 to 28.81 ms; performance varies by machine and seed. **Combat regression remains:** TDM kills 7 → 3; do not mistake this release for a combat effectiveness upgrade. TDM open-space half-second near-U-turns 26 → 14, not zero.
- Details: `CHANGELOG-v2.8.1.md` and `reports/PERFORMANCE-v2.8.1.md`. Previous features including V weapon swap remain.

## v2.8.0 — Multi-floor route, V swap, verified-fire recovery

- Actual `(x,z,height)` A* routing across Oil Rig stairs/decks, exact 3D tactical line occlusion and route arc-length stall detection.
- Human **V** key swaps two equipped guns once per press even with Aim Assist disabled; configurable in popup.
- Autopilot restores valid shots erased by late cover/peek arbitration without bypassing reload, plating, occlusion or game firing limits.
- `509/509` headless tests passed. Multi-seed combat and movement still require real-browser validation; key and physical reversal rates are not consistently better.
- Full detail: `CHANGELOG-v2.8.0.md` and `reports/ROUTING-v2.8.0.md`.

## v2.6.8 — Lean-aware hitbox targeting

- Targets leaning left/right with the **actual server-side hitbox geometry** from `server/combat.js`: head sphere shifts by `LEAN.offset × lean`, while the body AABB shifts by **half** that amount. This corrects the old torso aim offset and improves shots during Q/E lean.
- Tracks successive server snapshots (`pl[].ln`) and bounds short-term lean extrapolation to the game's 7 lean-units/s speed. Abrupt left/right switching favours the **wider body** rather than trusting an unstable predicted head position.
- Uses the actual collision entry surface for line-of-sight (server head sphere/body AABB) and falls back to an exposed body if an enemy's head is behind cover; rejects completely obscured targets.
- ESP head markers also account for lean; no modifications are made to the game server, recoil/spread, weapon stats, or network packets.
- Verified against the provided FPS Arena source and new tests for ±lean, head/body, stance, slide, Q/E reversals and partial cover. This is a **model** of server geometry, not a guarantee of hits under ping, interpolation, spread or target motion. Live multiplayer LibreWolf testing remains outstanding.

Source code and reproducible release for the FPS Arena *web* game, upgraded for the user's October 9, 2026 `fps-arena-main(1).zip` snapshot.

## New in v2.6.7 — Reliability and recorder repair

- **Zombies Autopilot recovery:** Fixed a missing `preferredZombieSlot()` definition in the bundled page agent that caused an exception in Zombies. Reinitializes per-match navigation memory and retries isolated tick errors instead of permanently disabling Autopilot. Invalid input always falls back to game input.
- **Battle Royale:** Start next-zone rotation with a more conservative travel estimate and lead margin; urgency and collapsing barriers take precedence over evasion, cover peeking and loot. Cannot promise survival if no route exists.
- **Smooth movement:** A local 140ms anti-oscillation filter prevents transient forward/backward key reversal; zero target means stop, not accidental baseline key movement. Urgent ring escapes bypass smoothing.
- **Recorder repair:** Build now actually includes `match-recorder.mjs` (missing in v2.6.6). Telemetry messages are serialized to ensure `start` precedes `sample`. Records all supported game modes, up to 30 most recent matches, 1800 samples and 800 events each; autosaves every 8 seconds and on match end. New **Export all matches** button creates one JSON for analysis. Clearing history does not switch off recording.
- **Validation:** 409/409 tests and 41/41 game structural checks; further direct live LibreWolf tests remain necessary.

## Previous v2.6.6 — Reload counterplay, aperiodic peek, opponent weapons, BR opportunistic loot

- **Close-contact reload discipline:** With remaining rounds, do not initiate a magazine top-up when an enemy is inside the configured close-danger range (default 10 m). A partly loaded shotgun can interrupt shell-by-shell reloading by firing. An already-started detachable-magazine reload cannot be cancelled by `fire` according to authoritative `stepWeapons()`; when a close threat appears **and the remaining reload exceeds 0.9 s**, Autopilot performs a validated two-switch cancellation (approximately 0.8 s combined switch lockout) and returns to the loaded primary. If reloading is nearly complete, it finishes instead. Empty primary guns still trigger Primary Reload First; emergency sidearms remain close-only.
- **Non-periodic peek:** `peekCycle()` no longer automatically alternates left and right or pauses every fourth cycle. A local xorshift stream selects sides with history-weighted probabilities, short/medium/occasionally long hidden holds (~2.2–8 s), variable reposition and exposed-burst windows, and immediate retreat after confirmed short shots. The fallback `planProMovement()` now also persists a randomized side/timing window rather than using a fixed modulo clock. Hard-cover, line-of-sight and game geometry validation still apply, and dangerous cover-exposure events may abort peeking.
- **Weapon-sensitive opponent risk:** Server-provided weapon IDs are mapped to actual `shared/weapons.js` categories. The yaw/pitch exposure model increases risk for near shotguns/SMGs, long-range snipers/DMRs and sustained LMG sightlines; its risk never falls to zero. `planProMovement()` prefers distance against shotguns, lateral reposition or cover against visible snipers, and cover against LMG lanes. BR push refuses a straight charge through a sniper's live sightline. No opponent magazine counts are invented.
- **Battle Royale loot opportunities:** A distant hostile's mere existence no longer vetoes all pickups. Loot still requires an allowed current/next ring, no gas damage, no immediately close/ADS attacker, and avoids visible ADS snipers/DMRs/LMGs at long range. A BR-specific loadout scorer evaluates **both** inventory slots and requests switching to the weaker slot before a worthwhile pickup, preventing accidental replacement of a stronger primary. Crates are deprioritized when already sufficiently equipped; obtaining ammo and meaningful firearm upgrades remains worthwhile.
- **Validation:** 403/403 automated tests, 41/41 structural checks against uploaded FPS Arena source, and Chromium popup smoke. These are isolated/simulated checks and do not demonstrate a PvP performance gain or a live LibreWolf multiplayer run.

## Previous v2.6.5 — Zombie weapon upgrades and match telemetry

- In Zombies, a weak primary pistol no longer forces the bot away from a substantially better weapon in slot 1. A pre-pickup slot check protects stronger weapons.
- Opt-in Match Recorder retains local structured JSON telemetry at 2 samples/s, up to 30 matches as of v2.6.7. Export the latest or all matches from the popup. No video, microphone or external data transfer.
- Recorder stays off until manually enabled; the prior presets, custom domains and fail-open input boundary are unchanged.

## Previous v2.6.4 — Camera-aware tactical positioning

- Reads the **server-provided opponent yaw, pitch, ADS flag and position**, projects the camera ray in the actual FPS Arena world convention (`yaw=0` faces negative Z; positive pitch looks up) and estimates expected firing-sector exposure. An opponent may rotate and snapshots are delayed: a blind side gets lower *relative* risk, never zero risk or guaranteed invisibility.
- The existing threat-aware A* now uses the 3D camera analysis rather than a yaw-only approximation. If a static wall actually blocks chest-height sightlines, the route gains a real cover advantage; the bot does not interpret an out-of-FOV point as hard cover.
- **Reload cover:** after the resource state machine requests a main-weapon reload, the movement arbiter can move toward a verified protected position or crouch in cover. An urgent Battle Royale ring rotation, explosive dodge, unarmed supply retrieval or zombie kiting retains priority. The gun continues reloading; the feature does not alter `stepWeapons()`.
- **Surprise peek:** searches both exposed edges of real cover for line of sight. The state machine does `hide → move to firing lane → short burst → retreat → hide`. Lateral side switches when both exits exist. A deterministic local PRNG varies durations; v2.6.6 replaced the every-fourth-cycle long-wait rule with non-periodic sampling. Time for actually reaching the peek lane is separate from time spent exposed.
- A safe fallback keeps normal combat when there is no legitimate cover/peek angle. Planner caches are revalidated; long holds are not restarted just because normal map replanning occurs. A try/catch in `Input.sample()` still returns unmodified game input if any runtime exception escapes.
- Popup switches: **Camera Intelligence**, **Reload Cover**, **Surprise Peek Long Delays**; configurable separately. Autopilot remains off by default. Existing custom site support (including Vercel), primary gun first, Zombie routing, BR ring safety, and weapon intelligence remain.

**Validation:** `node --test tests/*.test.mjs`, `node tools/check-game-compat.mjs /path/to/fps-arena-main`, and `python tests/browser-popup-smoke.py`. Tests are deterministic simulations, not evidence of optimal PvP performance. Opponent recoil, full client visibility, floor-to-floor occlusion and network jitter can reduce accuracy. **Not yet tested in a live LibreWolf match.**

## New in v2.6.3 — Live tactical weapon scoring

The v2.6.2 75-weapon evaluation now informs **live Autopilot decisions**. `weapon-policy.mjs` derives the situation from the current distance, hostile pressure, mode, health, ammo and line of sight and evaluates the equipped primary weapon with `evaluateWeapon()`. Its recommendation adjusts weapon-specific combat spacing in `weaponProfile()` and therefore the tactical movement planner. The live policy is enabled by the existing **Weapon tactics** checkbox; a higher heuristic score never forces a shot, silently changes weapon stats, or overrides server movement/weapon rules.

Gun pickups in BR/Zombies now respect the actual **server replacement rule**: using a ground gun replaces the *equipped slot* when both slots are full, not the lowest rarity. The bot protects its equipped primary; while a sidearm is selected it only approaches a replacement with a sufficient portfolio-score improvement over the current sidearm (comparing 8 m, 30–35 m, and 85–90 m or Zombie-specific ranges). A vacant secondary can be filled normally. This is intentionally conservative; it is not an unrestricted auto-loadout optimiser.

**Non-negotiable constraints:** keep the main weapon equipped when loaded, immediately reload a reloadable empty primary (except very close emergencies), restrict automatic sidearm switching to user-defined close range (default 10 m), maintain Zombie kiting separation, and always prioritize urgent BR barrier escape.

**Validation:** `node --test tests/*.test.mjs`, `node tools/check-game-compat.mjs <game-root>`, and Chromium popup smoke test. The 32-scenario static report is heuristic and **does not imply measured win rates**. Not yet verified in a live LibreWolf multiplayer match.

## Previous: v2.6.2 — Exhaustive weapon-priority evaluation (diagnostics only)

- Adds a **per-weapon scenario matrix** for all 75 usable/non-skill firearms from the authoritative `shared/weapons.js` catalog. 32 battle contexts each across Classic (TDM), Zombies and Battle Royale = **2,400 weapon assessments**.
- Adds **2,775 unique head-to-head pair comparisons** and 75 weapon-policy regression tests for real `manageResources()` / `stepWeapons()` decisions across all three modes, plus 75 individual weapon cadence/round-counting tests. The score is a *heuristic diagnostic index*, not a measured hit rate or win probability.
- Scenario axes: close/mid/long range, target health, magazine/reserve, line-of-sight/cover, multiple enemies, pressure, low health, crate exploration, and urgent ring rotation.
- Reproducible artifacts: `reports/WEAPON_PRIORITY_REPORT.md`, `reports/weapon-priority-scenarios.csv`, `reports/weapon-pairwise.csv`, and `reports/weapon-priority-results.json`. Regenerate with `node scripts/evaluate-weapons.mjs`.
- This is an **evaluation update**, not a new live weapon-switching policy: Primary Reload First and the 10m sidearm emergency threshold remain unchanged. It is safe to inspect weapon rankings without silently changing player input behavior.

## Hotfix v2.6.1 — Null navigation goal crash

- **Fixed confirmed runtime crash**: `TypeError: state.goal is null` in `page-agent.js` inside `Game.simTick() / Input.sample()` when a sniper has an occluded target but no valid precision-sightline destination. Reproduced against unmodified v2.6.0 and fixed in v2.6.1.
- Uses a dedicated sniper-sightline cache; ordinary pursuit routes are tagged and validated before comparing destination coordinates. BR ring route cache also guards invalid destinations.
- Adds a fail-open input boundary: an unexpected Combat Suite runtime error pauses the automatic controller and returns the game's original sampled input, rather than throwing out of the game's simulation tick. Re-enable in the popup only after checking the error.
- The `annihilator.glb` HTTP 404 reported by the game is a separate missing/deployed game asset, not caused by this extension; it is not fixed by this hotfix.
- Integration tests simulate a fully blocked sniper sightline and an injected geometry failure, verifying both null-goal recovery and fallback to the original game input. Actual LibreWolf multiplayer testing is still needed.

## Highlights

- Keeps the **default Vercel domain** `https://fps-arena-rosy.vercel.app` and both localhost options.
- Popup allows **custom HTTPS origins** with per-domain optional host approval, runtime content-script registration, and removal.
- Adapts target selection for BR's four numeric teams using authoritative `you.tm` and correct squadmate exclusion.
- Avoids hijacking scorestreak/chopper/predator/missile camera views, airborne insertion and incapacitated players.
- Preserves the game-input `streak` control, and leaves all automatic features disabled by default.
- Retains Aim Assist, predictive targeting, Triggerbot, recoil compensation, ESP, radar, dodge prediction, combat decision logic, movement planning, 2D navigation, weapon/armor management and grenade guidance.

## Threat-aware tactical routing (v2.5.8)

- Observes **enemy shot events** and current weapon IDs to estimate *fire pressure*, not exact magazine ammunition. Remote snapshots do not disclose opponent mag/reserve/reload state. No estimate can turn an exposed enemy into a guaranteed safe corridor.
- Predicts opponents' positions from two recent server snapshots (bounded extrapolation); grades candidate positions for potential aim direction, visibility through static cover, explosives, and nearby zombies.
- Uses a **bounded, cached 2D risk-weighted escape planner** with travel cost and exposure along the entire route. If geometry is blocked or no viable path exists, uses the previous collision-aware dodge fallback.
- `gridRoute()` supports risk-weighted A* for **BR early ring rotation and loot paths**. During urgent ring escape, risk weighting is disabled: survival requires reaching the safe zone in time.
- Every fallback retains conservative rules. Hitscan bullets cannot be dodged after impact, and all opponent-ammo information is uncertain. Only applies on opted-in Autopilot (`dodge` and `smartCover`).
- Includes optional toggles **Threat-Aware Routing** and **Opponent Fire-Pressure Inference**. Existing website permissions and presets are preserved.

## Weapon-aware Autopilot (v2.3+)

The new `weapon-tactics.mjs` reads the **real weapon objects** from the game's
`LocalPlayer.weapon` (populated from `shared/weapons.js`): category, engagement
range, reload time, magazine size, ammo reserve, `auto`, `burst`, `shellReload`,
`infinite`, `melee`, `sniper`, recoil and movement statistics. It does not
write authoritative weapon stats or require modifications to the game server.

- **AR**: mid-range, ADS beyond very close range, strafe and reposition.
- **SMG**: shorter approach distance, fast flanking, hip fire up close.
- **Shotgun**: close gap and stop shooting beyond effective range; optionally
  interrupt shell-by-shell reload to fight immediate threats.
- **DMR/Marksman**: hold longer range; reset semi-auto input between shots.
- **Sniper**: maintain long sight lines, retreat when pushed, tap-fire with reset.
- **LMG**: prefer established lines/cover, reload out of sight, avoid unnecessary strafing.
- **Pistol**: sidearm engagement range and semi-auto trigger pulses.
- **Melee/unarmed**: never try to reload; melee closes to reach distance.

**Reload arbitration:** for an EMPTY primary with reserve, start reload immediately except when a loaded sidearm is required at emergency-close range; for partial-magazine top-up, reload after verified cover or a quiet window. In Zombies, estimate the relative closing speed while retreating and allow emergency reloads when both guns are dry; suppress empty-gun fire edges because the game otherwise starts an implicit reload; switch to a
loaded secondary against an immediate close threat (or when no reserve);
proactive reload at category-specific magazine fractions only after a quiet window;
block the trigger during magazine reload; preserve manual actions in Assist;
avoid pathfinding toward opponents while reloading. Autopilot automatically
manages ammunition even if the optional Assist-mode reload checkbox is off.

## Pro survival arbitration (v2.5.0)

- **Threat memory & 3-second armor:** armor only starts after 5 seconds without recent shooting, damage or hostile LOS. Any nearby hostile or unseen angle blocks armor. Existing armor cycles cannot be interrupted by removing the input: this is a game rule.
- **Reload safety:** `reloadQuietSeconds` controls the delay after contact (default 3.5 s). Empty magazines do not trigger the engine's automatic dry-fire reload during combat. Switch to a loaded sidearm first, or retreat. Already active reloads may be cancelled by switching guns; shell shotguns can fire a loaded shell to interrupt.
- **BR ring escape:** when dangerously near/outside the active ring, move inward before opportunistic loot. A multi-floor escape route is not guaranteed.
- **Zombie kiting:** reacts to the nearest zombie independently of target selection; checks multiple escape directions and nearby horde members against collision geometry. `zombieSpacing` defaults to 22m. Immediate melee danger overrides loot; safe crate routes can proceed while distant zombies are present.
- **BR/Zombies loot:** reads `LootView.data` from server-supplied entity snapshots. Chooses crates, usable weapons, compatible ammunition, armor plates and other consumables by need, rarity and distance. A* navigation if enabled; opens crates and equips guns using ordinary F-use edges and correct yaw/pitch. Automatic pickup items require movement only. Avoids looting under fire, in gas/outside the BR ring, near zombies, or close to contested item locations. `autoLoot` is active only in opted-in Autopilot, not Assist mode.
- Configurable `autoLoot`, `lootRange`, `zombieSpacing`, `reloadQuietSeconds` in the popup, included in the enable-all preset.

The `weaponTactics` popup toggle lets users switch between automatic ranges
and the previous manually selected `engageRange`. Settings are persisted per
browser profile. The Vercel domain remains enabled by default.

## Installation

Extract ZIP, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, select `manifest.json`, open/reload the supported web game and configure the extension popup. Temporary add-ons must be loaded again after LibreWolf restarts.

## Build, verify, limitations

```bash
node scripts/build.mjs
node --test tests/*.test.mjs
node tools/check-game-compat.mjs /path/to/extracted/fps-arena-main
python scripts/package.py
```

The regression suite additionally exercises real loot-aim geometry, zombie kiting and combat-quiet memory.

The regression suite also exercises an included snapshot of the game's
`shared/weaponstate.js` (fire-edge/reload/shell mechanisms) alongside the
real shared weapon catalog. Fixture sources are under `tests/fixtures/game-shared`.

Integration tests use simulated `Game` / `CameraRig` prototypes, not a live network match. Browser popup smoke tests use Chromium with a mocked WebExtension API, not a native LibreWolf installation.

Autopilot is a heuristic controller, not a guaranteed win system. Static wall-box collision is approximate. A* routing is limited to 2D. No server behavior, hit registration, penetration, or recoil authority is modified.

See `HUONG_DAN_VI.md` for the Vietnamese installation instructions and feature details.

## Stance controller (v2.5.0)

- Auto Slide: uses the real `crouch`/`slide` input **rising edge** at 60 Hz.
  Slide initiation requires a clear 6.5 m corridor, grounded character, valid
  cooldown, and no reload, armor, jump, F-use or prone. A critical dodge (low HP,
  a near-term projectile or a zombie escape with a safer endpoint) can pause
  ADS/fire for **one tick** to activate slide; firing may resume while sliding.
  Other travel slides require no active shooting/ADS, and the bot never slides
  within 8 m of an intended loot goal. It checks the expected escape endpoint
  against every nearby zombie and blocks a slide that would approach the horde.
  Anti-repeat interval is 1.6 seconds.
- Auto Crouch: holds C in a cover/hold position even while ADS/firing;
  Evasive Crouch adds brief 0.28 s duck pulses when `predictDodge` signals danger
  but a slide would sacrifice a good shot. It stands automatically when the
  escape route requires sprinting, avoids stance flicker, honors user-held C.
- Both features can be disabled independently in the popup. Only Autopilot
  generates automatic stance changes (not the human-operated Assist mode).
- The game authoritative movement code, not this extension, decides whether a
  slide actually happens. Sliding locks direction for 0.55 seconds; this assistant
  does not guarantee safety against moving enemies or complex platform gaps.

Movement integration tests use a vendored *unchanged* copy of the game's
`shared/movement.js` from `fps-arena-main(1).zip`.

## Fast response (v2.5.0)

- The Autopilot recomputes a **visibility-first** target on each simulated input
  tick (nominally 60 Hz), immediately before `LocalPlayer.tick` emits yaw/pitch
  and fire to the server. It prefers a shootable exposed opponent over a nearer
  hidden one; when none is exposed it preserves a hidden target for pathfinding
  but does not fire through cover. `Fast Target Acquisition` can be disabled.
- Autopilot with Fast Aim snaps yaw/pitch to the selected visible position,
  whereas Assist retains its configured smoothing. If crouch is requested on
  the same tick, the aim pitch is recomputed using the crouched eye height.
- **Not zero latency**: snapshots arrive at 30 Hz, prediction/network delays,
  weapon cooldowns, weapon spread and server hit registration still apply.
  Holding an angle while sprinting/sliding does not guarantee every bullet hits.
- Performance: this performs extra short ray tests on each available remote
  player every simulation tick. Monitor FPS in very large custom maps.

Automated regression: `node --test tests/*.test.mjs` plus popup smoke test
with mocked WebExtension APIs and static compatibility checker for the
attached FPS Arena snapshot. Neither is a live LibreWolf multiplayer test.

## v2.5.2 — Weapon acquisition, ring rotation, secondary reload

- **Weaponless in Zombies/BR**: fists/melee-only player prioritizes firearm pickup / crates. The autopilot does not strafe/ADS/fire at distant opponents while unarmed, and explores deterministic sectors when no pickup is visible. Nearby zombies and explosives still trigger emergency avoidance.
- **Battle Royale gas safety**: detects present/announced circles from `modeState.ring`, pre-rotates into the next circle, follows cached 2D A* detours around map walls, and suspends opportunistic loot/combat/reloads during ring escape. Ring damage is server-owned; escape is not guaranteed in impossible time/geometry.
- **Secondary weapon reload**: once combat quiets down, switch to a depleted backup gun, wait for the weapon switch cooldown, reload through `stepWeapons` input, then restore the loaded primary. Reserve and weapon eligibility are checked; combat/loot/ring interrupts priority. Unarmed infinite-ammo fists are not treated as a loaded sidearm. Assist mode never changes slots for backup maintenance.
- Added 60 Hz multi-tick regression scenarios covering actual server-equivalent weapon state, ring traversal, melee-only loadouts, and loot safety.

The extension never modifies the game's authoritative hit, ammo or damage state. Live LibreWolf multiplayer validation is still needed.

## v2.5.3 — Corner escape and Classic primary-weapon recovery

- **Zombies corner routing:** New `zombie-nav.mjs` performs a bounded,
  threat-weighted shortest-path search to *reachable, open ground*, penalizing
  narrow dead ends and zombie-dense cells. It can initially move sideways or
  toward a less dangerous exit to get around a wall, rather than pushing
  forever in the mathematically opposite direction of the nearest zombie.
  Cached waypoints, a movement-progress watchdog and threat-change replanning
  prevent continuous route oscillation. A failed route search is throttled;
  existing short-range avoidance remains as a fallback. The dedicated Zombies
  escape planner runs even if optional **combat** A* is off.
- **Classic primary recovery:** If the primary runs dry and Autopilot swaps to
  the sidearm, `primaryPending` persists across combat interruptions. After the
  global threat/quiet timer clears, the controller switches back to slot 0,
  waits out the 0.4 s switch cooldown, requests a primary reload through normal
  authoritative inputs, waits for completion, and keeps the primary equipped.
  A new ambush can temporarily cancel that reload and return to a *loaded*
  sidearm without forgetting the recovery job. This also handles Classic
  infinite reserve; BR/Zombies zero-reserve slots are excluded. Proactive
  sidearm maintenance now starts only when the backup is <=25% full to prevent
  needless back-to-back swaps after restoring the primary.
- **Regression coverage:** actual `shared/stepMove` collision simulation for
  geometric corners/boundaries, dynamic zombie waves and sealed rooms; real
  `shared/weaponstate` repeated-tick Classic reload/switch/interrupt cycles.

Note: 2D routing cannot infer stairs, vertical traversal or all complex map
geometry, and is not a guarantee that any particular route remains safe from
moving opponents. There is no verified live LibreWolf multiplayer trial.

## v2.5.4 — Zombie reload, crate travel and faster engagements

Four confirmed regressions were addressed by correcting action arbitration, rather
than increasing the aim-lock speed blindly:

1. **Reload in Zombies:** `assessThreats()` sees zombies as enemies, so its
   global `risk.hot` stayed true during waves and prevented all reloads. Zombies
   now use `zombieReloadOpportunity()` based on the nearest *living* zombie and
   active weapon's reload duration. Reloads are still deferred when a zombie
   is too close. Firing takes precedence while the magazine is usable; empty
   guns initiate a reload once the safety buffer permits. This is not a
   guarantee of safety against moving groups or blocked escape paths.
2. **Loot with threat-aware routing:** Zombie loot no longer waits for a global
   zero-enemy quiet period. Up to five nearby viable candidate crates/items
   are evaluated with bounded A* paths (not only Euclidean range) and scored
   for route length and proximity to zombies. Route selection is cached for
   1.2 seconds and revalidated when zombies shift. Loot travel is enabled in
   Zombies even if optional regular combat pathfinding is disabled. A 1.05s
   progress watchdog and temporary target exclusion reduce wall deadlocks.
3. **Immediate fire while travelling to loot:** The previous end-of-tick loot
   arbitration unconditionally set `fire=false`, including while a crate was
   far away. `arbitrateLootCombat()` now suppresses shots only at an actual
   interaction, and the agent prioritizes immediate nearby Zombie combat over
   pressing F at a crate. The auxiliary sidearm-maintenance routine never
   steals a tick while actively shooting, and in Zombies is postponed until
   no active zombies remain.
4. **Evade improvements:** Eight candidate headings instead of four, collision
   checks at both hip and torso height with capsule-width offsets, direction
   continuity, and handling of opposing threats whose displacement vectors
   cancel. Dodge state is cleared each input tick. This reduces wall impacts
   but does not make hitscan shots physically dodgeable after they hit.

Tests cover the game-equivalent 60Hz `stepWeapons()` reload-to-completion,
near-zombie reload restrictions, uninterrupted firing while loot-travelling,
wall-detour crate navigation with the game's real `stepMove()` simulation,
route cache invalidation, and multi-threat evasion. The suite remains a
simulated-client test, not a verified live LibreWolf multiplayer session.


## v2.5.8 — Battle Royale assertive engagements and proactive barrier rotation

- **Ring damage is server-authoritative**: BR's current-ring damage begins at
  5 HP/s and triples for each 5-second continuous interval spent outside.
- **Early rotation with urgency separation:** `ringSafetyPlan` now uses
  `brLeadSeconds` (default 24 s) plus a conservatively estimated travel time
  to the NEXT circle, before the next shrink begins. Normal rotation prioritizes
  progress toward the next safe region without turning off a valid shot along
  that route. True ring emergency (outside, shrinking, final closure, or only a
  few seconds before an estimated required departure) cancels shooting,
  reload, loot, plates, and tactical sidesteps to maximize relocation speed.
- **Confident engagements:** `planBattleRoyalePush` evaluates current gun class,
  ammunition, health/armor, LOS, threat density, desired engagement range, and
  predicted near-future safe zone. Shotguns and SMGs close distance actively;
  rifles advance when outside ideal range; snipers/LMGs/marksman weapons hold
  their firing lanes. The approach uses bounded lateral variation to avoid a
  predictable straight sprint. Never chases a target into known current-ring
  damage, and refuses risky pursuit outside an imminent next circle.
- **Adjustments:** `brAggression` default 80/100, `brLeadSeconds` default 24 s
  are independently persisted in the LibreWolf popup. Changing them only
  affects Autopilot's Battle Royale policy; Classic/Zombies unchanged.
- **Limits:** ETA uses a conservative ground-speed estimate; cached 2D A*
  handles obstacles only on the current level, not stairs or active moving
  cover. No algorithm can guarantee survival in a sealed route or through
  a very late circle. The current version has not been validated in a
  live multiplayer match on LibreWolf.


## v2.5.8 — Sniper proactive engagement

- Quét mục tiêu xa hơn theo tầm bắn thực tế của sniper/DMR, giữ giới hạn cho vũ khí tầm gần.
- Không chặn phát bắn chỉ để giảm tốc độ di chuyển khi súng ngắm đã khóa mục tiêu; bắn sau khi ADS sẵn sàng.
- Có thể tìm điểm nhìn thông thoáng quanh vật cản bằng A* 2D có cache; không ép di chuyển xuyên tường.
- Khi đang chuẩn bị chạy bo (chưa nguy cấp), vẫn duy trì tự động khóa mục tiêu và ADS; khi bo nguy cấp thì chạy bo trước.
- Chưa xác minh trực tiếp một trận LibreWolf; các bài kiểm thử không bảo đảm mọi viên đạn sẽ trúng.

## v2.5.8 fixes — Zombie supplies and weapon strategy

- **Zombies: reload despite visible horde.** Safe reload windows now consider relative radial approach speed (zombie closing speed minus the player’s outward velocity), not just distance. Emergency empty-magazine reload is allowed outside immediate melee range when no loaded backup exists. An empty strong primary is recovered from the sidearm once retreat has created a suitable window.
- **Zombies: crate commitment.** Dropped items and crates are no longer blanket-rejected at excessive zombie radii. The loot planner evaluates reachable A* detours and horde exposure; only imminent contact or an intercepting zombie preempts a viable route. Plans carry the actual loot distance (fixing a previous fallback to `Infinity`). A shortage of ammunition increases priority for compatible ammo and unopened crates.
- **Zero remaining ammo:** finite-ammo loadouts with no usable rounds enter supply-acquisition mode even when they technically carry firearms. Bot does not simulate aim/fire while searching for compatible ammunition or a crate.
- **Classic and BR: weapon preference.** Return from a weak loaded sidearm to a stronger primary once available, and recover the primary after the appropriate quiet/cover window. Background sidearm maintenance still completes correctly without switching loops. Reload behind cover or at long, un-aimed distance requires a full firing/damage pause; plating remains strictly gated.
- **Sniper/DMR:** maintain spacing and seek lateral sightlines rather than blindly charging into close quarters when a distant target becomes occluded; BR aggression is suppressed for a scoped weapon already within its firing reach.
- **Verification:** includes 16 new event-sequence regressions for these failures, in addition to all older test coverage. This is a heuristic controller, not a verified human-professional-level bot.


## v2.5.9 — Primary-first weapon selection / Ưu tiên súng chính

- Autopilot ưu tiên **slot 0 (súng chính)** khi có đạn; không đổi sang súng phụ chỉ vì một đối thủ ở xa đang nhìn thấy được.
- **Sidearm emergency:** chỉ được chuyển sang súng phụ khi súng chính không thể bắn (hết đạn/đang nạp) và đối thủ/zombie tới gần hơn ngưỡng cấu hình (mặc định 10 m).
- Nếu đối thủ còn xa, giữ khoảng cách hoặc tìm che chắn; phục hồi/nạp súng chính khi có cửa sổ an toàn. Khi súng chính sẵn sàng, lập tức quay lại.
- Không tự đổi sang súng phụ để bảo dưỡng/nạp định kỳ. Nếu người chơi đang dùng súng phụ trong Assist, lệnh thủ công vẫn có quyền ưu tiên.
- Nếu đang cầm sidearm tạm thời, chiến thuật di chuyển vẫn dùng khoảng cách của súng chính; Battle Royale không chủ động áp sát chỉ vì sidearm có tầm bắn ngắn.
- Ngưỡng sidearm chỉ tính từ đối thủ thực sự gần, không dùng độ nguy hiểm chung hoặc tầm nhìn xa.
- Chú ý: không bắt đầu reload trong giao tranh nguy hiểm; khi không có đạn dự trữ, cần loot tiếp tế (ở chế độ hỗ trợ).


## v2.6.0: Primary Reload First + Zombie Pincer Routing

- Khi súng chính hết băng mà còn đạn dự trữ, Autopilot ngừng bóp cò và bắt đầu nạp ngay, không chờ hết giao tranh. Trường hợp có địch áp sát trong ngưỡng sidearm sẽ đổi sang súng phụ còn đạn; khi có khoảng trống sẽ quay lại súng chính để nạp.
- Route loot Zombies đánh giá khả năng bị chặn theo thời gian, sử dụng vận tốc zombie suy ra từ hai snapshot gần nhất, A* có trọng số rủi ro, và tự cập nhật khi đối thủ cắt ngang tuyến. Giữ kiểm tra vật cản tĩnh/giới hạn bản đồ.
- Thuật toán 2D mang tính dự đoán, chưa bảo đảm thoát khỏi vòng vây hoàn toàn kín hay địa hình nhiều tầng.

## v2.6.9 — Offline Combat Lab and close-zombie priority

The extension now recognizes an empty selected gun **after a slot switch** and reloads as soon as `ws.switchT` and the other engine cooldown guards allow it. In Zombies, enemies that can imminently bite outrank distant targets close to the crosshair, provided there is a valid firing line. The preexisting primary/backup policy is not removed.

Reproduce offline benchmarks with:

```bash
node scripts/build.mjs
node --test tests/*.test.mjs
node tools/simulate-all-modes.mjs --record /path/to/fpsarena-all-matches.json
```

Five top-level game modes are covered (`tdm`, `snd`, `hp`, `br`, `zm`), with two aim test tiers each. The benchmark uses the original FPS Arena shared weapon ballistics and hitbox geometry, but **is an offline synthetic lab, not a live server room**. Stress tests introduce target direction/lean changes unobservable at decision time. For real headshot-rate calibration, record server-confirmed head/body outcomes from games; the attached Match Recorder JSON has hit and shot events but no such flags.

To inspect match trajectories in LibreWolf, open **Match Recorder → Mở Combat Replay Lab**, choose your exported JSON and select a match. The standalone `lab/replay.html` can also be opened without installing the extension. All processing is local; the ZIP does not embed the provided private match recordings.


## v2.7.0 — Authoritative Training Arena

Bản v2.7.0 tích hợp **phòng mô phỏng thực** tại `lab/arena/`: khởi chạy server FPS Arena gốc 60Hz, cho `page-agent.js` điều khiển một người chơi bằng input hợp lệ trong TDM, S&D, Hardpoint, Battle Royale và Zombies. Bot đối thủ chính thức không bị giảm khả năng; có thêm chế độ mixed/stress dùng thao tác hợp lệ của engine. Tự triển khai khỏi trực thăng BR; phối hợp góc bắn chéo với đồng đội (tùy chọn `teamCoordination`). **Hướng dẫn chi tiết:** `TRAINING_GUIDE_VI.md`. Báo cáo mô phỏng server: `reports/ARENA_EVALUATION_V270.md`. Không thể suy ra tỷ lệ thắng đối thủ người thật từ bài kiểm tra bot.

## v2.7.1 — Training có đối chứng và objective tactics

Bổ sung objective routing dựa trên `modeState` công khai cho S&D/Hardpoint, cân bằng với camera peek; mở rộng lab với tùy chọn `--classic-maps arena,neon,foundry`. Kết quả train-vs-held-out và số mạng chết đầy đủ: `reports/training-v271/TRAINING_REPORT_v2.7.1.md`. Không thay đổi cơ chế server hoặc giới hạn bot đối thủ.

## v2.7.2 — TDM dài và Adaptive Combat Peek

Đã chạy 12 trận TDM train (180 s/trận tối đa) và 6 trận seed độc lập (240 s/trận tối đa) trên Neon/Arena/Foundry, so sánh chính xác v2.7.1 với bản mới trước bot gốc và đối thủ stress. Điều chỉnh Autopilot: ưu tiên phát bắn hợp lệ khi có lợi thế, giữ cover/peek khi yếu máu, reload hoặc nhiều góc uy hiếp; sửa hướng đi bị đảo tiến–lùi do mất waypoint thoáng qua. Trong held-out, kills đạt 56→83 với bot gốc và 40→48 với stress, đảo hướng giảm; accuracy stress giảm từ 62,2% xuống 58,9%. Không chứng minh thắng người thật hoặc cải thiện phối hợp đồng đội. Toàn bộ số liệu và cách tái chạy tại `reports/training-v272/TDM_LONG_TRAINING_REPORT.md`.

Chạy phòng tập có nhãn quyết định thực (ghi ở 2 Hz, không phải video):

```bash
node lab/arena/train.mjs --modes tdm --episodes 1 --seconds 180 --bots 6 --opponents stress --seed 4421001 --trace-decisions --out reports/my-diagnostics.json --replay reports/my-diagnostics-replay.json
```


## v2.7.4 — TDM Team Positioning Laboratory (experimental, OFF by default)

Đã thêm chiến thuật thử nghiệm `squadFlank()` chọn điểm lệch góc so với đồng đội, kiểm tra đường bắn, góc camera đối thủ, khả năng di chuyển, giới hạn máu/giáp và giữ hướng flank ổn định. **Không bật mặc định**, vì trên 6 trận stress độc lập nó chưa vượt qua bộ tiêu chí đánh giá (kills 33→29, deaths 7→7). Chính sách crossfire của v2.7.2 được giữ nguyên trong extension thường.

Để kiểm thử hai cấu hình trong phòng tập headless:

```bash
node lab/arena/train.mjs --modes tdm --episodes 6 --seconds 90 --bots 6 --opponents stress --seed 790633 --classic-maps neon,arena,foundry --out reports/training-v273/baseline.json
node lab/arena/train.mjs --modes tdm --episodes 6 --seconds 90 --bots 6 --opponents stress --seed 790633 --classic-maps neon,arena,foundry --profile squad-experiment --out reports/training-v273/experimental.json
node lab/arena/evaluate-team-flank.mjs --baseline reports/training-v273/baseline.json --candidate reports/training-v273/experimental.json --out reports/training-v273/paired-comparison.json
```

Bộ đánh giá không tự kích hoạt policy kém chất lượng; trong browser option `teamFlankExperiment` được chuẩn hóa là `false` nếu không được bật rõ ràng. Các kết quả chỉ phản ánh phòng tập không có người chơi thật. Xem `reports/training-v273/TEAM_POSITIONING_REPORT.md`.


### v2.7.4: BR full-match laboratory
Use `node lab/arena/train.mjs --modes br --episodes 2 --full-match --seconds 480 --bots 11 --opponents stress --out reports/full-br.json`.
BR loot is allowed only when the full excursion fits a conservative ring deadline. Final-ring weapon search no longer patrols outside the circle without actionable loot. Results do **not** demonstrate improved win rate.


## v2.7.5 — TDM lag-compensated aim & full-match evaluation

TDM Autopilot uses rewind-aligned aiming without a fixed 65 ms extra lead. Other modes and assist mode retain their original prediction policy. Full-match paired evaluation and how to reproduce: see `CHANGELOG-v2.7.5.md` and `lab/arena/compare-tdm-aim.mjs`.


### v2.7.6 — Skill Automation (T)
In Autopilot, toggle **Tự kích hoạt skill (T)**. The bot can activate the skill chosen in the game's loadout using real server-legal T-key input, with sufficient energy and a situational risk check. The extension does not select new skill loadouts or alter energy/cooldowns. `skill-tactics.mjs` provides decision logic. Match Recorder logs skill state and activation commands; the headless training arena counts server-confirmed skill events. See `CHANGELOG-v2.7.6.md` and `reports/SKILL-VALIDATION-v2.7.6.md`.


### v2.7.7 — TDM routing, shooting and evasion validation
Autopilot TDM now defaults to risk-gated pursuit of a server-visible sightline when a target is occluded. It respects actual A* paths, recent damage, armor, health, current projected exposure, close and ADS enemies; ring/loot and other modes are unchanged. The popup includes an opt-out checkbox. The separate `route-lab`, `strafe-lab`, `dodge-lab`, `combined-lab`, `route-strafe`, `sightline-lab`, and steering profiles remain reproducible experimental policies; do not use their training scores as human-player guarantees.

To compare: `node lab/arena/train.mjs --modes tdm --episodes 3 --full-match --seconds 600 --bots 9 --opponents stress --classic-maps neon,arena,foundry --seed 345678 --profile route-lab --out reports/tdm-experiment.json`. For an untouched v2.7.6 tactical baseline, use `--profile baseline`. Summary: `CHANGELOG-v2.7.7.md` and `reports/TDM-TRAINING-v2.7.7.md`.


### v2.7.8 — Experimental hitscan evasion (opt-in; 90% target not yet reached)

This release adds local predictive hitscan evasion and a TDM-only option to seek cover
when opponent muzzle events are observed. Both checkboxes under **AUTO EVADE** default
**off**: enable them with **Dodge** and **Smart Cover** only to experiment.
The source-of-truth benchmark and the exact miss-rate definition, trade-offs and
3-seed comparisons are in `reports/TDM-EVASION-v2.7.8.md`; do not treat the
observed-shot miss rate as causal proof of player dodge skill.

Run `node --test tests/*.test.mjs` then `node lab/arena/train.mjs --modes tdm
--seconds 90 --episodes 3 --bots 9 --classic-maps neon,arena,foundry
--seed 830114 --opponents stress --profile cover-evasion-lab
--out reports/evasion-retest.json` to reproduce the experimental profile.

## v2.7.9 — Protected recovery, respawn staging, throwable automation

- Defensive recovery during **reload and armor plating** has precedence over routine battle steering, scores actual shooter bearings and the risk along the path, and holds protected cover. True 3D camera-to-player occlusion avoids false cover decisions.
- While visible opposing players are temporarily dead in TDM, the bot may stage **outside** candidate respawn positions using only public spawn geometry; it yields to active combat.
- Autopilot can use throwable inventory from **`you.thr`** with server-valid single G presses. Stim and selected projectile/area/foam throws are safety gated. Enable or disable with **Auto throwables** in the popup; not active in Aim Assist. Discharger is deliberately not automated.
- See `CHANGELOG-v2.7.9.md` and `reports/DEFENSE-v2.7.9.md`. Authoritative tests: 496/496; the 90% avoidance target is not established.


## Version 2.8.7
See `CHANGELOG-v2.8.7.md` for cover-anchor stability and the opt-in occluded pursuit lab.


## Version 2.8.8
See `CHANGELOG-v2.8.8.md` and `reports/V288-LONGMATCH-DIAGNOSTICS.md`. Use `node tools/analyze-motion-replay.mjs reports/<replay>.json` for sampled heading changes; `node tools/analyze-cover-geometry.mjs <replay.json>` for map-specific open-ground reversals. The `peek-cache-lab` headless profile is experimental and disabled in normal use.

## Version 2.8.9

TDM macro navigation-target stabilization is enabled by default for Autopilot and can be turned off with the **TDM macro target commitment** popup toggle. It does not lock visible aim or manual aim assist. Experimental movement macro arbitration remains disabled; available through headless profiles `macro-actuation-lab` and `macro-routing-lab`. See `CHANGELOG-v2.8.9.md` and the downloadable research report for matched-seed evidence and limitations.

**2.9.3 research:** `macro-vantage.mjs` tests future attack viewpoints that have real 3D line-of-sight and are within the close weapon's effective range. It checks actual A* waypoints and cumulative route exposure, not just low-risk hide points. The `macro-vantage-lab` simulator profile is opt-in; it is *not* in the popup because it underperformed Macro Combat 2.0 on the matched short TDM seeds. See `CHANGELOG-v2.9.3.md` and `reports/MACRO-VANTAGE-v2.9.3.md`.

**2.9.4 research:** Time-bounded target motion forecasts and structured vantage-action diagnostics (`macro-temporal-lab`). The ordinary browser extension and default gameplay remain unchanged. See `CHANGELOG-v2.9.4.md`.


## v2.9.7 Macro Options / outcome tracing (experimental)

- `macro-options-v3.mjs` introduces optional temporally extended movement options and outcome events.
- `macro-options-shadow-lab` runs with Macro Combat 2.0 movement unchanged, logging proposed vs executed actions.
- `macro-options-active-lab` exists **only for headless simulation**, with the active branch gated by `__FPSARENA_HEADLESS_LAB__`; do not claim it is a proven gameplay upgrade.
- Outputs include `macroOptionTotals` and `macroDiagnosticCounts` to assess fires, shot opportunities, position progress, veto and termination reasons. Last active option may be incomplete when a match ends abruptly.
- Normal browser default options remain off; neither shadow nor active is available in popup.
- `macro-action-ownership.mjs` remains present for historical comparisons but must not be enabled on production.

## v2.9.5 experimental action ownership

The **default extension is unchanged**. `macro-ownership-lab` in the headless simulator enables a shotgun-only short-horizon action owner. It arbitrates conflicting pursuit and camera-cover directives when an unseen opponent remains beyond weapon range, but yields immediately for a visible opponent, imminent danger, damage, recovery, objectives, loot, ring movement, blocked routes and failed progress. Aim, hip-fire/ADS, shots and server hit rules remain separate. The module emits `macro-decision` ownership diagnostic states into the simulator.

This prototype is **not validated as a combat improvement**: six short paired shotgun matches improved kills 4→7 but increased deaths 9→13; two natural-end pairs worsened kills 11→7. It remains OFF by default, with no popup toggle. SMGs were explicitly excluded after initial poor experiments. Details and raw comparisons are in `reports/MACRO_OWNERSHIP_V295.md` and `reports/MACRO_OWNERSHIP_V295.json`.

## v2.9.7: evidence-based option cycle classifier (research only)

The `macro-options-shadow-lab` telemetry now associates each same-target rapid
`A -> B -> A` action cycle with the *completed middle action*. Results may be
`protected-interrupt`, `combat-contact`, `visibility-gain`,
`self-range-progress`, `candidate-low-yield`, `too-brief` or `unresolved`.
The latter classes are **not** proof that the movement was erroneous.

The headless trainer also attributes actual server-confirmed own shots, hit
notifications and kills to each option active at the event time, rather than
assuming that input `fire: true` always produced a shot. This attribution is
correlational. Raw class counts and bounded trace samples are in
`reports/v297/`. The operational LibreWolf extension is unchanged.

Run `node scripts/build.mjs`, `node --test --test-concurrency=1 tests/*.test.mjs`
and the command in `CHANGELOG-v2.9.7.md` to repeat the experiments.

## C11 motion calibration lab (experimental)

`node scripts/evaluate-c11-server.mjs --shots 512` exercises the uploaded main
server's real `fireWeapon()` in isolated scenes and outputs:
`reports/c11/server-calibration.json` and `reports/c11/shot-events-sample.ndjson`.
The calibration failed its held-out evaluation gate and is NOT imported by the
shipped agent. See `CHANGELOG-v2.9.11-C11.md` and the separately supplied C11
engineering report for results and limitations.

## C14 — research-only match-level exploration

`lab/arena/train-main.mjs` can create match-randomized action offers using a *public snapshot and public static geometry*, without touching the browser extension's built artifacts:

```bash
node lab/arena/train-main.mjs --modes tdm --episodes 8 --seconds 28 --seed 140801 --profile release --classic-maps arena,foundry,neon --trainee-primary m4a1 --opponents stress --out reports/c14/randomized.json --c14-dataset reports/c14/randomized-opportunities.json
node scripts/analyze-c14-exploration.mjs reports/c14/randomized.json reports/c14/randomized-opportunities.json reports/c14/randomized-analysis.json
```

For **debugging only**, pass `--c14-force-arm control` or `treatment` on the same seed to generate matched trajectories. Forced comparisons are not randomized trials. No direct extrapolation of causal per-offer values from either dataset. The code aborts an intervention immediately if safety/priority changes; it does not guarantee immunity from adverse gameplay outcomes.

C14 exploration is confined to headless research and never enabled by default. See `CHANGELOG-v2.9.11-C14.md` and C14 Engineering Report.

## C16 Efficient Tactical Exploration (research-only)

See [C16-ENGINEERING-REPORT.md](C16-ENGINEERING-REPORT.md). The C16 headless scheduler avoids geometry probes after definitive safety vetoes, with match-level treatment/control and CPU profiling. `page-agent.js`/production default behavior remains unchanged.


## C17 — Stratified Tactical Evaluation (research only)

C17 adds blocked 1:1 match randomization by `(mode, map, primary weapon)` to the C16 headless safe-action explorer. It does not change production behavior or train/promote a neural policy.

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && npm run check)
node lab/arena/run-stratified-study-c17.mjs --blocks 4 --seconds 32 --workers 4 --out-dir reports/c17/study
python scripts/verify-control-parity-c17.py
```

Pre-treatment assignment is deterministic from experiment seed, map, weapon and replicate block; it does not touch `Math.random`. The evaluation includes all matches (including no opportunity), uses a block-level intention-to-treat contrast and never fabricates per-offer counterfactual rewards. Refer to `C17-ENGINEERING-REPORT.md` and `reports/c17/study/study-summary.json`. Browser FPS and performance on human players have not been tested.


### C17 — Stratified Tactical Policy Evaluation

See `C17-ENGINEERING-REPORT.md`, `CHANGELOG-v2.9.11-C17.md` and `reports/c17/study/study-summary.json`. Match-level blocked 1:1 research experiment, 48 episodes; no production actuation or neural model promotion.


## C18 long-horizon research (not a production policy)

See `C18-ENGINEERING-REPORT.md` for the 48-match preregistered, blocked 75-second study, full uncertainty estimates, CPU-only measurement limits and reproduce/verify instructions. C18 leaves the C16 guarded movement and browser `page-agent.js` unmodified.

## C19 natural-end research checkpoint

C19 adds a **headless-only**, preregistered natural-end TDM evaluator, using the existing C16 guarded exploration policy without modifying the shipped extension. See `C19-ENGINEERING-REPORT.md`. Run `node lab/arena/run-natural-end-c19.mjs --blocks 2 --workers 3 --out-dir reports/c19/study24` for the 24-match protocol. Default production Autopilot is unchanged.

### C20 paired-seed value research (headless only)

C20 adds `lab/arena/run-matched-seed-c20.mjs` to simulate control and guarded micro-strafe treatment from the same engine seed through TDM's natural win condition, with 600 s administrative censoring. Run `node lab/arena/run-matched-seed-c20.mjs --pairs 2 --workers 3 --out-dir reports/c20/study24`. Analyze the verified paired dataset with `node lab/arena/evaluate-stratum-value-c20.mjs reports/c20/study24`. This produces a **non-deployable match-contrast neural diagnostic**, not a per-action reward/Q-value. See `C20-ENGINEERING-REPORT.md`. Production Autopilot is unchanged.

## C21 research checkpoint: encounter-level action-value learning

C21 adds **offline headless-only** three-way randomized eligible encounters. It leaves `page-agent.js` and production Autopilot unchanged. Data are acquired from delayed public client snapshots before the action and server-confirmed labels afterwards. The unit of randomization is an eligible encounter window, with each chosen action's probability `1/3`; labels for unchosen actions do not exist.

```bash
# Source/engine checks
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)

# Study uses preregistered seed/map/weapon jobs and supports integrity-checked resume.
node lab/arena/run-encounters-c21.mjs --repetitions 3 --seconds 65 --workers 3 --out-dir reports/c21/study18
node lab/arena/evaluate-encounters-c21.mjs reports/c21/study18/COMBINED-DATASET.json reports/c21/study18/RECHECK.json
```

The trial is **underpowered** (18 matches / 69 complete windows / 10 nonzero damage windows), and the gated conditional-value MLP is deliberately not trained on it. Short-window damage is not interchangeable with kill differential or win rate. See `C21-ENGINEERING-REPORT.md`.

## C22 research-only risk-aware encounter evaluation

C22 extends C21 randomized eligible encounters with pre-action public pressure audits and nested 0.9/1.8-second authoritative labels. No extension or Release Autopilot changes. See `C22-ENGINEERING-REPORT.md` for controls and limitations.

```bash
node lab/arena/run-risk-aware-c22.mjs --repetitions 3 --seconds 75 --workers 3 --out-dir reports/c22/study18
node lab/arena/evaluate-risk-aware-c22.mjs reports/c22/study18/COMBINED-DATASET.json reports/c22/recheck.json
```

Do not overwrite the registered study when changing source, seeds, time windows or trial conditions; use a new output directory. An adequate dataset is necessary but does not automatically qualify a neural action-value model for production.

## C23 research-only checkpoint

C23 adds heldout pressure-conditioned action evaluation, not a new production policy.
Run `python scripts/verify-c23-provenance.py` and see `C23-ENGINEERING-REPORT.md` for the signed 18-match plan, complete outcome coverage and explicit neural training gate. The C22 action controller and `page-agent.js` remain unchanged.

### C24: post-shot threat telemetry (research-only)

C24 adds a **headless-only**, public-before-action vs server-after-action threat audit; hitscan shots are not projectiles that can be dodged after a shot packet arrives. To reproduce the registered cohort:

```bash
node lab/arena/run-threat-study-c24.mjs --repetitions 3 --seconds 75 --workers 4 --out-dir reports/c24/study18
node lab/arena/evaluate-threat-cues-c24.mjs reports/c24/study18/COMBINED-DATASET.json reports/c24/study18/PRE-REGISTERED-PLAN.json reports/c24/study18/RECHECK.json
python scripts/verify-c24-provenance.py
node --test tests/threat-trace-c24.test.mjs
```

See `C24-ENGINEERING-REPORT.md`. The trial does **not** change the shipped extension, nor justify deploying a neural dodge policy.

## C25 offline calibration research

See `C25-ENGINEERING-REPORT.md`. Headless C25 uses `--c25-dataset`; no new production switches are enabled.

### C26 — Temporal Threat Representation Learning (offline research)

C26 adds `lab/arena/run-temporal-threat-c26.mjs`, `lab/arena/evaluate-temporal-threat-c26.mjs` and `scripts/verify-c26-provenance.py`. A prospective 18-match multi-lag evaluation is archived in `reports/c26/study18`. See `C26-ENGINEERING-REPORT.md` for methods, reproducibility and negative holdout result. **No production inference or movement changes.**


## C28 — Controlled encounter action value (research only)

See `C28-ENGINEERING-REPORT.md`. The C28 simulator uses three same-seed server-fireWeapon micro-trials per scenario and trains a **non-deployed** PyTorch neural action-value head on separate development files. The resulting labels are **not** full-game outcomes. Run `node lab/arena/run-counterfactual-c28.mjs`, `python scripts/train-encounter-value-c28.py freeze`, `python scripts/train-encounter-value-c28.py evaluate`, and `node lab/arena/verify-counterfactual-c28.mjs`; test with `node --test tests/counterfactual-fire-c28.test.mjs`. No production policy changed.

## C30 state representation research checkpoint

See [C30 Engineering Report](C30-ENGINEERING-REPORT.md) and [C30 changelog](CHANGELOG-v2.9.11-C30.md). C30 passes the input coverage pilot but **fails** policy benefit and action-diversity checks (neural selects only left on 477 actual public observations). The `page-agent.js` release is unchanged. New experimental components are contained in `lab/arena/*-c30.mjs`, `scripts/*c30*` and `reports/c30/`.

## C33 Real-Map Collision-Rich Neural Research (research only)

See [C33-ENGINEERING-REPORT.md](C33-ENGINEERING-REPORT.md) and [CHANGELOG-v2.9.11-C33.md](CHANGELOG-v2.9.11-C33.md). Two separately preregistered studies evaluate 6,480 controlled 1v1 encounter states (19,440 paired action branches) using actual game-map geometry, movement collisions and server firing logic. The neural policies **did not** pass validation selection against public-map heuristics, so no full-game trial or production deployment of neural C33 was authorized. A real-map synthetic scenario is **not** an actual `Game.step()` logged encounter replay. Full reproduction commands are in the engineering report.

### C35-B research release (2026-10-13)

See `C35B-ENGINEERING-REPORT.md` and `CHANGELOG-v2.9.11-C35B.md` for the registered three-duration technical pilot. Use `python scripts/verify-c35b-reliability.py` before relying on its 108-match data. The C35-B changes are research-only; `page-agent.js` is byte-identical to C35-A. No neural dodge policy has been promoted.

## C35-AB (research-only, 2026-10-14)

See `C35AB-ENGINEERING-REPORT.md`. Controlled pre-step ADS/motor assignment on headless TDM; 72 real-game evaluations; **controller rejected**, production unchanged. Run `python scripts/verify-c35ab-independent.py` to independently check experiment hashes, assignment and authoritative shots. The source includes the frozen evaluation and all historical reports.


## C35-AD research checkpoint

See `C35AD-ENGINEERING-REPORT.md` for 72-match controlled pre-fire ADS randomization, propensity and factual outcome auditing. Production remains unchanged.


## C35-AE research (offline neural ADS action value)

See `C35AE-ENGINEERING-REPORT.md`; model weights `reports/c35ae/offline-ads-value/FROZEN-ADS-VALUE-MODELS.json` and new-seed evaluation `reports/c35ae/prospective-24/PROSPECTIVE-MODEL-EVALUATION.json`. Offline-only, production unchanged.

### C35-AF research checkpoint (offline only)

The `--c35af-trace` optional headless flag collects genuine, server-counter 3-second factual combat outcomes of randomized C35-AD ADS impulses. It does not enable a neural combat policy and does not change browser production; see `C35AF-ENGINEERING-REPORT.md` and `reports/c35af/frozen-54/` for 54-match preregistration, audit, raw traces, model and reproduction scripts. C35-AF neural MLP prediction and off-policy action preference are **not** validated enough for production.

## C35-AG — Sequence-Level Combat Value (research only)

See `C35AG-ENGINEERING-REPORT.md` and `reports/c35ag/frozen-72/` for the 72-match frozen study, actual six-second trajectories and offline sequence-prefix model. To generate new data, run `python scripts/run-c35ag-sequences.py` in a fresh research checkout (the included registration is SHA-locked to this checkpoint). `--c35ag-trace` must be explicitly enabled with C35-AD randomized and the passive safety research pipeline. The recorded actions **after assignment** are not independently randomized and cannot provide counterfactual Q-labels for those actions. Never use the exported MLP for gameplay control without a new prospective policy trial.

## Research checkpoint C35-AH (2026-10-14)

New **bounded multi-step motor option randomization**, opt-in only using `--c35ah-trace` and `--c35ah-policy observe|randomized`, is documented in `C35AH-ENGINEERING-REPORT.md`. Full 54-match registered data are under `reports/c35ah/frozen-54`, including factually observed six-second server outcomes, frozen source registration, independent assignment audit and setup-cluster bootstrap. Production remains unchanged and no neural combat controller has been promoted.

### C35-AI (2026-10-14): Authoritative Displacement Audit

Research only: active-index synchronized physical displacement observer for C35-AH multi-tick tactical options. See `C35AI-ENGINEERING-REPORT.md`, `CHANGELOG-v2.9.11-C35AI.md` and `reports/c35ai/frozen-72-v5/`. Source and dataset are registered and independently audited; production agent untouched. See report for null combat promotion outcome.

### Research checkpoint C35-AJ — state-conditioned tactical value (offline only)

See [`C35AJ-ENGINEERING-REPORT.md`](C35AJ-ENGINEERING-REPORT.md) and `reports/c35aj/` for 108 preregistered real-engine match traces, audited physical displacement, frozen neural/Ridge models, matched TDM and honest off-policy confidence intervals. The models are **not enabled in production**.
