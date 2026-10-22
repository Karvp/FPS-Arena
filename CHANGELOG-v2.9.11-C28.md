# C28 — Controlled Encounter Value Evaluation

- Added `lab/arena/counterfactual-fire-c28.mjs`, three-arm paired scripted microencounters invoking authoritative main-server `fireWeapon()`.
- Fixed realistic per-weapon interval and magazine limit, kept identical shot RNG seeds between alternative arms.
- Added immutable preregistered study generator, development vs sealed holdout dataset files and independent 720-case replay verifier.
- Trained 10→24→12→3 action-conditional PyTorch MLP with validation-only selection and frozen weights.
- Reported independent test and 4,000-resample weapon-stratified paired bootstrap, plus post-hoc subgroup sensitivity.
- Production autopilot and page-agent.js unchanged; research-only, not approved for promotion.
