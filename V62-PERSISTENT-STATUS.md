# FPS Arena TDM v62 — Persistent Research Status

Verified research checkpoint, 2026-10-23.

**Canonical project:** C:\Users\admin\Codes\FPS-Arena-TDM-Neural
**Parent Git tag:** research-v61-discovery
**Scope:** additive new discovery cohort and exploratory MLP training on the C35AJ local simulator, NOT the newer v57-v59 source. Production / Classic LibreWolf / original Passive and Aggressive neural weights remain unchanged.

## Cohort registration and real simulator

- V62 registry: `research/tdm-v62-frozen-registry.json`, SHA-256 `08887eb588ed6c66ad54b74ff986d566331ffe37e5cd284a2165c8b87cd4b846`.
- Preregistered 18 new independent discovery seed groups, four arms per group (72 fresh Game.step runs), plus 2 unopened V62 holdouts.
- Immutable V61 runner, V60 controller, server engine and page-agent SHA-256 all verified against preregistration.
- Independent audit: 18/18 four-arm groups PASS. 17/18 triggered. 16/18 had at least one kill, damage or death within the prespecified 480-tick outcome window.
- Pooled V61+V62: 23 triggered independent seed groups; 19 groups with in-window events. Data sufficiency gate (16/8) PASS.
- Four arms are keep, close, strafe and withdraw, with only WASD modifications; original fire/ADS/aim/skills preserved by contract.
- Real PRNG state and selected authoritative server state are **auditing witnesses only**. Actor inputs and trigger decisions use delayed public state. This is deterministic replay branching, not full engine-memory cloning.
- Censored and nontriggering groups remain in audit, not in complete-outcome training.
- V61's 2 sealed holdouts and V62's 2 sealed holdouts are NOT opened.

## Trained exploratory neural critic

- Neural network is **real trained MLP**: public pre-action state + map/weapon/cue + arm onehot -> hidden tanh(10) -> utility and hazard heads, fit with PyTorch AdamW.
- Dataset: 23 independent groups, 92 action-outcome samples; 17 hazard-positive arm labels.
- Design: leave-one-**entire seed group**-out CV (23 folds) with fold-local normalization. Both state-only and action-conditioned MLPs trained under the same loss and optimizer. Constant rate/mean baseline included.
- Utility target: window kills - 2*window deaths - window damage/75. Hazard label: any window damage or death. These are research targets; not proof of optimal in-game reward.

| Held-group-out model | Utility MSE (lower better) | Hazard Brier (lower better) |
|---|---:|---:|
| Action-conditioned MLP | 2.721713 | 0.274531 |
| State-only MLP | 3.238434 | 0.297987 |
| Constant baseline | **1.093294** | **0.158833** |

- Paired seed bootstrap improvement (state-only minus action): utility +0.5167, 95% CI [-0.2821, +1.4787]; hazard Brier +0.02346, CI [-0.03195, +0.08440]. Both contain zero.
- **Decision: reject as a policy**. The action model improves relatively against the other overfit MLP but is far worse than the constant baseline. No neural controller promotion; no claims of human/pro-level gameplay.
- Hyperparameters were chosen as an exploratory demonstration after initial v62 discovery results were visible. Do not describe v62 MLP training hyperparameters as independently preregistered.
- Exported frozen shadow weights: `research/tdm-v62-shadow-neural-critic.json`.
- Independent PyTorch reference predictions: `research/tdm-v62-shadow-parity-fixtures.json`. JavaScript predictions agree for 16 cases in `tests/tdm-v62-shadow-critic.test.mjs`, but the JS inference module is not invoked by the game.

## Verification and persistence

- New unit tests + prior focus: 19/19 PASS (V60, V61, V62); all 16 cross-runtime parity cases passed.
- Full JavaScript suite under `tests/*.test.mjs`: **1,341/1,342 PASS**, same one historical Windows `C:\C:\...` path failure as before; 0 new failures.
- Registry verification `python scripts/tdm_v62_cohort.py verify`; independent audit `python scripts/tdm_v62_cohort.py audit`.
- Exact raw evidence: 36 V61 JSONs plus 72 V62 JSONs, just 817,711 bytes total, force-tracked in the same persistent Git repository to prevent future data loss. Long stdout/console logs remain in `data` outside Git. Historical `reports` multi-gigabyte archives remain excluded.
- Saved evaluation: `research/tdm-v62-shadow-evaluation.json`; full match-by-match audit: `research/tdm-v62-independent-audit-summary.json`.
- All final weights/registries/test fixtures/code and minimal raw evidence are retained in Git, not versioned project ZIPs.

## Next research decision

V63 should focus on model calibration and regularization plus *new*, held-out seed evaluation before changing the policy. Do not tune to previous sealed holdouts or expose server privileged state to the controller. In particular, the constant baseline beating both MLPs is strong evidence that current features/sample size are insufficient for robust action-value estimates.

No work beyond this checkpoint should alter the original V60/V61 frozen files without a new registration and explicit audit.
