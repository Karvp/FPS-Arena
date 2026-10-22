# FPS Arena v2.9.11 — C24 Projectile/Threat Cue Audit

- Add `lab/arena/threat-trace-observer-c24.mjs`: telemetry-only historical public shot cues (after delayed delivery) and authoritative hostile weapon-hit/shot/tracer-proximity labels (after assignment). Engine uses hitscan; displayed tracer endpoints are not physical projectiles in flight.
- Integrate `--c24-dataset` into `lab/arena/train-main.mjs` without modifying production `page-agent.js`, C16 safety eligibility, C22 randomized action assignment or engine combat.
- Add `lab/arena/evaluate-threat-cues-c24.mjs`: strict C21/C22 compatibility, preregistered endpoint validation, match-aware exposure, action coverage and explicit neural-training rejection under sparse defensive signals.
- Add `lab/arena/run-threat-study-c24.mjs`: resumable registered 18-match study, six map/weapon strata, 75 seconds, fixed 65-ms lag, new independent seeds and source fingerprint.
- Add `scripts/verify-c24-provenance.py` and ten tests validating no future data leakage, malformed tracer geometry, non-overlapping labels, early censoring and tamper detection.
- Collected 18/18 matches, 82 randomized eligible encounters, 79 complete 1.8-second windows, 6 windows with hostile weapon hits, 15 with tracer proximity. Whole-match server audit: 5,442 hostile shots, 611 nearby displayed tracers, 126 weapon-hit events. These are not predicted bullets or validated dodge superiority.
- Full AI tests: 908/908 pass. Uploaded-main engine 733/733 pass; 5/5 smoke modes; production bundle unchanged. Same-seed C22/C24 gameplay parity: 18/18 metrics and identical offer sequence.
- No neural policy trained or deployed, no production actuation, no GitHub push. Training gate remains BLOCKED.
