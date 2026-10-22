#!/usr/bin/env python3
"""C35-S SHA-locked, matched TDM release/shadow80/shotgun-approach trial.
Same original page-agent on ALL arms; C35S only changes forward key when guarded.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35s/shotgun-gap-close-36-v2'
SOURCE=['page-agent.js','lab/arena/train-main.mjs','lab/arena/weapon-aware-approach-c35s.mjs',
 'lab/arena/firing-compatible-macro-c35h.mjs','lab/arena/public-target-los-c35k.mjs',
 'lab/arena/source-main/server/game.js','lab/arena/source-main/shared/weapons.js',
 'reports/c35d2/FROZEN-FORECAST.json','scripts/run-c35s-v2.py']
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,sort_keys=True,indent=2)+'\n')
def design():
 cases=[]
 for i in range(12):
  sid=f'c35s-{i:02d}'
  for arm in ('release','observe','approach'):
   cases.append(dict(id=f'{sid}-{arm}',setupId=sid,seed=2026102900+173*i,
     map=['arena','neon','foundry'][i%3],gun='aa12',lagMs=[65,150,240][i%3],
     opponents=['official','mixed','stress'][(i//3)%3],bots=5,seconds=90,arm=arm))
 return dict(schema='fpsarena-c35s-prereg-v2',registration='locked before running new matches',
   interpretation='release vs shadow80 evaluates prior micro; observe vs approach isolates C35S',
   independentUnit='12 map+seed+lag+opponent matched setups, not shots or pellets',
   restriction='shotgun AA-12 ONLY; headless research opt-in, never production',
   safety='no modifications to fire, aim, yaw, ability, reload, slot or already commanded movement',
   sourceSHA256={p:sha(ROOT/p) for p in SOURCE},cases=cases)
def run(c,regsha):
 pref=OUT/'matches'/c['id'];pref.parent.mkdir(parents=True,exist_ok=True)
 names=['result'] if c['arm']=='release' else ['result','dataset','fire','macro','approach']
 paths={k:Path(str(pref)+'.'+k+'.json') for k in names}
 if any(p.exists() for p in paths.values()):
  if not all(p.exists() for p in paths.values()):raise RuntimeError('partial match '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(p) for k,p in paths.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
   '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
   '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
   '--out',str(paths['result'])]
 if c['arm']!='release':
  args+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80',
   '--c35c-setup-id',c['setupId'],'--c35c-registration-sha',regsha,
   '--c35c-dataset',str(paths['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(paths['fire']),'--c35h-policy','observe','--c35h-trace',str(paths['macro']),
   '--c35s-policy',c['arm'],'--c35s-trace',str(paths['approach'])]
 try:
  p=subprocess.run(args,cwd=ROOT,text=True,capture_output=True,timeout=600)
  Path(str(pref)+'.log').write_text(p.stdout+'\n'+p.stderr)
  if p.returncode or not all(f.exists() for f in paths.values()):raise RuntimeError(f'failed {c["id"]}: {p.returncode}: {p.stderr[-900:]}')
 except Exception:
  for f in paths.values():f.unlink(missing_ok=True)
  raise
 return dict(id=c['id'],reused=False,sha256={k:sha(q) for k,q in paths.items()})
def main():
 d=design();OUT.mkdir(parents=True,exist_ok=True)
 path=OUT/'FROZEN-DESIGN.json'
 if path.exists():
  if json.loads(path.read_text())!=d:raise RuntimeError('source changed after preregistration')
 else:dump(path,d)
 h=sha(path);t=time.time();arr=[]
 print('C35S prereg',h,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35S_WORKERS','4'))) as pool:
  for f in as_completed([pool.submit(run,c,h) for c in d['cases']]):
   row=f.result();arr.append(row)
   print(len(arr),'/',len(d['cases']),row['id'],flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',dict(registrationSHA256=h,matches=sorted(arr,key=lambda x:x['id']),wallSeconds=round(time.time()-t,2)))
if __name__=='__main__':main()
