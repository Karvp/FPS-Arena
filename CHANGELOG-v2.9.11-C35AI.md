# C35-AI — Physical Displacement and Tactical Options

- Added research-only per-tick authoritative physical observer, after-`Game.step()` only; input selection retains public-state-only boundary.
- Fixed phase attribution with exact C35-AH `activeOptionIndex`; regression locks off-by-one option boundary and forbids orphaned command modifications.
- Logged real travel, motion with changed commands, stalls, inertia with no motor command, and respawn/teleport discontinuities separately.
- Kept four invalid preregistrations and diagnostics; excluded their data from final study. Frozen v5 achieved 72 matched real-engine TDM runs.
- Independent source/assignment/server-parity/hash checks; 1319 Node + 733 engine + 164 Python applicable tests passed, 5 historical skips.
- Production `page-agent.js` untouched; no neural or tactic promoted.
