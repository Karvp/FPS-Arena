# v2.9.11 C35-B — Dose Reliability Experiment (research-only)

- Added `lab/arena/micro-action-reliability-c35b.mjs` as a C35 subclass: preregistered 80/120/160-ms dosing with C21/C16 preserved; logs safety refusal reasons after interruption and descriptive public displacement at 100/300/900 ms.
- Added independent `--c35b-*` flags to `lab/arena/train-main.mjs`, with strict mutual exclusivity and controlled enemy weapon configuration.
- Added `tests/micro-action-reliability-c35b.test.mjs` (12 dedicated tests).
- Added `scripts/run-c35b-reliability.py` source-hash-locked 108-match runner, `scripts/verify-c35b-reliability.py` independent assignment/provenance verifier, and `scripts/analyze-c35b-reliability.py` paired-setup bootstrap nuisance analysis.
- 108 of 108 registered matches; 1,072 offers, 1,061 complete windows, 12 hit positive. Shortening to 80 ms reduced interruption, but observed rate 30.3% still fails 5% gate. Macro priority interrupts are predominant (231/320).
- No modifications to the production agent, authoritative engine, C16 safety threshold or C21 randomizer; no causal combat efficacy/neural deployment claim.
