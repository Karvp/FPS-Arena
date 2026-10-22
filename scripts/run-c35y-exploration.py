#!/usr/bin/env python3
"""C35-Y frozen new-setup three-arm experimental expansion. No historical data overwritten.
Intent-to-treat randomized one-motor-tick assignments 60/20/20 ONLY for opt-in research.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
R=Path(__file__).resolve().parents[1]; O=R/'reports/c35y/expansion-72'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/causal-action-teacher-c35w.mjs',
 'lab/arena/movement-value-observer-c35v.mjs','lab/arena/encounter-randomization-c21.mjs',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/source-main/server/game.js',
 'reports/c35d2/FROZEN-FORECAST.json','scripts/run-c35y-exploration.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def design():
 guns=['aa12','mp5sd','m4a1','hk_sl8','uzi','l115a3'];cases=[]
 for i in range(24):
  setup=f'c35y-{i:02d}';w=guns[i//4]
  for arm in ('release','observe','explore'):
   cases.append(dict(id=f'{setup}-{arm}',setupId=setup,arm=arm,
    seed=2028101400+i*211,map=['arena','neon','foundry'][(i+i//4)%3],
    gun=w,lagMs=[70,145,220][(i+2*i//4)%3],
    opponents=['official','mixed','stress'][(i+i//4)%3],bots=5,seconds=90))
 return dict(schema='fpsarena-c35y-preregistered-safe-exploration-v1',
  goal='increase safe alternative exposure, stratify per weapon, test if action conditioning wins setup-separated holdout',
  safety='same public C35V motor menu, one-tick guard, no C21/C16 precedence override; research-only',
  sourceSHA256={p:sha(R/p) for p in LOCK},
  samplingUnit='setup',probabilities=dict(control=.6,alternative_a=.2,alternative_b=.2),
  cases=cases)
def run(c,reg):
 pref=O/'matches'/c['id'];pref.parent.mkdir(parents=True,exist_ok=True)
 out={'result':Path(str(pref)+'.result.json')}
 if c['arm']!='release':out.update({k:Path(str(pref)+f'.{k}.json') for k in ('dataset','fire','macro','random')})
 if any(p.exists() for p in out.values()):
  if not all(p.exists() for p in out.values()):raise RuntimeError('partial saved '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(p) for k,p in out.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
  '--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--trainee-primary',c['gun'],'--out',str(out['result'])]
 if c['arm']!='release':
  args+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80',
   '--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
   '--c35c-dataset',str(out['dataset']),
   '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(out['fire']),'--c35h-policy','observe','--c35h-trace',str(out['macro']),
   '--c35w-policy','randomized' if c['arm']=='explore' else 'observe',
   '--c35w-setup-id',c['setupId'],'--c35w-trace',str(out['random'])]
  if c['arm']=='explore':args.append('--c35y-explore')
 r=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=420)
 Path(str(pref)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode or not all(p.exists() for p in out.values()):
  for p in out.values():p.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]} exit {r.returncode} {r.stderr[-1200:]}')
 return dict(id=c['id'],reused=False,sha256={k:sha(p) for k,p in out.items()})
def main():
 O.mkdir(parents=True,exist_ok=True);f=O/'FROZEN-DESIGN.json';d=design()
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('frozen registration/source differs')
 else:dump(f,d)
 reg=sha(f);records=[];start=time.monotonic();print('C35Y FROZEN SHA',reg,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.getenv('C35Y_WORKERS','7'))) as pool:
  for fu in as_completed([pool.submit(run,c,reg) for c in d['cases']]):
   row=fu.result();records.append(row);print(f'{len(records)}/{len(d["cases"])} {row["id"]}',flush=True)
 dump(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,wallSeconds=round(time.monotonic()-start,2),cases=sorted(records,key=lambda r:r['id'])))
if __name__=='__main__':main()
