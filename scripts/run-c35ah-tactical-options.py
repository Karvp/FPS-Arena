#!/usr/bin/env python3
"""Preregistered 18 matched setups x three arms, authoritative Game.step TDM.
Never silently overwrite a frozen registration or a partial/mismatched run.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,os,subprocess,time
R=Path(__file__).resolve().parents[1]
O=R/'reports/c35ah/frozen-54'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/tactical-option-randomizer-c35ah.mjs',
 'lab/arena/movement-value-observer-c35v.mjs','lab/arena/precision-exploration-c35z.mjs',
 'lab/arena/source-main/server/combat.js','lab/arena/source-main/shared/weapons.js','scripts/run-c35ah-tactical-options.py']
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def dump(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def design():
 guns=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi']
 cases=[]
 for i in range(18):
  gun=guns[i//3]
  case=dict(setupId=f'c35ah-{i:02d}',gun=gun,seed=99251011+i*1973,
   map=['neon','arena','foundry'][i%3],lagMs=[65,150,245][i%3],
   opponents=['mixed','official','stress'][i%3],bots=5,seconds=90)
  for arm in ['release','observe','randomized']:cases.append(dict(case,arm=arm,id=case['setupId']+'-'+arm))
 return dict(schema='fpsarena-c35ah-pre-registered-tactical-options-54-v1',cases=cases,
  sourceSHA256={k:sha(R/k) for k in LOCK},
  randomization={'arms':['incumbent','option-a','option-b'],'probabilities':[.5,.25,.25],
                 'doseSeconds':1.25,'horizonSeconds':6,'cooldownSeconds':7.5,
                 'intentToTreat':True,'outcome':'factual server counters only'},
  caveat='Randomized entire guarded bounded option, not unobserved alternative trajectory. Within-match carryover possible. C21 retains upstream safety. No counterfactual labels. Setup-cluster resampling.')
def execute(c,registration):
 base=O/'matches'/c['id'];base.parent.mkdir(exist_ok=True,parents=True)
 kinds=['result'] if c['arm']=='release' else ['result','aim','dataset','fire','macro','option']
 paths={k:Path(str(base)+'.'+k+'.json') for k in kinds}
 if any(p.exists() for p in paths.values()):
  if not all(p.exists() for p in paths.values()):raise RuntimeError('partial run, investigate manually '+c['id'])
  return dict(id=c['id'],reused=True,sha256={k:sha(p) for k,p in paths.items()})
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds',str(c['seconds']),
   '--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
   '--trainee-primary',c['gun'],'--out',str(paths['result'])]
 if c['arm']!='release':
  args+=['--c35aa-setup-id',c['setupId'],'--c35aa-trace',str(paths['aim']),
   '--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
   '--c35c-registration-sha',registration,'--c35c-dataset',str(paths['dataset']),
   '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--c35g-trace',str(paths['fire']),
   '--c35h-trace',str(paths['macro']),'--c35h-policy','observe',
   '--c35ah-policy',c['arm'],'--c35ah-trace',str(paths['option'])]
 try:p=subprocess.run(args,cwd=R,capture_output=True,text=True,timeout=480)
 except Exception:raise
 Path(str(base)+'.log').write_text(p.stdout+'\n'+p.stderr)
 if p.returncode or not all(path.exists() for path in paths.values()):
  for f in paths.values():f.unlink(missing_ok=True)
  raise RuntimeError(f"{c['id']} code={p.returncode}: {p.stderr[-1800:]}")
 return dict(id=c['id'],reused=False,sha256={k:sha(p) for k,p in paths.items()})
def main():
 O.mkdir(parents=True,exist_ok=True)
 d=design();p=O/'FROZEN-DESIGN.json'
 if p.exists():assert json.loads(p.read_text())==d,'frozen registration changed'
 else:dump(p,d)
 reg=sha(p);print('FROZEN DESIGN',reg,flush=True)
 start=time.monotonic();done=[]
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35AH_WORKERS','5'))) as pool:
  futures=[pool.submit(execute,c,reg) for c in d['cases']]
  for future in as_completed(futures):
   v=future.result();done.append(v);print(f'{len(done)}/54',v['id'],flush=True)
 dump(O/'EXECUTION-AUDIT.json',dict(registrationSHA256=reg,elapsedWallSeconds=round(time.monotonic()-start,2),cases=sorted(done,key=lambda c:c['id'])))
if __name__=='__main__':main()
