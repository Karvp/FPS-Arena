# v2.9.11 — C35-AG (Sequence-Level Combat Value)

- Added opt-in `--c35ag-trace` six-second passive realized engagement recorder, with strict C35AD randomization provenance, nonoverlapping 7.5s offer spacing, run-length encoded actual movement/ADS/fire inputs and authoritative post-step outcomes.
- Preserved initial ADS propensity .5 and distinguished all downstream sequence elements as post-treatment, not counterfactual action effects.
- Added 24 setup × 3 arm frozen Game.step evaluation, independent assignment/CRC/SHA verification, six-second IPS/cluster bootstrap and factual trajectory CSV.
- Added offline one-second-prefix Ridge and 18→16→8→1 neural sequence predictor, full split-by-setup evaluation, frozen model weights and pure JavaScript inference parity (NOT wired to game).
- Added 12 JS and 5 Python regression tests. All 5 modes smoke-tested with feature disabled. No `page-agent.js` change; policy not promoted.
