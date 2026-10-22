# FPS Arena v2.9.11 — C35-AD Engineering Report

## Scope and decision

Checkpoint: **C35-AD — Safe Pre-fire ADS Impulse and Retention Study**. Engineering PASS; preregistered randomized trial PASS; live combat policy **NOT PROMOTED**; C36 neural control still BLOCKED. Original production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`, unchanged. Engine and AI agent are the original game artifacts; research controller is opt-in in headless Game.step() only.

## Design, source, replay

- **72 actual TDM matches, 24 paired setups** (6 guns × four setup seeds; 3 maps; 70/155/220 ms simulated lag; official/mixed/stress bots; 90s each), totaling **108 simulated match-minutes**.
- Three arms: original release, `shadow80` with passive observer, `shadow80` plus C35-AD randomized ADS controller. Release arm is context; randomized-vs-observe isolates C35-AD incremental control.
- Frozen registration SHA-256: `a5da2e3b7ef793eff94e4c40505ad75e603653e1db11ebafd40639841efe8f9b`; source SHA locks include controller, official engine weapon/combat code, original page-agent, runner, and new JS tests.
- Before-step eligibility from **public** fresh hostile, aim angle ≤14°, age ≤275ms, on-ground, no priority action, *no fire intent*, and no upstream command difference. No use of server bullet/damage/hit labels before decision.
- Per eligible offer PRNG deterministically assigns 50% control vs 50% toggle. Toggle inverts ADS for up to 0.28s if safety remains valid; NEVER changes ADS when firing, never changes fire/movement/yaw/pitch or any other command. Cooldown 1.2s, factual follow-up window 0.7s, unknown unchosen outcome stays `null`.
- **Replay**: passive C35-AD vs completely disabled: dataset, fire, macro and aim traces are byte-identical; gameplay identical excluding report timestamp and passive counters.
- Exposure: **1145** offers, **7252** modified ADS ticks, **1136** completed factual windows, **9** censored windows. 489 offers began in ADS; 656 began hip-fire. All six tested guns had treatment exposure.

## Entire-match outcomes (24 matches per arm)

| Metric | Release v2.9.11 | Observe shadow80 | Randomized C35-AD |
|---|---:|---:|---:|
| Kills | 214 | 204 | 218 |
| Deaths | 19 | 14 | 14 |
| Shots | 1055 | 1347 | 1258 |
| Hit events | 663 | 785 | 777 |
| Agent errors | 0 | 0 | 0 |

Matched randomized/observe kills ratio 1.0686, 95% setup cluster bootstrap CI [0.8054, 1.4333]. This interval contains 1; do NOT infer benefit or promote the controller.

## Pre-fire ADS experiment: intent-to-treat per eligible offer, NOT hit rate conditional on shooting

| Baseline ADS | Arm | Factual complete offers | Subsequent hit shots per 0.7s offered window | Subsequent shots/window |
|---|---|---:|---:|---:|
| ADS-on | control (retain ADS) | 256 | 0.9219 | 1.2461 |
| ADS-on | treatment (interrupt ADS) | 229 | 0.5983 | 0.8210 |
| Hip-fire | control (no early ADS) | 318 | 0.1855 | 0.2327 |
| Hip-fire | treatment (early ADS) | 333 | 0.1712 | 0.2372 |

95% setup-cluster bootstrap CI for **treatment-minus-control factual hit shots per offered window**: ADS-on [-0.6181, -0.0445]; hip-fire [-0.0940, 0.0623]. ADS interruption appears harmful over the short window; early ADS does not yet have a proven positive effect. Effects include changes in whether/how often the actor fires; they are **not per-fired-shot accuracy**. Each 0.7-second window follows a non-firing eligible tick; some windows have zero shots. Pellet multiplicity (shotguns) is nested within shot. Within-setup windows are not independent.

## Weapon coverage

| Gun | Total C35-AD offers | Control / toggle | Modified ADS ticks | Factual subsequent shots |
|---|---:|---:|---:|---:|
| aa12 | 223 | 125 / 98 | 1344 | 92 |
| hk_sl8 | 171 | 69 / 102 | 1459 | 183 |
| l115a3 | 135 | 61 / 74 | 851 | 37 |
| m4a1 | 190 | 100 / 90 | 1118 | 148 |
| mp5sd | 225 | 121 / 104 | 1264 | 85 |
| uzi | 201 | 102 / 99 | 1216 | 122 |

## Independent audit and regressions

- Preregistered source hash, all 72 match-output SHA checks: PASS.
- New randomizer assignments **1145/1145**, historical C21 micro assignments **241/241** recomputed independently. All **3660 shots and 7246 pellets** validated against official server authoritative C35-AA audit. Zero fire mutations.
- Node.js **1271/1271 PASS**, engine **733/733 PASS**, Python applicable **143 PASS + 5 historical skips**. Seven historical SHA-lock tests fail when applied to a newer source because their design intentionally freezes C35Q/C35U/C35V/C35W/C35Z/C35AA; excluded transparently, NOT rewritten. Raw unfiltered Python: 155 total, 7 old SHA failures, 5 skips.
- Five-mode smoke (TDM, SND, HP, BR, Zombies): 5/5, zero agent errors. C35-AD active intervention tested only in single-mode TDM; five-mode smoke does not exercise active C35-AD.
- Replay observe vs absent: 4/4 research traces byte-identical and match outcome equivalent.

## Limitations

- This is a randomized *short-duration ADS input* assignment, not randomization of permanent ADS strategy. Real movement inertia/ADS transitions and the bot's next decisions may limit effective contrast.
- Windows and setup-specific combat outcomes have interference/carryover. Bootstrap resamples setup, but 24 clusters only; nominal 95% interval is exploratory, not a definitive guarantee.
- No causal inference about which future shot target was hit from unexecuted actions; no off-policy Q(s,a) ground truth. Hit event definitions differ from pellet hit; separate authoritative ledgers are available.
- There is no browser/rendered-world deployment study, no human opponents or network jitter experiment, no production promotion.
- Preserve separate baselines: do not compare direct `release` vs `randomized` to claim effect of C35-AD; compare randomized to shadow80 observe.

## Next C35-AE proposal

Model **when to retain ADS across gaps** using randomized factual windows; explicitly encode weapon, target freshness, alignment, cover, fire-readiness and movement acceleration. First test an offline state-action value model versus state-only baseline on setup holdout; if supported, run independent matched long-form TDM before any deployment. Avoid claiming that continuously ADS is optimal (mobility/field of view costs are not yet identified).
