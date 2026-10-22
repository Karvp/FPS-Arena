#!/usr/bin/env python3
"""C35-AD frozen, matched 24 x 3 TDM preregistration and Game.step evaluation."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,subprocess,os,time
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/c35ad/matched-72'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/ads-prefire-c35ad.mjs','lab/arena/aim-movement-audit-c35aa.mjs','lab/arena/source-main/shared/weapons.js','lab/arena/source-main/server/combat.js','scripts/run-c35ad-prefire.py','tests/ads-prefire-c35ad.test.mjs']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,data):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,indent=2,sort_keys=True)+'\n')
def design():
 guns=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'];rows=[]
 for i in range(24):
  gun=guns[i//4];setup=f'c35ad-{i:02d}'
  for arm in ('release','observe','randomized'):
   rows.append(dict(id=f'{setup}-{arm}',setupId=setup,arm=arm,seed=68062141+i*677,map=['arena','neon','foundry'][(i+i//4)%3],gun=gun,lagMs=[70,155,220][i%3],opponents=['mixed','stress','official'][(i//2)%3],bots=5,seconds=90))
 return dict(schema='fpsarena-c35ad-frozen-design-v1',purpose='0.28s safe prefire ADS toggle vs control (50/50), 0.7s factual following window, no edits on firing ticks',policyPromotion=False,arms=['release','observe','randomized'],cases=rows,sourceSHA256={p:sha(ROOT/p) for p in LOCK},samplingUnit='setup cluster',limits='No counterfactual outcome labels, repeated offered windows clustered, no causal carryover elimination; three-arm release is context only')
def execute(c,reg):
 base=OUT/'matches'/c['id'];base.parent.mkdir(parents=True,exist_ok=True)
 keys=['result','aim']+([] if c['arm']=='release' else ['dataset','fire','macro','prefire'])
 paths={k:Path(str(base)+'.'+k+'.json') for k in keys}
 if any(x.exists() for x in paths.values()):
  if not all(x.exists() for x in paths.values()):raise RuntimeError('partial match '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(p) for k,p in paths.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--c35aa-setup-id',c['setupId'],'--c35aa-trace',str(paths['aim']),'--out',str(paths['result'])]
 if c['arm']!='release':
  args+=['--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,'--c35c-dataset',str(paths['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--c35g-trace',str(paths['fire']),'--c35h-trace',str(paths['macro']),'--c35h-policy','observe','--c35ad-policy',c['arm'],'--c35ad-trace',str(paths['prefire'])]
 proc=subprocess.run(args,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=420)
 Path(str(base)+'.log').write_text(proc.stdout+'\n'+proc.stderr)
 if proc.returncode or not all(x.exists() for x in paths.values()):
  for x in paths.values():x.unlink(missing_ok=True)
  raise RuntimeError(c['id']+': '+proc.stderr[-1200:])
 return dict(id=c['id'],reused=False,sha256={k:sha(p) for k,p in paths.items()})
def main():
 OUT.mkdir(parents=True,exist_ok=True);d=design();file=OUT/'FROZEN-DESIGN.json'
 if file.exists():
  if json.loads(file.read_text())!=d:raise RuntimeError('C35AD registration drift')
 else:dump(file,d)
 reg=sha(file);print('REGISTRATION SHA256',reg,flush=True);start=time.monotonic();done=[]
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35AD_WORKERS','5'))) as pool:
  futures=[pool.submit(execute,c,reg) for c in d['cases']]
  for f in as_completed(futures):
   r=f.result();done.append(r);print(f'{len(done)}/{len(futures)} {r["id"]}',flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,secondsWall=round(time.monotonic()-start,2),cases=sorted(done,key=lambda v:v['id'])))
if __name__=='__main__':main()
