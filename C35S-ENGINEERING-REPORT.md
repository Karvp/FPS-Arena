# FPS Arena v2.9.11 — C35-S Engineering Report

**Checkpoint:** C35-S — Public Weapon-Aware Shotgun Gap Closing Research  
**Status:** engineering PASS; **policy REJECTED (zero treatment exposure)**.  
**Production policy:** unchanged. No C36 neural-model promotion.

## Hypothesis and changes

Prior C35-R found frequent pellet losses and poor conversion to kills. C35-S tests a highly bounded policy to step toward a publicly observed enemy when firing an AA-12 at a distance exceeding the weapon's effective falloff. C35-S is **headless-only, opt-in** (`--c35s-policy approach` with trace + C35C shadow80 + C35H observe and C35G); no change to the browser extension or `page-agent.js`.

Implementation: `lab/arena/weapon-aware-approach-c35s.mjs` reads only the delayed public target list, numeric/string normalized team, aim direction, snapshot age, weapon range, map geometry, and player movement state. It must not alter fire, aim, yaw/pitch, reload, weapon, skill, or an incumbent movement key. The v2 arm also offers movement during non-firing idle moments (HP>=55) when the AA-12 target is 17–48 m away and the public forward corridor is clear. Conditions are rechecked each tick. C21/C16 continue independently.

This is a deliberately conservative hypothesis test; **a policy must actuate in actual matches before efficacy can be measured**.

## Frozen experiments and results

Both exploratory designs were SHA-locked before their own match execution. V1 consists of 12 setups x 3 arms x 90 s; v2 consists of 12 **fresh** setups x 3 arms x 90 s = **72 authentic TDM matches, 108 simulated minutes**. Each setup is matched for seed/map/bots/opponents/latency/AA-12. Three arms:

- `release`: original v2.9.11 production `page-agent.js` without micro exploration.
- `observe`: same production agent + C21/C16 `shadow80` motor exploration, C35-S only observes.
- `approach`: `observe` setup + C35-S actuation if guards pass.

**V1:** 36/36 matches, C35-S changed 0 motor ticks. The original condition required firing while no movement was already commanded. All server firing ticks in relevant games were accompanied by incumbent movement; this condition had no exposure. Historical v1 source hashes, preregistration, per-match checksums, and raw trials are retained; v1 was not rewritten to match v2.

**V2:** 36/36 matches, same absence of exposure after expanding candidate scope to non-firing idle-gap opportunities. `approach` vs `observe` was **exactly equal on all aggregate gameplay fields in all 12 matched setups**, as expected with zero changes.

| Metric, v2 12 setups, 90s per match | Release | Observe / Shadow80 | C35-S Approach |
|---|---:|---:|---:|
| Kills | 34 | 53 | 53 |
| Deaths | 11 | 17 | 17 |
| Server-confirmed shots | 181 | 339 | 339 |
| Hit events | 151 | 311 | 311 |
| Distance traveled, m | 5,154.72 | 5,679.94 | 5,679.94 |
| New C35-S motor ticks | 0 | 0 | 0 |
| Agent errors | 0 | 0 | 0 |

**Effect of C35-S itself is not identifiable (zero actuated motor ticks).** The `shadow80` vs release difference reflects prior C21/C16 micro actions, not C35-S. Shadow/release kills ratio 1.559; 5,000 matched-setup bootstrap 95% CI [0.930, 3.176], containing 1. These are simulated opponents, not human matches; samples are small.

## Independent audit and validation

- C35-S v2 preregistration SHA-256: `e336ea9658f25da00a5a9cc4d95f1821d2c2edd42c7b9e65256ccafc23cdcdbb`.
- C21 assignments **142/142 matching immutable C21 hash** over 24 v2 research-arm matches.
- Zero fire suppressions, fire injections, shot count disagreements, movement modifications, agent errors, or missing pre-action provenance.
- Source SHA-256 hashes and 36 v2 individual-match SHA-256 records verified; v1 per-match SHA-256 records independently checked.
- Node.js regressions **1,182 passed / 0 failed**, including **7 dedicated C35-S tests**.
- Official server engine **733 passed / 0 failed**.
- Python C35-series applicable historical tests **82 passed / 5 documented skips**; two C35Q source-SHA tests excluded by the inherited C35R regression runner because they verify a historical frozen source and are not applicable to a newer integrated source.
- Five-mode `release` smoke TDM/SND/HP/BR/Zombies **5/5, agent errors 0**.
- Production `page-agent.js` SHA-256 unchanged: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Decision and next work

**REJECT actuation promotion** of C35-S. This is a *negative exposure test*, not evidence of either combat benefit or harm. The existing agent already issues movement commands while firing. Requiring idle motion/standing creates an extremely small candidate set. Do not relax safety thresholds post hoc to imply success.

For C35-T, investigate **the actual incumbent movement vector**, target-relative closure rate, safety from real incoming fire, and map routes. Use a pre-registered active policy with demonstrable motor exposure, three-arm randomized assignment, delayed public-only action inputs, and paired TDM matched across map/weapon/lag. Aim for combat outcomes (kills, deaths, damage, shots and distance) rather than proxy movement counts. C36 remains blocked pending sufficient causal evidence.

## Reproduction

From archive root: `node --test tests/*.test.mjs`, `(cd lab/arena/source-main && node test/run.js)`, `python scripts/run-c35r-python-regressions.py`, `python scripts/analyze-c35s-pilot.py`, and `node scripts/verify-c35s-independent.mjs`.

The preregistration runner for **v1** (`scripts/run-c35s-pilot.py`) preserves the historical v1 source hash; it must not be rerun against v2 source. The **v2** runner (`scripts/run-c35s-v2.py`) will reuse already frozen per-match files. No historical source hash should be silently overwritten.
