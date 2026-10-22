#!/usr/bin/env python3
"""C35-AB preregistered release/observe/randomized TDM cohort; real Game.step()."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,subprocess,os,time
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ab/matched-72'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/aim-movement-audit-c35aa.mjs','lab/arena/aim-movement-randomization-c35ab.mjs','lab/arena/source-main/shared/weapons.js','lab/arena/source-main/server/combat.js','scripts/run-c35ab-controlled-aim.py','tests/aim-movement-randomization-c35ab.test.mjs']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,sort_keys=True,indent=2)+'\n')
def design():
 guns=['m4a1','mp5sd','aa12','hk_sl8','l115a3','uzi'];cases=[]
 for i in range(24):
  gun=guns[i//4];setup=f'c35ab-{i:02d}'
  for arm in ['release','observe','randomized']:
   cases.append(dict(id=f'{setup}-{arm}',setupId=setup,arm=arm,seed=35814013+i*391,map=['arena','neon','foundry'][(i+i//4)%3],gun=gun,
     lagMs=[70,155,220][(i+i//2)%3],opponents=['official','mixed','stress'][(i//3)%3],bots=5,seconds=90))
 return dict(schema='fpsarena-c35ab-frozen-design-v1',purpose='randomized one-tick ADS-on vs motor-hold at safe public fire intent; 50/50 within axis; no Q control',
  arms=['release','observe','randomized'],sourceSHA256={p:sha(R/p) for p in LOCK},samplingUnit='paired setup',cases=cases,policyPromotion=False,
  caveat='not a causal estimate for general ADS or speed; study eligibility and ITT only; shotgun pellet dependencies')
def run(c,reg):
 b=O/'matches'/c['id'];b.parent.mkdir(parents=True,exist_ok=True)
 names=['result','aim']+([] if c['arm']=='release' else ['dataset','fire','macro','random']);paths={n:Path(str(b)+'.'+n+'.json') for n in names}
 if any(p.exists() for p in paths.values()):
  if not all(p.exists() for p in paths.values()):raise RuntimeError('partial pre-existing result '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(v) for k,v in paths.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds',str(c['seconds']),
  '--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--trainee-primary',c['gun'],'--c35aa-setup-id',c['setupId'],'--c35aa-trace',str(paths['aim']),'--out',str(paths['result'])]
 if c['arm']!='release':
  args+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
   '--c35c-dataset',str(paths['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(paths['fire']),'--c35h-policy','observe','--c35h-trace',str(paths['macro']),
   '--c35ab-policy',c['arm'],'--c35ab-trace',str(paths['random'])]
 proc=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=420)
 Path(str(b)+'.log').write_text(proc.stdout+'\n'+proc.stderr)
 if proc.returncode or not all(p.exists() for p in paths.values()):
  for p in paths.values():p.unlink(missing_ok=True)
  raise RuntimeError(c['id']+' '+proc.stderr[-1000:])
 return dict(id=c['id'],reused=False,sha256={k:sha(v) for k,v in paths.items()})
def main():
 O.mkdir(parents=True,exist_ok=True);d=design();f=O/'FROZEN-DESIGN.json'
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('C35AB registration drift!')
 else:write(f,d)
 reg=sha(f);print('PREREGISTRATION SHA256',reg,flush=True);out=[];start=time.monotonic()
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35AB_WORKERS','5'))) as pool:
  futs=[pool.submit(run,c,reg) for c in d['cases']]
  for fut in as_completed(futs):
   x=fut.result();out.append(x);print(f'{len(out)}/{len(futs)} {x["id"]}',flush=True)
 write(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,secondsWall=round(time.monotonic()-start,2),cases=sorted(out,key=lambda x:x['id'])))
if __name__=='__main__':main()
