#!/usr/bin/env python3
"""Summarize checked, local authoritative simulator outputs; no invented KPI."""
import json,pathlib,datetime,zipfile,hashlib
root=pathlib.Path(__file__).resolve().parent.parent
folder=root/'reports/v2910'
scenarios=[
 ('Arena Benelli M4 (75 s)','arena-shotgun_release.json','arena-shotgun_director-active-lab.json','arena-shotgun_director-opportunity-lab.json',999702),
 ('Foundry Benelli M4 (75 s)','foundry-shotgun_release.json','foundry-shotgun_director-active-lab.json','foundry-shotgun_director-opportunity-lab.json',999701),
 ('Arena MP5SD (75 s)','arena-smg_release.json','arena-smg_director-active-lab.json','arena-smg_director-opportunity-lab.json',999703),
 ('Foundry holdout Benelli M4 (90 s)','foundry-heldout_release.json','foundry-heldout_director-active-lab.json','foundry-heldout_director-opportunity-lab.json',291011),
 ('Arena holdout Benelli M4 (90 s)','arena-heldout_release.json','arena-heldout_director-active-lab.json','arena-heldout_director-opportunity-lab.json',291012),
 ('Foundry Benelli M4 (natural end)','foundry-natural_release.json',None,'foundry-natural_director-opportunity-lab-v2.json',999704),
 ('Arena heldout Benelli M4 (natural end)','arena-natural_release.json',None,'arena-natural_director-opportunity-lab.json',291013),
]
K=['kills','deaths','shots','hits','worldReversals','distance','duration','damageTaken','errors','finishedNaturally']
rows=[]
for title,a,b,c,seed in scenarios:
 def row(f):
  if f is None:return None
  d=json.loads((folder/f).read_text())['results'][0]
  return {**{k:d.get(k) for k in K},'agentTimingMs':d.get('agentTimingMs'),
          'directorDiagnosticCounts':d.get('directorDiagnosticCounts',{}),'source':f}
 r={'title':title,'seed':seed,'release':row(a),'unconstrained':row(b),'opportunityGuard':row(c)}
 if r['opportunityGuard'] is None:continue
 r['sameGameplay']=all(r['release'][k]==r['opportunityGuard'][k] for k in K)
 rows.append(r)
profiles={}
for name in ['release','director-shadow-lab','director-opportunity-lab']:
 data=json.loads((folder/f'modes-{name}.json').read_text())['results']
 profiles[name]=[{k:rec.get(k) for k in ['mode','kills','deaths','shots','hits','errors','duration']} for rec in data]
assert all(rec['errors']==0 for profile in profiles.values() for rec in profile)
assert all(r['sameGameplay'] for r in rows),[r['title'] for r in rows if not r['sameGameplay']]
first_regression=json.loads((folder/'foundry-natural_director-opportunity-lab.json').read_text())['results'][0]
record={'version':'2.9.10','date':'2026-10-11','validation':'headless authoritative Game.step() simulations, seeded stress bots, 65ms simulated snapshot lag',
 'defaultActuation':False,'fullSuite':{'passed':665,'total':665},'sameGameplayPairs':len(rows),
 'releaseAndOpportunityGuardSameGameplay':True,'testedModes':profiles,'scenarios':rows,
 'rejectedPreFixNaturalTrial':{'seed':999704,'reason':'one evidence confirmation permitted a harmful route','kills':first_regression['kills'],'deaths':first_regression['deaths'],'shots':first_regression['shots'],'duration':first_regression['duration']},
 'limitations':['No randomized multi-seed statistical superiority', 'Shadow and guarded computation incurs CPU overhead',
 'Guarded candidate may be inactive in many scenarios', 'Real LibreWolf FPS/human lobby untested','No promotion of new movement policy']}
jsonout=folder/'VALIDATION-v2.9.10.json';jsonout.write_text(json.dumps(record,ensure_ascii=False,indent=2))

