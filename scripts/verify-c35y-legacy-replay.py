#!/usr/bin/env python3
"""Replay a C35-X randomized match with C35-Y opt-in disabled, compare old traces."""
import json,subprocess,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1]
d=json.loads((R/'reports/c35x/expansion-54-v2/FROZEN-DESIGN.json').read_text())
c=next(c for c in d['cases'] if c['arm']=='randomized' and c['gun']=='m4a1')
pre=R/'reports/c35y/legacy-replay'/c['id'];pre.parent.mkdir(parents=True,exist_ok=True)
old=R/'reports/c35x/expansion-54-v2/matches'/c['id'];reg=hashlib.sha256((R/'reports/c35x/expansion-54-v2/FROZEN-DESIGN.json').read_bytes()).hexdigest()
out={k:Path(str(pre)+'.'+k+'.json') for k in ['result','dataset','fire','macro','random']}
args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
 '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
 '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
 '--out',str(out['result']),'--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80',
 '--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,'--c35c-dataset',str(out['dataset']),
 '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--c35g-trace',str(out['fire']),
 '--c35h-policy','observe','--c35h-trace',str(out['macro']),
 '--c35w-policy','randomized','--c35w-setup-id',c['setupId'],'--c35w-trace',str(out['random'])]
res=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=180)
if res.returncode:raise RuntimeError(res.stderr[-2000:])
jsonload=lambda p:json.loads(p.read_text())
comp={}
for k,p in out.items():
 prev=Path(str(old)+'.'+k+'.json')
 if k in ('dataset','fire','macro'):
  comp[k+'ByteIdentical']=(p.read_bytes()==prev.read_bytes())
 elif k=='random':
  now=jsonload(p);before=jsonload(prev)
  for trace in now['traces']:trace.pop('exploration',None)
  comp['legacyRandomEquivalentExceptExplicitExplorerMetadata']=(now==before)
 else:
  a=jsonload(p);b=jsonload(prev);a.pop('created',None);b.pop('created',None)
  comp['gameResultEquivalentExceptTimestamp']=(a==b)
assert all(comp.values()),comp
z={'match':c['id'],'status':'PASS','comparison':comp,'productionUnchanged':True}
(R/'reports/c35y/LEGACY-REPLAY-VALIDATION.json').write_text(json.dumps(z,indent=2)+'\n')
print(json.dumps(z,indent=2))
