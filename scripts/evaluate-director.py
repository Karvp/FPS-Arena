#!/usr/bin/env python3
"""Reproducible authoritative Game.step() paired evaluation of release/shadow/active.
No promotion is inferred from a single seed. Does not modify production config.
"""
import argparse, json, subprocess, pathlib, sys, time
root=pathlib.Path(__file__).resolve().parent.parent
ap=argparse.ArgumentParser();ap.add_argument('--output',default=str(root/'reports'/'DIRECTOR-PAIRED-EVAL.json'))
ap.add_argument('--quick',action='store_true');ap.add_argument('--full',action='store_true')
a=ap.parse_args();dest=pathlib.Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True)
profiles=['release','director-shadow-lab','director-safe-lab','director-active-lab']
scenarios=[{'id':'foundry-shotgun','map':'foundry','weapon':'benelli_m4','seed':999701,'seconds':75},
 {'id':'arena-shotgun','map':'arena','weapon':'benelli_m4','seed':999702,'seconds':75},
 {'id':'arena-smg','map':'arena','weapon':'mp5sd','seed':999703,'seconds':75}]
if not a.quick:
 scenarios.extend([{'id':'foundry-shotgun-heldout','map':'foundry','weapon':'benelli_m4','seed':999704,'seconds':390,'natural':True}])
 if a.full:scenarios.extend([{'id':'arena-smg-heldout','map':'arena','weapon':'mp5sd','seed':999705,'seconds':390,'natural':True}])
metric_keys=['kills','deaths','shots','hits','damageTaken','damageDealt','distance','worldReversals','duration','finishedNaturally','errors','accuracy','agentTimingMs']
results=[]
for scenario in scenarios:
 rows={};print('SCENARIO',scenario['id'],flush=True)
 for profile in profiles:
  path=dest.parent/(f"director_{scenario['id']}_{profile}.json")
  cmd=['node',str(root/'lab'/'arena'/'train.mjs'),'--profile',profile,'--modes','tdm',
   '--seconds',str(scenario['seconds']),'--seed',str(scenario['seed']),
   '--classic-maps',scenario['map'],'--bots','5','--opponents','stress',
   '--trainee-primary',scenario['weapon'],'--lag-ms','65','--profile-agent','--out',str(path)]
  if scenario.get('natural'):cmd+=['--full-match']
  started=time.monotonic();p=subprocess.run(cmd,cwd=root,text=True,capture_output=True,timeout=210)
  if p.returncode:raise RuntimeError(profile+'\n'+p.stderr[-1200:])
  record=json.loads(path.read_text())['results'][0]
  rows[profile]={k:record.get(k) for k in metric_keys}
  rows[profile]['directorDiagnosticCounts']=record.get('directorDiagnosticCounts',{})
  print(' ',profile,f"K/D {record['kills']}/{record['deaths']} shots={record['shots']} reversals={record['worldReversals']} cpuP99={record.get('agentTimingMs',{}).get('p99')} elapsed={time.monotonic()-started:.1f}",flush=True)
 a0=rows['release'];b0=rows['director-shadow-lab'];fields=['kills','deaths','shots','hits','damageTaken','distance','worldReversals','duration','finishedNaturally','errors'];same=all(a0[k]==b0[k] for k in fields)
 results.append({'scenario':scenario,'profiles':rows,'shadowGameplayIdentical':same})
 print(' shadow identical?',same,flush=True)
 # Crash-safe incremental output.
 dest.write_text(json.dumps({'format':'fpsarena-director-paired-v1','scenarios':results,'profileNotes':{'release':'untouched live policy','director-shadow-lab':'observational only','director-active-lab':'headless TDM-only unconstrained research','director-safe-lab':'headless evidence-gated conservative research'}},ensure_ascii=False,indent=2))
print('SAVED',dest,flush=True)
