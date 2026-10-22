#!/usr/bin/env python3
"""C35-Z frozen 12-setup × three-arm precision exploration experiment.
Research only; public pre-step features / server post-step outcomes separated.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib,json,os,subprocess,time
R=Path(__file__).resolve().parents[1];O=R/'reports/c35z/precision-36'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/causal-action-teacher-c35w.mjs',
 'lab/arena/precision-exploration-c35z.mjs','lab/arena/movement-value-observer-c35v.mjs',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/source-main/server/game.js','reports/c35d2/FROZEN-FORECAST.json','scripts/run-c35z-precision.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,indent=2,sort_keys=True)+'\n')
def design():
 cases=[]
 for i in range(12):
  gun=['hk_sl8','l115a3'][i//6];setup=f'c35z-{i:02d}'
  for arm in ('release','observe','precision'):
   cases.append(dict(id=setup+'-'+arm,setupId=setup,arm=arm,seed=35300021+i*227,
    map=['arena','neon','foundry'][i%3],gun=gun,lagMs=[70,150,215][(i+i//6)%3],
    opponents=['official','mixed','stress'][i%3],bots=5,seconds=75))
 return dict(schema='fpsarena-c35z-precision-preregistered-v1',sourceSHA256={p:sha(R/p) for p in LOCK},
  probabilities={'control':.6,'alternative-a':.2,'alternative-b':.2},
  goal='evaluate precision weapons previously excluded by C35U band; preserve one-tick randomization and guard',
  samplingUnit='setup; 12 independent paired configurations',cases=cases)
def run(c,reg):
 base=O/'matches'/c['id'];base.parent.mkdir(parents=True,exist_ok=True)
 files={'result':Path(str(base)+'.result.json')}
 if c['arm']!='release':files.update({name:Path(str(base)+'.'+name+'.json') for name in ['dataset','fire','macro','random']})
 if any(p.exists() for p in files.values()):
  if not all(p.exists() for p in files.values()):raise RuntimeError('partial previous '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(p) for k,p in files.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
  '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--out',str(files['result'])]
 if c['arm']!='release':
  args+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
   '--c35c-registration-sha',reg,'--c35c-dataset',str(files['dataset']),
   '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(files['fire']),'--c35h-policy','observe','--c35h-trace',str(files['macro']),
   '--c35w-policy','randomized' if c['arm']=='precision' else 'observe',
   '--c35w-setup-id',c['setupId'],'--c35w-trace',str(files['random'])]
  if c['arm']=='precision':args+=['--c35z-precision-explore']
 r=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=360)
 Path(str(base)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode or not all(p.exists() for p in files.values()):
  for p in files.values():p.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]} status {r.returncode}: {r.stderr[-900:]}')
 return dict(id=c['id'],reused=False,sha256={k:sha(p) for k,p in files.items()})
def main():
 O.mkdir(parents=True,exist_ok=True);d=design();f=O/'FROZEN-DESIGN.json'
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('frozen source/design drift')
 else:save(f,d)
 reg=sha(f);start=time.monotonic();rows=[];print('C35Z FROZEN',reg,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35Z_WORKERS','6'))) as pool:
  futs=[pool.submit(run,c,reg) for c in d['cases']]
  for fu in as_completed(futs):
   row=fu.result();rows.append(row)
   print(f'{len(rows)}/{len(futs)} {row["id"]}',flush=True)
 save(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,wallSeconds=round(time.monotonic()-start,2),cases=sorted(rows,key=lambda x:x['id'])))
if __name__=='__main__':main()
