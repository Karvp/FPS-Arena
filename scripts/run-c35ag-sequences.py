#!/usr/bin/env python3
"""Frozen 24 x 3 arm actual Game.step() TDM, randomized 3s window evidence."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import subprocess,os,json,time,hashlib,sys
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ag/frozen-72'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/ads-prefire-c35ad.mjs','lab/arena/aim-movement-audit-c35aa.mjs','lab/arena/engagement-sequence-c35ag.mjs','lab/arena/source-main/server/combat.js','lab/arena/source-main/shared/weapons.js','scripts/run-c35ag-sequences.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2,sort_keys=True)+'\n')
def design():
 guns=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'];cases=[]
 for i in range(24):
  gun=guns[i//4];setup=f'c35ag-{i:02d}';d=dict(setupId=setup,gun=gun,seed=88030001+2017*i,map=['neon','arena','foundry'][(i//4+i)%3],lagMs=[65,150,245][i%3],opponents=['mixed','official','stress'][i%3],bots=5,seconds=90)
  for arm in ['release','observe','randomized']:cases.append(dict(d,arm=arm,id=setup+'-'+arm))
 return dict(schema='fpsarena-c35ag-frozen-sequences-72-v1',cases=cases,sourceSHA256={k:sha(R/k) for k in LOCK},
  preregistration='Frozen before matches. 24 setup clusters, 6 guns x4, fixed 6s factual windows. ADS controller C35AD only randomized arm, 7.5s cooldown (no overlapping 6s measured offers). Observe keeps C35C shadow80. Release unmodified baseline. No action-specific ground truth for unselected arm.',
  outcomeUnits=['6s netDamage','6s damageDealt','6s damageTaken','6s ownKills','6s deaths','6s survived'],
  causalCaveats='Within match decision dependence, potential carryover and generalization limits; per-setup uncertainty only.')
def execute(c,reg):
 base=O/'matches'/c['id'];base.parent.mkdir(exist_ok=True,parents=True)
 kinds=['result'] if c['arm']=='release' else ['result','aim','dataset','fire','macro','prefire']+(['sequence'] if c['arm']=='randomized' else [])
 files={k:Path(str(base)+'.'+k+'.json') for k in kinds}
 if any(x.exists() for x in files.values()):
  if not all(x.exists() for x in files.values()):raise RuntimeError('partial prior run '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(p) for k,p in files.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--out',str(files['result'])]
 if c['arm']!='release':
  args+=['--c35aa-setup-id',c['setupId'],'--c35aa-trace',str(files['aim']),
   '--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
   '--c35c-registration-sha',reg,'--c35c-dataset',str(files['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(files['fire']),'--c35h-trace',str(files['macro']),'--c35h-policy','observe',
   '--c35ad-policy',c['arm'],'--c35ad-trace',str(files['prefire'])]
  if c['arm']=='randomized':args+=['--c35ag-trace',str(files['sequence'])]
 p=subprocess.run(args,cwd=R,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=480)
 Path(str(base)+'.log').write_text(p.stdout+'\n'+p.stderr)
 if p.returncode or not all(x.exists() for x in files.values()):
  for x in files.values():x.unlink(missing_ok=True)
  raise RuntimeError(c['id']+': '+p.stderr[-1600:])
 return dict(id=c['id'],reused=False,sha256={k:sha(p) for k,p in files.items()})
def main():
 O.mkdir(exist_ok=True,parents=True);d=design();p=O/'FROZEN-DESIGN.json'
 if p.exists():assert json.loads(p.read_text())==d,'frozen preregistration drift'
 else:dump(p,d)
 reg=sha(p);print('FROZEN DESIGN',reg,flush=True)
 done=[];start=time.monotonic()
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35AG_WORKERS','5'))) as ex:
  ff=[ex.submit(execute,c,reg) for c in d['cases']]
  for f in as_completed(ff):
   a=f.result();done.append(a);print(f'{len(done)}/{len(ff)}',a['id'],flush=True)
 dump(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,elapsedWallSeconds=round(time.monotonic()-start,2),cases=sorted(done,key=lambda x:x['id'])))
if __name__=='__main__':main()
