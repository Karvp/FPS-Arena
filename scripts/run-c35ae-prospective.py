#!/usr/bin/env python3
"""Frozen NEW-SEED prospective ADS randomized + matched passive TDM.
Runs actual Game.step, does not load/use neural model in-game.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ae/prospective-24'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/ads-prefire-c35ad.mjs','lab/arena/aim-movement-audit-c35aa.mjs','lab/arena/source-main/server/combat.js','lab/arena/source-main/shared/weapons.js','scripts/run-c35ae-prospective.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,v):p.parent.mkdir(exist_ok=True,parents=True);p.write_text(json.dumps(v,indent=2,sort_keys=True)+'\n')
def design():
 guns=['aa12','hk_sl8','l115a3','m4a1','mp5sd','uzi'];cases=[]
 for i in range(12):
  gun=guns[i//2];setup=f'c35ae-new-{i:02d}'
  for arm in ('observe','randomized'):
   cases.append(dict(id=f'{setup}-{arm}',setupId=setup,arm=arm,gun=gun,seed=87933411+i*1291,map=['neon','foundry','arena'][(i+i//2)%3],lagMs=[90,170,230][i%3],opponents=['mixed','official','stress'][i%3],bots=5,seconds=90))
 return dict(schema='fpsarena-c35ae-prospective-frozen-v1',cases=cases,
  sourceSHA256={k:sha(R/k) for k in LOCK},frozenNeuralModelSHA256=sha(R/'reports/c35ae/offline-ads-value/FROZEN-ADS-VALUE-MODELS.json'),
  trainingRegistrationSHA256=sha(R/'reports/c35ae/offline-ads-value/FROZEN-DESIGN.json'),
  rule='Prospective testing of already frozen models only; never use model in gameplay. Baseline observe gives matched TDM reference. Do not refit on prospective holdout.')
def execute(c,reg):
 base=O/'matches'/c['id'];base.parent.mkdir(exist_ok=True,parents=True)
 extensions=['result','aim','dataset','fire','macro','prefire']
 ps={k:Path(str(base)+'.'+k+'.json') for k in extensions}
 if any(p.exists() for p in ps.values()):
  if not all(p.exists() for p in ps.values()):raise RuntimeError('partial cached run '+c['id'])
  return {'id':c['id'],'reused':True,'sha256':{k:sha(p) for k,p in ps.items()}}
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
 '--c35aa-setup-id',c['setupId'],'--c35aa-trace',str(ps['aim']),'--out',str(ps['result']),
 '--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,'--c35c-dataset',str(ps['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
 '--c35g-trace',str(ps['fire']),'--c35h-trace',str(ps['macro']),'--c35h-policy','observe','--c35ad-policy',c['arm'],'--c35ad-trace',str(ps['prefire'])]
 proc=subprocess.run(args,cwd=R,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=420)
 Path(str(base)+'.log').write_text(proc.stdout+'\n'+proc.stderr)
 if proc.returncode or not all(p.exists() for p in ps.values()):
  for p in ps.values():p.unlink(missing_ok=True)
  raise RuntimeError(c['id']+':'+proc.stderr[-1500:])
 return {'id':c['id'],'reused':False,'sha256':{k:sha(p) for k,p in ps.items()}}
def main():
 O.mkdir(parents=True,exist_ok=True);d=design();p=O/'FROZEN-DESIGN.json'
 if p.exists():assert json.loads(p.read_text())==d,'C35AE preregistration drift'
 else:dump(p,d)
 reg=sha(p);print('FROZEN',reg,flush=True);done=[];start=time.monotonic()
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35AE_WORKERS','5'))) as pool:
  futures=[pool.submit(execute,c,reg) for c in d['cases']]
  for f in as_completed(futures):
   x=f.result();done.append(x);print(len(done),'/',len(futures),x['id'],flush=True)
 dump(O/'EXECUTION-AUDIT.json',{'registrationSHA256':reg,'secondsWall':round(time.monotonic()-start,2),'cases':sorted(done,key=lambda v:v['id'])})
if __name__=='__main__':main()
