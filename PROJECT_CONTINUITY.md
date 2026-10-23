# Current checkpoint — V63: frozen prospective model rejected

- Canonical Git tag after release: research-v63-prospective-shadow
- The source baseline remains C35AJ. Older v57–v59 complete source is NOT present.
- V63 retrospective: trained regularized paired-arm contrast model on 23 independent V61/V62 seed groups (92 observations). Historical action-conditioned MSE 1.1075 vs constant 1.0933; hazard Brier 0.1694 vs constant 0.1588.
- V63 prospective: 14 fresh seed groups / 56 branches, frozen beforehand and audited 14/14 PASS. Utility MSE 0.5968 vs constant 0.6228; hazard Brier 0.1743 vs constant 0.1692. Average hazard increase 0.0714; CIs do not support improved utility. No promotion.
- 56 raw V63 trial JSON added to Git. All parent v60–v62 hashes still valid.
- Four old sealed holdout groups remain unused.
- Latest report: V63-PERSISTENT-STATUS.md
- Latest preregistration: research/tdm-v63-prospective-registry.json (SHA 9a6046f27c373ff434c3c32006e560f0de0c42fe435b92c00494d8aaea6e507f).
- Next: V64 new public cover/LOS/teammate context features with fresh seeds; no training on the frozen V63 prospective evaluation labels without a separate clearly marked discovery split.

---
# Current persistent checkpoint — v62

- Git tag: research-v62-discovery-shadow (created after final commit verification)
- Base: C35AJ; older v57–v59 is not imported.
- New v62 18 seed groups / 72 branch replays, independently audited PASS.
- Pool V61+V62: 23 triggered independent groups, 19 event-positive, 92 arm samples.
- PyTorch action-conditioned MLP trained; JS parity 16/16. Strict policy gate FAIL; constant baseline beats both MLPs.
- Production/Classic LibreWolf and original Passive/Aggressive expert weights unchanged. V60/V61 registries frozen.
- Frozen registry SHA256: 08887eb588ed6c66ad54b74ff986d566331ffe37e5cd284a2165c8b87cd4b846
- Full research status: V62-PERSISTENT-STATUS.md
- Durable evidence includes 108 selected raw match JSON files tracked in Git (no gigabyte report history).
- All 4 sealed holdouts (2 V61 and 2 V62) are untouched.
- Development continues in this SAME codebase. Do not create parallel source trees or many ZIPs.

---
# FPS Arena TDM Neural — Persistent Codebase

**Canonical Windows path:** `C:\Users\admin\Codes\FPS-Arena-TDM-Neural`
**Policy:** one mutable codebase, Git commits for history, no versioned copies of source trees.

## State verified on 2026-10-22
- Host machine: LocalBridge Native 0.25.1 connected and approved.
- Local baseline: FPS Arena v2.9.11-C35AJ source imported from the archive listed in `LOCAL_SOURCE_PROVENANCE.json`.
- 974 source files (90,652,030 uncompressed bytes) restored; bulky historical `reports/` omitted intentionally.
- **This is NOT yet the full v57/v58/v59 development tree.** Original v57 complete source exists in ChatGPT Library `/FPS ARENA AI/` under `FPS-Arena-v2.9.11-TDM-Dual-Neural-v57-Full-Research-Source.zip`; v58/v59 experiments have not been fully restored to this host.
- The v57 Full Source, v57 Incremental, and later conversation/sandbox checkpoints are separate from this on-disk C35AJ baseline. Never claim they are synced until import, tests and provenance verification complete.

## Current research status (conversation evidence, NOT host-reaudited)
- v55/v56 randomized action-conditioned critic did not exceed state-only baseline; not promoted.
- v57 deterministic replay branching passed matching-prestate tests and created a *shadow* critic, but no production promotion.
- v58 public-state triggering: 16 train groups (64 branches), 10 triggered, 4 hazard-positive groups. Utility model validation did not beat state-only. The v58 code/logs from its transient sandbox **are not certified present here**.
- v59 soft-LOS discovery: 8 groups (32 branches), all activated at tick 360 — protocol triggers too early, and original complete logs aren't available on this host. Do not treat old summary as local audit.
- v60 next: stratified, delayed public-only trigger conditions with deterministic four-arm replay and independent per-group audit; only train if there is sufficient independent reward/hazard variation.
- **Keep production intact:** Classic LibreWolf extension, V29 Passive/Aggressive weights and V31 gate unchanged until explicit promotion.

## Working discipline
1. Start from this path for all LocalBridge tasks. Do not create a new vNN source folder.
2. Before edits: inspect `git status`, tests, `LOCAL_SOURCE_PROVENANCE.json`, and this file.
3. Import newer full source via `tools/Import-FPSCheckpoint.ps1` from a locally saved ZIP. Do not overwrite the Classic extension automatically.
4. Keep large tick logs and replay data in `data/` or `reports/` (Git-ignored), and record their manifests/checksums in tracked JSON.
5. Use commits and tags for research versions, not duplicate directories. Keep separate untouched holdout registries and classify censored matches correctly.
6. No promotion based on action-change counts, shots or a few cherry-picked seeds. Independent seeds/matches and survival are decisive.

## Current limitation / required sync
Full synchronization to the last sandbox research state is **pending**. A locally accessible trusted v57 Full Research Source archive is needed for a one-time overlay import; see `tools/Import-FPSCheckpoint.ps1`. v58/v59 experimental artifacts require separate recovery or reconstruction. Do not mislabel C35AJ files as v57/v59 source.
