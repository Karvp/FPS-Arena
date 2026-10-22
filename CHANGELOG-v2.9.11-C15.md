# FPS Arena v2.9.11 — Continuation C15 (2026-10-12)

**Research-only:** Faster, conservative resampling of previously rejected tactical opportunities. Main engine is the user's uploaded `fps-arena-main(1).zip` integrated at C7. Live LibreWolf extension is byte-for-byte identical to C14.

- New `lab/arena/safe-action-explorer-c15.mjs`, subclass of C14: retry after a rejected safety-gate scan at most once every 0.12s, while retaining the original 0.9s cooldown after a valid offer, 0.16s intervention, all C14 gating checks, command interruption and no game RNG.
- New `--c15-dataset` flag for `lab/arena/train-main.mjs` (mutually exclusive with C14 dataset); supports `--c14-force-arm` for explicitly marked nonrandomized diagnostics and ordinary match-level treatment/control randomization.
- New provenance and primary rejection-reason telemetry; each offer remains an observational outcome, never a fabricated alternative-action reward.
- New `lab/arena/evaluate-probe-scheduler-c15.mjs`, `scripts/run-c15-study.py`, `scripts/analyze-c15-study.mjs` and 10 regression tests.
- Measured matched-control opportunities on 12 fixed seed/map/loadout scenarios ×32s: C14 6; C15 18 (+12, 3×), with identical gameplay output in all pairs. 2,781 C15 probes, 2,763 rejected.
- On 12 forced-treatment diagnostics: 2 more kills in two scenario pairs (+4 aggregate kills), zero cases with lower kill count, 10 unchanged. **Not a randomized effectiveness claim.**
- On eight independent randomized episodes: 5 control, 3 treatment; only 3 control and 2 treatment episodes exposed to offers. This does not satisfy a policy-learning / deployment gate.
- Tests: 822/822 AI; 733/733 main; 5/5 smoke. Same production `page-agent.js` hash as C14.

Known limitations: up to ~7 safety probes/s in the 12-pair headless sample instead of the coarse C14 scan; possible compute overhead; small and heterogeneous match sample; only static public geometry, not dynamic threat guarantees; no live browser testing; no policy trained or promoted; no GitHub push.
