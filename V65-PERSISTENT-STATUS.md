# FPS Arena TDM — V65 persistent full-natural-match research

Date: 2026-10-23. Canonical persistent Windows codebase:
C:\Users\admin\Codes\FPS-Arena-TDM-Neural

## Provenance and scope
- Parent baseline/tag: C35AJ research, research-v64-public-context (commit 68e76de). This is NOT a full restoration of v57–v59.
- NO changes to production Classic LibreWolf, neural Passive/Aggressive shipped weights, official engine or prior frozen v60–v64 controller/registry.
- V65 is a new **research protocol** on the verified frozen V64 action-arm runner. It does NOT train/deploy a neural actor.
- Actor inputs use public delayed snapshots and static client map. Private authoritative prestate + deterministic PRNG state are hashed only for replay auditing.
- The four research arms are Keep, Close, Strafe, Withdraw, with up to 150 ticks WASD-only intervention following a single public aim-lock cue.

## Frozen natural-end study
- Registry: research/tdm-v65-fullmatch-frozen-registry.json
- Frozen SHA-256: f0f3508f54be3a15c8b03ce4a107d00b541652d54701026400789fd6734114a0
- 6 new independent seed groups × 4 research arms = **24 actual authoritative Game.step() TDM runs**.
- Full-match mode stops when server transitions from match to results after a team reaches 50 kills. The maximum permitted 600-second simulation guard was *not* mistaken for natural completion.
- All 24/24 ended naturally, 0 censored. Match durations 133.77–177.18 simulated seconds (mean 161.014).
- Independent paired audit: 6/6 PASS, all 6 triggered with identical per-arm pre-action server/RNG witness, public features, command-prefix hash and initial counters; 0 engine errors.
- The trainee team was red in all 24 matches and reached 50 team kills in 23/24. This is descriptive performance against official simulator bots, not an incremental treatment effect or competitive human play validation.
- The seed 441109 used to check natural completion is engineering calibration, excluded from the frozen discovery cohort.
- Two new V65 sealed holdouts remain unopened, as do all prior sealed holdouts.

## Matched independent-group comparisons versus Keep
Reported statistics are means of **six paired match-seed differences**, not tick-level pseudoreplicated events. Positive net kills is favorable; positive deaths/damage is unfavorable.

| Arm | mean Δ net kills, 95% paired-group bootstrap CI | mean Δ deaths, CI | mean Δ damage taken, CI |
| --- | --- | --- | --- |
| Close | 0.000 [−4.000,+4.500] | +0.167 [−0.333,+0.667] | **+49.333 [+2.500,+95.833]** |
| Strafe | +0.333 [−3.342,+4.333] | −0.167 [−0.667,+0.333] | +2.667 [−102.004,+117.500] |
| Withdraw | +1.667 [−3.667,+6.000] | −0.167 [−1.000,+0.667] | −4.167 [−123.833,+116.167] |

There is no strict positive net-kills lower CI for any arm, and risk CIs do not establish nonincreasing deaths and damage. Close's damage increase is particularly concerning in this small sample.

## Promotion criteria and decision
- Preregistered minimum: **12 independent naturally completed, triggered, matched seed groups**, net-kills difference bootstrap lower bound > 0, upper 95% bounds for deaths and damage <= 0, followed by sealed holdout and representative human/opponent validation.
- Current study has only **6 groups** (all 24 runs natural), and no arm satisfies the strict survival promotion gate.
- **REJECT PROMOTION.** Classic extension and production weights remain unchanged. Do not reinterpret 23/24 team wins as proof that a new action policy improves over Keep.
- True full-match K/D can be influenced by timing of score-50 server termination, divergent post-treatment RNG, and teammate behavior; this is matched-seed simulation evidence, not proof of causal superiority on real human lobbies.
- Short 480-tick outcome labels from V64 were not conflated with full natural-match kill/death outcomes.

## Reproducibility and tests
- scripts/tdm_v65_fullmatch.py: preregistered seed list and source hashes, full natural match runner, matching-state/source audit, matched-group bootstrap.
- tests/tdm-v65-natural-end.test.mjs: 4 tests checking frozen source, all 24 raw results, natural completion/censoring logic and untouched holdouts.
- Focused V60–V65 suite: **34/34 PASS**.
- Entire tests/*.test.mjs regression suite: **1356/1357 PASS**; only the historical C:\C:\Users\... malformed Windows path error remains; 0 new failures.
- research/tdm-v65-fullmatch-independent-audit.json: per-arm SHA-256 and paired witness audit.
- research/tdm-v65-fullmatch-evaluation.json: frozen group-bootstrap deltas and strict no-promotion gate.
- All **24 raw full-match JSON files** are force-tracked under data/v65/ in the single persistent Git repository; debug process logs are left ignored.
- research/tdm-v65-locked-manifest.json records hashes of source, registrations, reports and every raw trial. There is no separate versioned source ZIP.

## Forward work
V66 should extend independently preregistered *new* natural 4v4 TDM seed groups (not resample the same ones or tune to these revealed outputs); challenge on more diverse map/weapon and opponent settings, and develop a model that has demonstrated hazard calibration better than constant prior. Avoid automatic promotion until survival CIs and independent holdouts pass.
