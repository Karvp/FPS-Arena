# FPS Arena C31 — Controlled Enemy-Weapon Generalization

- Added opt-in `--c31-dataset` / `--c31-policy` / `--enemy-primary` research path to authoritative Game.step simulator; assigns bots a controlled primary **before** match start.
- Added `ResearchPolicyC31` with unchanged C16 safety-gated action behavior and frozen C30 neural weights. It audits delayed public weapon against server weapon truth **after** action selection.
- Preregistered 36×75s transfer pilot and 108×105s paired-policy efficacy games across six enemy guns; registered gate PASS, no model promotion.
- Implemented independent seed-cluster bootstrap and paired sign-flip, per-weapon breakdown, posthoc frozen model input-feature reliance audit, M4A1 parity fixture.
- Critical finding: weapon identity changes decisions but dynamic within-weapon geometry has limited effect; neural underperforms always-left in point estimate. No shipped extension change.
- 962/962 AI, 733/733 game tests, 5/5 mode smoke, 16/16 baseline parity; code/report/data checksummed.
