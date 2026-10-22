#!/usr/bin/env python3
"""Registered matched C35-V factual-outcomes sample, same setup/seed two arms.
The two-arm contrast only estimates C35U actual treatment; observer never acts.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
R=Path(__file__).resolve().parents[1];O=R/'reports/c35v/factual-value-24-v1'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/movement-value-observer-c35v.mjs',
      'lab/arena/weapon-aware-positioning-c35u.mjs','lab/arena/public-target-los-c35k.mjs',
      'lab/arena/source-main/server/game.js','lab/arena/source-main/shared/weapons.js',
      'reports/c35d2/FROZEN-FORECAST.json','scripts/run-c35v-pilot.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def design():
 cases=[]
 for i in range(12):
  for arm in ('observe','balance'):
   cases.append(dict(id=f'c35v-{i:02d}-{arm}',setupId=f'c35v-{i:02d}',seed=2026112300+i*173,
    map=['arena','neon','foundry'][i%3],gun=['aa12','mp5sd','m4a1'][i//4],
    lagMs=[65,125,215][(i//3)%3],opponents=['official','mixed','stress'][i%3],
    bots=5,seconds=75,arm=arm))
 return dict(schema='fpsarena-c35v-factual-value-prereg-v1',unit='12 setup pairs; factual windows overlap; bootstrap by setup only',
  primary='public candidate availability, post-step factual hit-window, censoring and no counterfactual label leakage',
  control='two arms C35U observe/balance; identify historical intervention only, NOT counterfactual returns',
  safety='no production change; observer has NO command() interface; after-step labels forbidden at policy time',
  sourceSHA256={p:sha(R/p) for p in LOCK},cases=cases)
def run(c,reg):
 prefix=O/'matches'/c['id'];prefix.parent.mkdir(parents=True,exist_ok=True)
 paths={k:Path(str(prefix)+'.'+k+'.json') for k in ['result','dataset','fire','macro','motion','value']}
 if any(p.exists() for p in paths.values()):
  if not all(p.exists() for p in paths.values()):raise RuntimeError(f'partial {c["id"]}')
  return {"id":c['id'],"reused":True,"sha256":{k:sha(v) for k,v in paths.items()}}
 a=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
  '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
  '--out',str(paths['result']),'--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80',
  '--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,'--c35c-dataset',str(paths['dataset']),
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(paths['fire']),'--c35h-policy','observe','--c35h-trace',str(paths['macro']),
  '--c35u-policy',c['arm'],'--c35u-trace',str(paths['motion']),
  '--c35v-setup-id',c['setupId'],'--c35v-trace',str(paths['value'])]
 p=subprocess.run(a,cwd=R,capture_output=True,text=True,timeout=420)
 Path(str(prefix)+'.log').write_text(p.stdout+'\n'+p.stderr)
 if p.returncode or not all(x.exists() for x in paths.values()):
  for x in paths.values():x.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]}: exit {p.returncode}: {p.stderr[-1200:]}')
 return {"id":c['id'],"reused":False,"sha256":{k:sha(v) for k,v in paths.items()}}
def main():
 O.mkdir(parents=True,exist_ok=True);f=O/'FROZEN-DESIGN.json';d=design()
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('Registered source hash changed')
 else:dump(f,d)
 reg=sha(f);records=[];start=time.time();print('FROZEN',reg,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.getenv('C35V_WORKERS','4'))) as pool:
  for future in as_completed([pool.submit(run,c,reg) for c in d['cases']]):
   x=future.result();records.append(x);print(f'{len(records)}/{len(d["cases"])} {x["id"]}',flush=True)
 dump(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,wallSeconds=round(time.time()-start,2),
   cases=sorted(records,key=lambda x:x['id'])))
if __name__=='__main__':main()
