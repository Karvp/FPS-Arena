#!/usr/bin/env python3
"""Pre-registered C35-W matched study. Freeze source hashes before any Game.step.
12 setups x release/observe/randomized; do not change design or source after freeze.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
R=Path(__file__).resolve().parents[1]
O=R/'reports/c35w/randomized-motor-36-v1'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/causal-action-teacher-c35w.mjs',
 'lab/arena/movement-value-observer-c35v.mjs','lab/arena/encounter-randomization-c21.mjs',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/source-main/server/game.js',
 'reports/c35d2/FROZEN-FORECAST.json','scripts/run-c35w-pilot.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def design():
 cases=[]
 for i in range(12):
  setup=f'c35w-{i:02d}'
  for arm in ['release','observe','randomized']:
   cases.append(dict(id=f'{setup}-{arm}',setupId=setup,arm=arm,
    seed=2026121700+i*173,map=['arena','neon','foundry'][i%3],
    gun=['aa12','mp5sd','m4a1'][i//4],lagMs=[65,125,215][(i//3)%3],
    opponents=['official','mixed','stress'][i%3],bots=5,seconds=90))
 return dict(schema='fpsarena-c35w-preregistered-intent-to-treat-v1',
  design='12 setup-matched TDM triples; one-tick randomized 80/10/10 motor decision nested in shadow80 only',
  analysisUnit='setup, not pellets or overlapping tick windows',
  metrics=['kills','deaths','shots','hits','C35W actual exposure','factual hitWindow by assignment'],
  ethics='no server future/shot label in policy; nonselected potential outcomes UNKNOWN',
  gate='research only, cannot promote on small paired pilot',
  sourceSHA256={x:sha(R/x) for x in LOCK},cases=cases)
def run(c,reg):
 prefix=O/'matches'/c['id'];prefix.parent.mkdir(parents=True,exist_ok=True)
 outputs={'result':Path(str(prefix)+'.result.json')}
 if c['arm']!='release':
  outputs.update({k:Path(str(prefix)+f'.{k}.json') for k in ['dataset','fire','macro','random']})
 if any(p.exists() for p in outputs.values()):
  if not all(p.exists() for p in outputs.values()):raise RuntimeError(f'Partial output {c["id"]}')
  return {'id':c['id'],'reused':True,'sha256':{k:sha(x) for k,x in outputs.items()}}
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
  '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
  '--out',str(outputs['result'])]
 if c['arm']!='release':
  args += ['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80',
   '--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
   '--c35c-dataset',str(outputs['dataset']),
   '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(outputs['fire']),'--c35h-policy','observe',
   '--c35h-trace',str(outputs['macro']),
   '--c35w-policy',c['arm'],'--c35w-setup-id',c['setupId'],
   '--c35w-trace',str(outputs['random'])]
 r=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=420)
 Path(str(prefix)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode or not all(x.exists() for x in outputs.values()):
  for p in outputs.values():p.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]}: exit {r.returncode}: {r.stderr[-1500:]}')
 return {'id':c['id'],'reused':False,'sha256':{k:sha(x) for k,x in outputs.items()}}
def main():
 O.mkdir(parents=True,exist_ok=True);f=O/'FROZEN-DESIGN.json';d=design()
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('Source/design differ from frozen study; refusing invalid restart')
 else:dump(f,d)
 reg=sha(f);records=[];start=time.time();print('FROZEN SHA',reg,flush=True)
 with ThreadPoolExecutor(max_workers=int(os.getenv('C35W_WORKERS','5'))) as pool:
  for fu in as_completed([pool.submit(run,c,reg) for c in d['cases']]):
   x=fu.result();records.append(x)
   print(f'{len(records)}/{len(d["cases"])} {x["id"]}',flush=True)
 dump(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,wallSeconds=round(time.time()-start,2),
  cases=sorted(records,key=lambda x:x['id'])))
if __name__=='__main__':main()
