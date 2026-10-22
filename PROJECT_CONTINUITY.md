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
