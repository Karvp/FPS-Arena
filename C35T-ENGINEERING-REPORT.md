# FPS Arena v2.9.11 — C35-T Engineering Report

**Checkpoint:** C35-T — Target-Relative Movement Optimization  
**Decision:** **ENGINEERING PASS / POLICY REJECTED** (has actual motor exposure but does not meet combat non-inferiority or survival criteria).  
**Shipping:** production `page-agent.js` unchanged; C36 neural training not unlocked.

## Motivation and technical change

C35-S added a forward key only when the incumbent command had no movement. Over 72 engine-authentic TDMs, its motor exposure was zero. C35-T replaces a **direction already commanded** when, according to *delayed public client state*, there is a fresh hostile target sufficiently aligned with aim, a weapon-specific distance gap, and a better collision-free direction of approach.

New module: `lab/arena/target-relative-motion-c35t.mjs` (`--c35t-policy observe|redirect` and `--c35t-trace` in headless `lab/arena/train-main.mjs`). Controller chooses between the eight 2D directional key combinations from the official movement convention. It preserves speed normalization and must improve target-relative radial closure by >=0.24 relative to incumbent while keeping a nonnegative directional continuity dot-product >=0.05. It rejects stale/missing public targets (300 ms max), missing/ambiguous team codes, priorities, ungrounded movement, low HP (<45), static LOS occlusion and swept static obstruction; it never consumes true server state, future hits, kill rewards or the ballistic ledger.

A redirect changes **only** `forward`, `backward`, `left`, `right`; it never changes trigger, aim, yaw, pitch, weapon, reload, skill or other controls. It skips ticks where the C21/C16 explorer has changed the incumbent. This is a separately tested macro-movement safety guard, **not** a claim that C16 authorizes strafe while firing. Training and production code paths remain isolated.

## Preregistered TDM evaluation

- SHA-locked design: `reports/c35t/target-relative-36-v1/FROZEN-DESIGN.json`; SHA-256 `4f95f9509bdef8fefb857751aa0031840a2613179853804e5e23aa1454bb98bc`.
- **12 independent matched setups × 3 arms × 90 seconds = 36 actual Game.step TDMs / 54 simulated minutes**. Three maps: Arena, Neon, Foundry; primary guns: AA-12 (six setups), MP5SD (three), M4A1 (three); lag 65/150/240 ms; mixed/official/stress opponents.
- Arms: **release** = original v2.9.11 `page-agent.js` only; **observe** = same production agent + existing `shadow80` C21/C16 policy, C35-T passive; **redirect** = observe + bounded C35-T motor redirection. `redirect` vs `observe`, not `release`, isolates C35-T. Same source production agent on all arms.

| Aggregate | v2.9.11 release | shadow80 observe | C35-T redirect |
|---|---:|---:|---:|
| Kills | 73 | 79 | **82** |
| Deaths | **8** | 12 | 15 |
| Server-confirmed shots | 563 | 557 | **651** |
| Hit events | 342 | 431 | **482** |
| Distance, m | 5,140.52 | 5,704.49 | 5,627.36 |
| C35-T offers | N/A | 260 | 205 |
| C35-T modified ticks | 0 | 0 | **571** |
| C35-T modified firing ticks | 0 | 0 | 13 |
| Agent errors | 0 | 0 | 0 |

Per-gun results, `observe → redirect`: AA-12 kills **34→29**, deaths **10→11**, shots **190→187**, modified ticks 246; MP5SD kills **14→9**, deaths **1→2**, shots **141→121**, modified ticks 192; M4A1 kills **31→44**, deaths **1→2**, shots **226→343**, modified ticks 133. The apparent aggregate improvement is thus driven by M4A1, while the shotgun and SMG groups worsen. Per-weapon samples are small and were not separately powered.

5,000 matched-*setup* bootstrap draws (unit = setup, not shot/pellet) for **redirect / observe**: kills **[0.727, 1.347]**, deaths **[0.857, 1.857]**, shots **[0.823, 1.499]**, hits **[0.818, 1.399]**. The kill interval includes harm, death interval includes increased deaths, and the shot interval fails the 0.95 retention gate. **Do not promote**.

## Validity and regression

- Read-only hash audit of all 36 match outputs and registered sources; 24 research-arm datasets fully present; C21 **127/127** assignment hashes matched immutable C21 algorithm.
- Zero fire suppression/injection and zero agent errors; `serverShots` matches authoritative results in all 24 research matches.
- **8/8** new C35-T focused tests, including engine-coordinate projection, actual redirect exposure, unchanged fire/aim/slot, team filtering, static-cover refusal, C21 upstream conflict refusal, monotonic time, and end censoring.
- All Node.js tests **1,190/1,190 PASS**; official engine **733/733 PASS**; Python applicable regressions **82 PASS, 5 historical source-fingerprint SKIP** (87 run).
- Full five-mode release smoke: TDM, SND, HP, BR, Zombies **5/5**, zero agent errors.
- 32-second same-seed observer on/off parity: C35C dataset, C35G shot audit, C35H macro audit **byte-identical**; gameplay equal after ignoring timestamp and extra diagnostic field.
- Production agent sha256 stays `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Limits, interpretation and next direction

This experiment establishes *actual motor actuation*, not verified dodging. The safety proof is confined to public delayed static geometry and command keys; dynamic foam, unseen enemies, cover quality, route constraints and hostile fire are not fully modeled. Higher shots and hits may be due to trajectory changes, not to intrinsic fire quality. It is not a human-player or internet-lag benchmark. Twelve setups are insufficient to separate weapon, map and lag interaction robustly.

**Reject current C35-T redirect**; preserve the source/recorded evidence for future neural teacher experiments without applying it to production. For C35-U, prioritize (a) independent route-direction quality scores conditioned on weapon/map/cover; (b) safe no-op and explicit *retreat/strafe* alternatives instead of maximizing approach velocity alone; (c) larger repeated-seed long matches and pre-registered death/shot non-inferiority gates. Never train on server-after-step labels as if they were observations known at decision time.

## Reproduction

From ZIP root: `node --test tests/*.test.mjs`; `(cd lab/arena/source-main && node test/run.js)`; `python3 scripts/run-c35r-python-regressions.py`; `python3 scripts/analyze-c35t-pilot.py`; `node scripts/verify-c35t-independent.mjs`. Data is SHA-frozen in `reports/c35t/target-relative-36-v1`. Re-running the preregistration runner does not overwrite completed match records.