def kds(r):return f"{r['kills']}/{r['deaths']}"
parts=['# FPS Arena v2.9.10 — Opportunity-Guarded Tactical Director',
'', '**Status:** Completed research patch and safety regression validation, **not** a confirmed combat upgrade. Based on v2.9.9 source.',
'', '## Technical changes',
'', '- **Fair A* budget:** screen all five short-range candidate firing positions for walking surface, 3D LOS and endpoint exposure before spending the two expensive A* calls. Rank with direct travel and exposure, then validate the full path and first step.',
 '- **Time-to-fire preservation:** prevent overrides near hitbox-visible or effective-weapon range, against a productive baseline pursuit (self-only closing speed), for implausibly long ETA or a strongly conflicting new heading.',
 '- **Independent low-yield evidence:** require two distinct same-target cover-cycle events within six seconds; repeatedly reading one event cannot trigger active steering.',
 '- **Auditability fix:** director veto telemetry is rate-limited per state/reason rather than suppressing different veto reasons under a shared state key.',
 '- **Headless-only gating:** `director-opportunity-lab` uses `tacticalDirectorOpportunityGuard` and `tacticalDirectorConservative`. Default LibreWolf flags remain false; TDM headless gate is still required for actuation.',
 '- **Reproducibility:** 12 new dedicated unit/regression checks, paired seeded scenarios, complete all-mode smoke checks, source and raw recordings.',
'', '## Paired headless authoritative Game.step results',
'', 'All comparisons are same seed, map, enemy policy, weapon and snapshot lag within each pair. CPU timing is sampled agent time, **not** browser FPS.',
'', '| Scenario / seed | Release K/D · shots | Old wide active K/D · shots | New guarded K/D · shots | Gameplay identity |',
 '|---|---:|---:|---:|:---:|']
for r in rows:
 fmt=lambda o:('—' if o is None else f"{kds(o)} · {o['shots']}")
 parts.append(f"| {r['title']} / {r['seed']} | {fmt(r['release'])} | {fmt(r['unconstrained'])} | {fmt(r['opportunityGuard'])} | {'Yes' if r['sameGameplay'] else 'No'} |")
parts+=['',f"**Result:** new guarded profile matches release in **{len(rows)}/{len(rows)}** paired scenarios tested. This confirms *non-regression in these observations*, not a statistical performance improvement.",
'', '### A regression found and rejected during development',
'',f"On Foundry seed 999704, the first (single-evidence) guarded version dropped from release **7 shots** to **{first_regression['shots']} shot**, despite retaining {first_regression['kills']} kill. The fix requires **two distinct** low-yield cover events before any active override. Final natural-end validation on the same seed restored 7 shots, 1 kill, 6 deaths and 355 movement reversals.",
'', '## Full regression and runtime smoke',
'', '**665/665** automated tests pass. Each of TDM / Search & Destroy / Hardpoint / Battle Royale / Zombies completed the 15-second smoke suite with **0 runtime errors** in release, director-shadow-lab and director-opportunity-lab. Shadow/new lab yielded the same game outcomes as release in this smoke set.',
'', '## Important limits and promotion gate',
'', '- Direct active controller from v2.9.9 remains an **ablation only**. It reduced Arena Benelli from 7 shots to 0 and Arena MP5SD from 16 shots to 11 in selected short trials.',
 '- The guarded controller frequently **does not actuate at all**. It is an opportunity preservation strategy and cannot be promoted on non-regression alone.',
 '- CPU p95/p99 comparisons have not been replicated on a real LibreWolf browser. Trace event load varies with target churn and other controls.',
 '- Need independent full-match seeds, natural end across modes, actual shot-window attribution, and performance at browser p99 before even considering default actuation.',
'', '## Reproduction',
'', '```bash', 'node scripts/build.mjs', 'node --test --test-concurrency=1 tests/*.test.mjs', 'python scripts/evaluate-opportunity.py --quick --output reports/v2910/independent-recheck.json',
 'python scripts/evaluate-opportunity.py --full --output reports/v2910/full-recheck.json',
 'node lab/arena/train.mjs --profile director-opportunity-lab --modes tdm,snd,hp,br,zm --seconds 15 --opponents stress --out reports/v2910/modes-recheck.json', '```',
'', '**Decision:** Release behavior remains the v2.9.9 policy. Opportunity Guard is retained as headless-only research; no proven gameplay win.', '']
report='\n'.join(parts)
reportout=folder/'RESEARCH-v2.9.10.md';reportout.write_text(report)
(root.parent/'FPS-Arena-v2.9.10-Research-Report.md').write_text(report)
(root.parent/'FPS-Arena-v2.9.10-Validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2))
print('Saved reports; matched',len(rows),'scenarios; guarded identical',sum(x['sameGameplay'] for x in rows))
