# FPS Arena v63 — Persistent Research Checkpoint

Verified on 2026-10-23. Canonical Windows codebase: `C:\Users\admin\Codes\FPS-Arena-TDM-Neural`.

## Scope and provenance

- The persistent simulator baseline is **C35AJ**, NOT fully restored v57–v59 source. V60/V61/V62 preregistrations and controller/runner SHA-256 remain unchanged.
- V63 implements **regularized paired-arm contrastive action-value research**, not another unvalidated large MLP. Four arms from the same starting simulator state: Keep / Close / Strafe / Withdraw.
- Actor features are pre-action public state only; authoritative server and PRNG are witnessed for independent replay auditing, not consumed by the critic.
- `lab/arena/tdm-v63-contrast-inference.mjs` and all trained weights are **shadow-only** and have no game-control integration.
- Production Classic LibreWolf, original Passive/Aggressive experts, and official game-server code have not been changed.

## Retrospective historical training (V61/V62 only)

- 23 independent triggered seed groups, 92 paired arm outcome observations. Utility = kills − 2×deaths − damageTaken/75 within the registered 480-tick window. Hazard = any damage or death.
- V63 fixed Ridge regularization: state alpha 48; arm alpha 24; interaction alpha 48. Train on group-centered arm differences to reduce overfitting; score leave-one-entire-seed-group-out. Threshold: minimum predicted utility gain 0.15 with max predicted hazard increase 0.025.
- **Historical results (utility MSE / hazard Brier; lower is better):**
  - constant baseline 1.09329 / 0.15883
  - state-only 1.09520 / 0.16865
  - arm-only shrinkage 1.09931 / 0.16383
  - arm-conditioned shrinkage **1.10753 / 0.16942**
  - former v62 action MLP: 2.72171 / 0.27453
- Ridge regularization substantially reduced errors versus v62 MLP, **but still does not outperform the constant baseline**.
- Arm-conditioned model retrospective shadow selection: 5/23 non-Keep, +0.0104 mean utility gain, +0.087 mean observed hazard increase. No promotion.

## Prospective independent-seed evaluation

- Registry: `research/tdm-v63-prospective-registry.json`
- Frozen prospective registry SHA-256: `9a6046f27c373ff434c3c32006e560f0de0c42fe435b92c00494d8aaea6e507f`
- Pre-fitted, frozen model SHA-256: `6c9d43e2f76de6b64a7134abcad66e17401b77d17dd399754ab12746b946dc5c`
- Model and decision thresholds were frozen **before** 14 independent prospective seed groups / 56 runs were executed. No retraining or tuning on these 14 groups.
- Independent audit 14/14 PASS; all 14 triggered, 11 groups had at least one in-window combat/hazard event; original 4 sealed holdouts from V61/V62 remain untouched.
- Prospective utility MSE: constant **0.62279**, state-only 0.59965, arm-only 0.59407, arm-conditioned **0.59678**.
- Prospective hazard Brier: constant **0.16924**, state-only 0.16366, arm-only 0.16752, arm-conditioned **0.17426**.
- Paired independent-group bootstrap improvement arm-conditioned vs constant:
  - utility MSE improvement mean **+0.02601**, 95% CI **[−0.10290, +0.15105]**, includes 0;
  - hazard Brier improvement mean **−0.00502**, 95% CI **[−0.03014, +0.02200]**, includes 0.
- The frozen model proposed changing from Keep on just **2 of 14 groups**; observed utility gain +0.09143 per group on average, but the 95% CI **[0, +0.27429]** includes 0, and observed hazard rose by +0.07143 on average.
- **Decision: NO PROMOTION**. Neither consistent hazard prediction nor a non-increasing hazard rate has been demonstrated. Only short research-window outcomes were evaluated, **not naturally completed full-match TDM**.

## Tests and artifacts

- Focused tests V60–V63: **23/23 PASS**, including **20 independent Python Ridge vs JS parity predictions**.
- Full test suite under `tests/*.test.mjs`: **1345/1346 PASS**; exact same historical malformed Windows path failure `C:\C:\Users\...`, 0 new failures.
- `scripts/tdm_v63_contrastive.py`: frozen-design training and retrospective leave-one-group-out evaluation.
- `scripts/tdm_v63_prospective.py`: preregistration, verified four-arm simulator runs, independent audit and frozen-model evaluation.
- `research/tdm-v63-contrast-model.json`: trained shrinkage weights; `research/tdm-v63-retrospective-evaluation.json` and `research/tdm-v63-prospective-evaluation.json`: metrics.
- `research/tdm-v63-prospective-audit.json`: arm-level audited outcomes and SHA-256.
- `research/tdm-v63-python-js-parity-fixtures.json`: independent prediction parity fixtures.
- **56 new prospective JSON trial artifacts** in `data/v63/` are selectively force-tracked in Git; long stdout/debug logs remain outside Git.
- A SHA-256 manifest `research/tdm-v63-locked-manifest.json` records code, report and every raw trial artifact.
- The previous 108 V61/V62 raw match JSON remain tracked. One canonical repository only; no source ZIP duplication.

## Next step (v64)

Avoid tuning the v63 model to the prospective negatives. Investigate improving public tactical observability (map cover, teammate support, target movement/LOS) and stronger causal action outcomes using *new preregistered* seed groups, then evaluate natural full-match TDM survival. Keep the sealed V61/V62 holdouts closed until a model robustly beats simple baselines.
