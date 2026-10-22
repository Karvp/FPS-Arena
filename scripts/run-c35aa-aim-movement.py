#!/usr/bin/env python3
"""C35-AA preregistered three-arm game cohort, authoritative Game.step, no policy promotion."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import json,hashlib,os,subprocess,time
R=Path(__file__).resolve().parents[1];O=R/'reports/c35aa/matched-36'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/aim-movement-audit-c35aa.mjs',
 'lab/arena/source-main/server/combat.js','lab/arena/source-main/shared/weapons.js',
 'lab/arena/causal-action-teacher-c35w.mjs','lab/arena/precision-exploration-c35z.mjs',
 'scripts/run-c35aa-aim-movement.py','tests/aim-movement-audit-c35aa.test.mjs']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,data):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,sort_keys=True,indent=2)+'\n')
def design():
 guns=['m4a1','mp5sd','aa12','hk_sl8','l115a3','uzi'];cases=[]
 for i in range(12):
  gun=guns[i//2];setup=f'c35aa-{i:02d}'
  for arm in ('release','observe','randomized'):
   cases.append(dict(id=f'{setup}-{arm}',setupId=setup,arm=arm,seed=35410043+i*311,
    map=['arena','neon','foundry'][i%3],gun=gun,lagMs=[70,150,215][(i+i//3)%3],
    opponents=['official','mixed','stress'][i%3],bots=5,seconds=75))
 return dict(schema='fpsarena-c35aa-frozen-design-v1',purpose='shot-level public ADS/motion/aim audit; no direct movement-speed spread rule, no causal claim',
  sourceSHA256={p:sha(R/p) for p in LOCK},samplingUnit='paired setup',cases=cases,
  arms=['release','observe','randomized'],noPromotion=True)
def run(c,reg):
 base=O/'matches'/c['id'];base.parent.mkdir(parents=True,exist_ok=True)
 files={name:Path(str(base)+f'.{name}.json') for name in ('result','aim')}
 if c['arm']!='release':files.update({name:Path(str(base)+f'.{name}.json') for name in ('dataset','fire','macro','random')})
 if any(p.exists() for p in files.values()):
  if not all(p.exists() for p in files.values()):raise RuntimeError('partial match '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(v) for k,v in files.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
  '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--trainee-primary',c['gun'],'--c35aa-setup-id',c['setupId'],'--c35aa-trace',str(files['aim']),
  '--out',str(files['result'])]
 if c['arm']!='release':
  args+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
   '--c35c-registration-sha',reg,'--c35c-dataset',str(files['dataset']),
   '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(files['fire']),'--c35h-policy','observe','--c35h-trace',str(files['macro']),
   '--c35w-policy','randomized' if c['arm']=='randomized' else 'observe',
   '--c35w-setup-id',c['setupId'],'--c35w-trace',str(files['random'])]
  if c['arm']=='randomized':args+=['--c35z-precision-explore' if c['gun'] in ('hk_sl8','l115a3') else '--c35y-explore']
 proc=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=420)
 Path(str(base)+'.log').write_text(proc.stdout+'\n'+proc.stderr)
 if proc.returncode or not all(p.exists() for p in files.values()):
  for p in files.values():p.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]} rc={proc.returncode}: {proc.stderr[-800:]}')
 return dict(id=c['id'],reused=False,sha256={k:sha(v) for k,v in files.items()})
def main():
 O.mkdir(parents=True,exist_ok=True);d=design();f=O/'FROZEN-DESIGN.json'
 if f.exists():
  if json.loads(f.read_text())!=d:raise RuntimeError('FROZEN-DESIGN drift; new cohort required')
 else:save(f,d)
 reg=sha(f);print('C35AA prereg SHA256',reg,flush=True);start=time.monotonic();out=[]
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35AA_WORKERS','5'))) as pool:
  fs=[pool.submit(run,c,reg) for c in d['cases']]
  for fut in as_completed(fs):
   x=fut.result();out.append(x);print(f'{len(out):02d}/{len(fs)} {x["id"]}',flush=True)
 save(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,wallSeconds=round(time.monotonic()-start,2),cases=sorted(out,key=lambda x:x['id'])))
if __name__=='__main__':main()
