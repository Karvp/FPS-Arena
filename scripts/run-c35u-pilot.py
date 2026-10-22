#!/usr/bin/env python3
"""Pre-registered C35-U matched 3-arm actual Game.step TDM pilot.
Source checksums are immutable after FROZEN-DESIGN has been written.
No historical data or previous registrations overwritten.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/c35u/weapon-balance-36-v1'
SOURCES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/weapon-aware-positioning-c35u.mjs',
 'lab/arena/public-target-los-c35k.mjs','lab/arena/source-main/shared/movement.js',
 'lab/arena/source-main/server/game.js','lab/arena/source-main/shared/weapons.js',
 'reports/c35d2/FROZEN-FORECAST.json','scripts/run-c35u-pilot.py']
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
 return h.hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def design():
 cases=[]
 for i in range(12):
  sid=f'c35u-{i:02d}'
  for arm in ['release','observe','balance']:
   cases.append(dict(id=f'{sid}-{arm}',setupId=sid,seed=2026107900+199*i,
    map=['arena','neon','foundry'][i%3],gun='aa12' if i<4 else 'mp5sd' if i<8 else 'm4a1',
    lagMs=[65,150,240][(i//3)%3],opponents=['official','mixed','stress'][i%3],
    bots=5,seconds=90,arm=arm))
 return dict(schema='fpsarena-c35u-matched-prereg-v1',independentUnit='12 setup clusters (not shots or pellets)',
  hypothesis='weapon-aware distance-band steering improves kills without worsening deaths, shots, or C21 motor safety',
  threeArmContrast='release vs observe measures historical shadow80; observe vs balance isolates C35U',
  restriction='headless-only; public delayed client state; never production; no private server state before step',
  promotionGate='exposure >0 plus paired cluster confidence and no harm across fire, death, motor safety',
  sourceSHA256={p:sha(ROOT/p) for p in SOURCES},cases=cases)
def run(c,regsha):
 prefix=OUT/'matches'/c['id'];prefix.parent.mkdir(parents=True,exist_ok=True)
 names=['result'] if c['arm']=='release' else ['result','dataset','fire','macro','motion']
 paths={k:Path(str(prefix)+'.'+k+'.json') for k in names}
 if any(p.exists() for p in paths.values()):
  if not all(p.exists() for p in paths.values()):raise RuntimeError('partial '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(v) for k,v in paths.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
  '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
  '--out',str(paths['result'])]
 if c['arm']!='release':
  args+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
   '--c35c-registration-sha',regsha,'--c35c-dataset',str(paths['dataset']),
   '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(paths['fire']),'--c35h-policy','observe','--c35h-trace',str(paths['macro']),
   '--c35u-policy',c['arm'],'--c35u-trace',str(paths['motion'])]
 p=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,timeout=360)
 Path(str(prefix)+'.log').write_text(p.stdout+'\n'+p.stderr)
 if p.returncode or not all(v.exists() for v in paths.values()):
  for v in paths.values():v.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]}: exit={p.returncode} {p.stderr[-800:]}')
 return dict(id=c['id'],reused=False,sha256={k:sha(v) for k,v in paths.items()})
def main():
 d=design();OUT.mkdir(parents=True,exist_ok=True);f=OUT/'FROZEN-DESIGN.json'
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('source changed since preregistration')
 else:dump(f,d)
 dh=sha(f);results=[];t=time.time();print('registered',dh,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35U_WORKERS','5'))) as pool:
  for fu in as_completed([pool.submit(run,c,dh) for c in d['cases']]):
   o=fu.result();results.append(o);print(len(results),'/',len(d['cases']),o['id'],flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',dict(registrationSHA256=dh,matches=sorted(results,key=lambda r:r['id']),wallSeconds=round(time.time()-t,2)))
if __name__=='__main__':main()
