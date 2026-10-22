#!/usr/bin/env python3
"""C10 deterministic paired simulation, no claim of statistical significance."""
import json, subprocess, pathlib, time, argparse
root=pathlib.Path(__file__).resolve().parents[1]
work=root/'reports/c10'
work.mkdir(parents=True,exist_ok=True)
scenarios=[('arena','mp5sd',910501),('foundry','aa12',910502),('neon','m4a1',910503)]
profiles=['release','director-ballistic-shadow-lab','director-motion-shadow-lab','director-motion-recovery-lab']
rows=[];seconds=35
for map_id,weapon,seed in scenarios:
 for profile in profiles:
  f=work/f'{map_id}-{weapon}-{seed}-{profile}.json'
  cmd=['node','lab/arena/train-main.mjs','--profile',profile,'--modes','tdm',
       '--episodes','1','--seconds',str(seconds),'--seed',str(seed),
       '--classic-maps',map_id,'--trainee-primary',weapon,
       '--bots','5','--opponents','stress','--lag-ms','65','--out',str(f)]
  run=subprocess.run(cmd,cwd=root,capture_output=True,text=True,timeout=100)
  if run.returncode:raise RuntimeError(f'{profile} {seed} failed: {run.stderr[-600:]}')
  j=json.loads(f.read_text())['results'][0]
  fields=['kills','deaths','shots','hits','damageDealt','damageTaken','errors','directorPlanSelectionCount','directorCandidateAudit','directorDiagnosticCounts','firstShotAt','finishedNaturally']
  rows.append({'map':map_id,'weapon':weapon,'seed':seed,'profile':profile,**{k:j.get(k) for k in fields}})
  print(map_id,weapon,seed,profile,'K/D',j['kills'],j['deaths'],'motion',j['directorCandidateAudit'].get('motionSites',0),flush=True)
result={'version':'C10','authoritative':'headless uploaded-main Game.step()','seconds':seconds,
  'lagMs':65,'opponents':'stress','profiles':profiles,'rows':rows,
  'limitations':['capped TDM episodes','fixed seeds','shadow is observational only','no human latency jitter']}
(work/'paired-main.json').write_text(json.dumps(result,indent=2))
print('Done',len(rows),'episodes')
