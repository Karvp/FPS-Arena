#!/usr/bin/env python3
"""C35-R preregistered matched baseline vs passive-shadow pilot.
The baseline is unmodified release; research uses only legacy C21/C16 shadow80 plus
measurement C35J/K/L/O/P/R. NOT a trial of newly promoted combat AI.
"""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import hashlib,json,subprocess,os,time
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35r/paired-24-v1'
SOURCE=['page-agent.js','lab/arena/train-main.mjs','lab/arena/combat-decision-shadow-c35r.mjs',
 'lab/arena/public-target-los-c35k.mjs','lab/arena/ballistic-truth-c35l.mjs',
 'lab/arena/source-main/server/combat.js','lab/arena/source-main/server/game.js',
 'reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json',
 'scripts/run-c35r-combat-pilot.py']
GUNS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
MAPS=['arena','neon','foundry']
TYPES=['result','dataset','fire','macro','lane','calibration','identity','ballistic','track','confidence','decision']
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def dump(p,o):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
def design():
 cases=[]
 for i in range(12):
  a=i%6;g=GUNS[a];mp=MAPS[i%3]
  setup=f'c35r-{i:02d}'
  seed=2026101700+137*i
  for policy in ['release','shadow80']:
   cases.append(dict(id=f'{setup}-{policy}',setupId=setup,seed=seed,map=mp,gun=g,
                     lagMs=[65,150,240][i%3],seconds=90,bots=5,opponents=['official','mixed','stress'][i%3],policy=policy))
 return dict(schema='fpsarena-c35r-prereg-v1',purpose='Shot-loss analysis; unmatched causes not causal',
             limit='Exact seed/map/gun/lag/opponents/duration matched; independent setup is bootstrap unit',
             intervention='shadow80 research vs original release; C35R is passive-only',
             criteria='shot/pellet ledger complete; no fire command modification; source frozen',
             sourceSHA256={p:sha(ROOT/p) for p in SOURCE},cases=cases,productionPromoted=False)
def run(c,prereg):
 p=OUT/'matches'/c['id'];p.parent.mkdir(parents=True,exist_ok=True)
 f={k:Path(str(p)+'.'+k+'.json') for k in TYPES if c['policy']=='shadow80' or k=='result'}
 if any(q.exists() for q in f.values()):
  if not all(q.exists() for q in f.values()):raise RuntimeError('partial result: '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(q) for k,q in f.items()})
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
      '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
      '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
      '--out',str(f['result'])]
 if c['policy']=='shadow80':
  cmd+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
     '--c35c-registration-sha',prereg,'--c35c-dataset',str(f['dataset']),
     '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--c35h-policy','observe']
  for flag,key in [('c35g-trace','fire'),('c35h-trace','macro'),('c35i-trace','lane'),
   ('c35j-trace','calibration'),('c35k-trace','identity'),('c35l-trace','ballistic'),
   ('c35o-trace','track'),('c35p-trace','confidence'),('c35r-trace','decision')]:cmd+=['--'+flag,str(f[key])]
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=720)
 Path(str(p)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode or not all(q.exists() for q in f.values()):
  raise RuntimeError(f'{c["id"]} exit {r.returncode} {r.stderr[-1500:]}')
 return dict(id=c['id'],reused=False,sha256={k:sha(q) for k,q in f.items()})
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 reg=design();path=OUT/'FROZEN-DESIGN.json'
 if path.exists():
  if json.loads(path.read_text())!=reg:raise RuntimeError('source/registration changed after lock')
 else:dump(path,reg)
 prereg=sha(path);t=time.time();results=[]
 print('C35R locked design',prereg,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35R_WORKERS','4'))) as pool:
  for fut in as_completed([pool.submit(run,c,prereg) for c in reg['cases']]):
   a=fut.result();results.append(a);print(f'{len(results)}/{len(reg["cases"])} {a["id"]}',flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',dict(registrationSHA256=prereg,matches=sorted(results,key=lambda z:z['id']),wallSeconds=round(time.time()-t,2)))
if __name__=='__main__':main()
