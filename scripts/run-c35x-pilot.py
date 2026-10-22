#!/usr/bin/env python3
"""C35-X pre-registered independent 18-setup three-arm TDM expansion.
The C35-W production-unchanged randomized safety and deterministic propensity
assignment is reused unchanged; new source/script frozen before any Game.step.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
R=Path(__file__).resolve().parents[1]; O=R/'reports/c35x/expansion-54-v1'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/causal-action-teacher-c35w.mjs',
 'lab/arena/movement-value-observer-c35v.mjs','lab/arena/encounter-randomization-c21.mjs',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/source-main/server/game.js',
 'reports/c35d2/FROZEN-FORECAST.json','scripts/run-c35x-pilot.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def design():
 guns=['aa12','mp5sd','m4a1','hksl8','uzi','l115a3']
 cases=[]
 for i in range(18):
  setup=f'c35x-{i:02d}'
  for arm in ('release','observe','randomized'):
   cases.append(dict(id=f'{setup}-{arm}',setupId=setup,arm=arm,
    seed=2027112300+i*189,map=['arena','neon','foundry'][i%3],
    gun=guns[i//3],lagMs=[65,125,215][(i//3+i%3)%3],
    opponents=['official','mixed','stress'][(i//3+i)%3],bots=5,seconds=90))
 return dict(schema='fpsarena-c35x-pre-registered-expanded-randomization-v1',
  purpose='independent setup-cluster action-conditioned learning and 3-arm TDM; do not alter policy or assign counterfactual truth',
  safety='C35W safe eligible menu, one tick only, 80/10/10 assignments; no changes to production',
  samplingUnit='setup, not pellet or overlapping outcome window',
  sourceSHA256={p:sha(R/p) for p in LOCK},cases=cases)
def run(c,reg):
 pref=O/'matches'/c['id'];pref.parent.mkdir(parents=True,exist_ok=True)
 outputs={'result':Path(str(pref)+'.result.json')}
 if c['arm']!='release':outputs.update({k:Path(str(pref)+f'.{k}.json') for k in ('dataset','fire','macro','random')})
 if any(p.exists() for p in outputs.values()):
  if not all(p.exists() for p in outputs.values()):raise RuntimeError(f'partial {c["id"]}')
  return dict(id=c['id'],reused=True,sha256={k:sha(p) for k,p in outputs.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
  '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
  '--out',str(outputs['result'])]
 if c['arm']!='release':
  args += ['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80',
   '--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
   '--c35c-dataset',str(outputs['dataset']),
   '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(outputs['fire']),'--c35h-policy','observe','--c35h-trace',str(outputs['macro']),
   '--c35w-policy',c['arm'],'--c35w-setup-id',c['setupId'],'--c35w-trace',str(outputs['random'])]
 r=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=420)
 Path(str(pref)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode or not all(p.exists() for p in outputs.values()):
  for p in outputs.values():p.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]} exit {r.returncode} {r.stderr[-1000:]}')
 return dict(id=c['id'],reused=False,sha256={k:sha(p) for k,p in outputs.items()})
def main():
 O.mkdir(parents=True,exist_ok=True);f=O/'FROZEN-DESIGN.json';d=design()
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('frozen source/design differs; refuse restart')
 else:dump(f,d)
 reg=sha(f);records=[];start=time.monotonic();print('FROZEN SHA',reg,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.getenv('C35X_WORKERS','6'))) as pool:
  for fu in as_completed([pool.submit(run,c,reg) for c in d['cases']]):
   row=fu.result();records.append(row);print(f'{len(records)}/{len(d["cases"])} {row["id"]}',flush=True)
 dump(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,wallSeconds=round(time.monotonic()-start,2),cases=sorted(records,key=lambda r:r['id'])))
if __name__=='__main__':main()
