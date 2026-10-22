#!/usr/bin/env python3
"""Deterministic paired main-engine ablation for C9. All settings are explicit."""
import json, pathlib, subprocess, time, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'reports'/'c9';OUT.mkdir(parents=True,exist_ok=True)
SCENARIOS=[
 {'seed':820501,'map':'arena','weapon':'mp5sd'},
 {'seed':820502,'map':'foundry','weapon':'aa12'},
 {'seed':820503,'map':'neon','weapon':'m4a1'},
]
PROFILES=['release','director-main-stats-shadow-lab','director-main-stats-recovery-lab',
          'director-ballistic-shadow-lab','director-ballistic-recovery-lab']
SECONDS=55
# Long-range sniper correctness has its own deterministic engine-geometry tests;
# excluded from this modest match sample to avoid a slow routing stress case.
rows=[]
for s in SCENARIOS:
 for profile in PROFILES:
  out=OUT/f"run-{s['seed']}-{profile}.json"
  cmd=['node','lab/arena/train-main.mjs','--modes','tdm','--episodes','1',
       '--seconds',str(SECONDS),'--seed',str(s['seed']),'--classic-maps',s['map'],
       '--trainee-primary',s['weapon'],'--opponents','stress','--lag-ms','65',
       '--profile',profile,'--out',str(out)]
  begin=time.perf_counter()
  p=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=180)
  if p.returncode:raise RuntimeError(f'{s} {profile} failed:\n{(p.stdout+p.stderr)[-2000:]}')
  raw=json.loads(out.read_text())['results'][0]
  audit=raw.get('directorCandidateAudit') or {}
  dc=raw.get('directorDiagnosticCounts') or {}
  row={**s,'profile':profile,'seconds':SECONDS,'kills':raw['kills'],'deaths':raw['deaths'],
   'shots':raw['shots'],'hits':raw['hits'],'firstShotAt':raw.get('firstShotAt'),
   'damageDealt':raw.get('damageDealt'),'damageTaken':raw.get('damageTaken'),
   'errors':raw.get('errors'),'routesAttempted':audit.get('routesAttempted',0),
   'routesValid':audit.get('routesValid',0),'earlyWindows':audit.get('earlyWindows',0),
   'plans':dc.get('director-planned',0),'commands':raw.get('directorPlanSelectionCount',0),
   'wallSeconds':round(time.perf_counter()-begin,3)}
  rows.append(row)
  print(f"{s['seed']} {profile}: {row['kills']}K/{row['deaths']}D {row['shots']} shots, "
        f"{row['plans']} plans, {row['errors']} errors ({row['wallSeconds']}s)",flush=True)
 (OUT/'paired-results.json').write_text(json.dumps({'engine':'uploaded-main-authoritative-Game.step',
    'method':'same seed/map/loadout, 65 ms snapshot lag, 5 stress bots, 55s capped',
    'scenarios':SCENARIOS,'profiles':PROFILES,'rows':rows},indent=2))
print('done',len(rows),'runs')
