#!/usr/bin/env python3
"""Reproducible release / old director / opportunity guard paired simulations."""
import argparse,json,subprocess,pathlib,time
root=pathlib.Path(__file__).resolve().parent.parent
ap=argparse.ArgumentParser();ap.add_argument('--output',default='reports/v2910/validation-runs.json');ap.add_argument('--full',action='store_true');ap.add_argument('--quick',action='store_true');a=ap.parse_args()
output=root/a.output;output.parent.mkdir(parents=True,exist_ok=True)
scenarios=[{'id':'arena-shotgun','map':'arena','weapon':'benelli_m4','seed':999702,'seconds':75},
{'id':'foundry-shotgun','map':'foundry','weapon':'benelli_m4','seed':999701,'seconds':75},
{'id':'arena-smg','map':'arena','weapon':'mp5sd','seed':999703,'seconds':75},
{'id':'foundry-shotgun-holdout','map':'foundry','weapon':'benelli_m4','seed':291011,'seconds':90},
{'id':'arena-shotgun-holdout','map':'arena','weapon':'benelli_m4','seed':291012,'seconds':90}]
if a.quick:scenarios=scenarios[:3]
if a.full:scenarios += [{'id':'foundry-shotgun-natural','map':'foundry','weapon':'benelli_m4','seed':999704,'seconds':390,'full':True},
 {'id':'arena-shotgun-natural-new','map':'arena','weapon':'benelli_m4','seed':291013,'seconds':390,'full':True}]
profiles=['release','director-active-lab','director-opportunity-lab']
rows=[]
for scenario in scenarios:
 print('SCENARIO',scenario['id'],flush=True)
 run={}
 for profile in profiles:
  dest=output.parent/f"{scenario['id']}_{profile}.json"
  args=['node',str(root/'lab/arena/train.mjs'),'--profile',profile,'--modes','tdm','--seconds',str(scenario['seconds']),
   '--seed',str(scenario['seed']),'--classic-maps',scenario['map'],'--bots','5','--opponents','stress',
   '--trainee-primary',scenario['weapon'],'--lag-ms','65','--profile-agent','--out',str(dest)]
  if scenario.get('full'):args.append('--full-match')
  started=time.monotonic();process=subprocess.run(args,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=210)
  if process.returncode:raise RuntimeError(profile+' '+process.stderr[-2000:])
  data=json.loads(dest.read_text())['results'][0]
  keys=['kills','deaths','shots','hits','distance','worldReversals','damageTaken','duration','finishedNaturally','errors','agentTimingMs','directorDiagnosticCounts']
  run[profile]={k:data.get(k) for k in keys}
  print(' ',profile,'K/D',data['kills'],data['deaths'],'shots',data['shots'],'reversals',data['worldReversals'],
        'p99',data.get('agentTimingMs',{}).get('p99'),'sec',round(time.monotonic()-started,1),flush=True)
 fields=['kills','deaths','shots','hits','distance','worldReversals','damageTaken','duration','finishedNaturally','errors']
 equivalent=all(run['release'][key]==run['director-opportunity-lab'][key] for key in fields)
 noRegress=(run['director-opportunity-lab']['kills']>=run['release']['kills'] and
     run['director-opportunity-lab']['shots']>=run['release']['shots'] and
     run['director-opportunity-lab']['deaths']<=run['release']['deaths'] and
     run['director-opportunity-lab']['errors']==0)
 rows.append({'scenario':scenario,'profiles':run,'guardedIdenticalGameplay':equivalent,'guardedNoKDShootRegression':noRegress})
 output.write_text(json.dumps({'version':'2.9.10','scenarios':rows,
    'researchOnly':True,'allScenariosNoRegression':all(row['guardedNoKDShootRegression'] for row in rows),
    'promotionApproved':False},ensure_ascii=False,indent=2))
print('saved',output,flush=True)
