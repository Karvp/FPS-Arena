# v2.9.11-C6 — Episode-Level Tactical Exploration (research only)

- Episode-level Bernoulli assignment via a seed-based hash, independent of game RNG and targets.
- Headless lab profiles `director-engagement-episode-lab`, `director-engagement-episode-treatment-lab`, `director-engagement-episode-control-lab`.
- Each safe opportunity respects a single match-level arm while retaining the pre-existing safety shields.
- Episode assignment is logged even when no opportunity becomes eligible.
- Exporter audits independent match contexts, forced arms, duplicate seeds and empty opportunities.
- This branch starts from the locally verified C5 checkpoint. **No upstream GitHub main repository was accessible to merge.**
- No production/autopilot policy changes or neural-network activation.
- C6 exporter hardening: reject inconsistent arm labels, propensity complements, random-vs-forced design metadata and algorithm identifiers; two additional regression tests.
- Final local validation: 736/736 automated tests passed; six randomized episode contexts collected, zero safety-qualified offers; no measured treatment effect.
