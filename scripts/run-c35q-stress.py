#!/usr/bin/env python3
"""C35-Q preregistered, no-retraining lag/weapon stress for C35-P frozen scorer.
No source changes to Game, production policy, C16 or C21.
"""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import os,json,subprocess,sys,time
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha
OUT=ROOT/'reports/c35q/stress-12-v2'
FILES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/public-target-confidence-c35p.mjs',
 'lab/arena/public-track-freshness-c35o.mjs','lab/arena/source-main/server/combat.js',
 'lab/arena/source-main/server/game.js','reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json',
 'scripts/run-c35q-stress.py','scripts/c35q_robustness.py']
TYPES=('result','dataset','fire','macro','lane','calibration','identity','ballistic','track','confidence')
def registration():
 cases=[]
 for i,mp in enumerate(('arena','neon','foundry')):
  for j,gun in enumerate(('mp5sd','aa12')):
   setup=f'c35qv2-{2*i+j:02d}';seed=175398437+(2*i+j)*29333
   for lag in (85,240):
    cases.append(dict(id=f'{setup}-lag{lag}',setupId=setup,seed=seed,map=mp,gun=gun,
     seconds=60,lagMs=lag,opponents=('mixed','stress','official')[(i+j)%3],bots=5))
 return dict(schema='fpsarena-c35q-cross-lag-new-seeds-prereg-v1',status='FROZEN BEFORE MATCHES',
  purpose='No-retraining public hit/ID prediction and abstention under higher lag and new seeds',
  split='6 independent setup clusters; lag paired per setup; NO MODEL FITTING on this cohort',
  sourceSHA256={p:sha(ROOT/p) for p in FILES},cases=cases,noPolicyPromotion=True)
def execute(c,reg):
 p=OUT/'matches'/c['id'];p.parent.mkdir(parents=True,exist_ok=True)
 fs={k:Path(str(p)+f'.{k}.json') for k in TYPES}
 ex=[f.exists() for f in fs.values()]
 if any(ex):
  if not all(ex):raise RuntimeError('partial match '+c['id'])
  return dict(id=c['id'],reused=True,SHA256={k:sha(f) for k,f in fs.items()})
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
 '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
 '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
 '--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
 '--c35c-registration-sha',reg,'--c35c-dataset',str(fs['dataset']),
 '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
 '--c35g-trace',str(fs['fire']),'--c35h-trace',str(fs['macro']),'--c35h-policy','observe',
 '--c35i-trace',str(fs['lane']),'--c35j-trace',str(fs['calibration']),
 '--c35k-trace',str(fs['identity']),'--c35l-trace',str(fs['ballistic']),
 '--c35o-trace',str(fs['track']),'--c35p-trace',str(fs['confidence']),'--out',str(fs['result'])]
 r=subprocess.run(cmd,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=360)
 Path(str(p)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode or not all(f.exists() for f in fs.values()):
  raise RuntimeError(f'{c["id"]}: exit {r.returncode}: {r.stderr[-1200:]}')
 return dict(id=c['id'],reused=False,SHA256={k:sha(f) for k,f in fs.items()})
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 f=OUT/'FROZEN-DESIGN.json';d=registration()
 if f.exists():
  if load(f)!=d:raise RuntimeError('FROZEN DESIGN/SOURCE HASH CHANGED')
 else:dump(f,d)
 reg=sha(f);start=time.time();done=[]
 print('C35Q preregistration',reg,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35Q_WORKERS','4'))) as pool:
  for fu in as_completed([pool.submit(execute,c,reg) for c in d['cases']]):
   a=fu.result();done.append(a);print(f'{len(done)}/12 {a["id"]}',flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,elapsedWallSeconds=time.time()-start,
   matches=sorted(done,key=lambda x:x['id'])))
if __name__=='__main__':main()
