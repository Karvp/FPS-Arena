#!/usr/bin/env python3
"""C35-AJ frozen real Game.step prospective randomized tactical-option study.
Do not overwrite existing registration or reuse partial matches.
"""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import hashlib,json,subprocess,time,os
R=Path(__file__).resolve().parents[1]
O=R/'reports/c35aj/prospective-108-v1'
LOCK=['page-agent.js','lab/arena/train-main.mjs','lab/arena/tactical-option-randomizer-c35ah.mjs','lab/arena/physical-option-audit-c35ai.mjs','lab/arena/movement-value-observer-c35v.mjs','lab/arena/precision-exploration-c35z.mjs','lab/arena/source-main/server/combat.js','lab/arena/source-main/shared/weapons.js','scripts/run-c35aj-tactical-value.py']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def design():
 guns=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi']
 cases=[]
 for i in range(36):
  g=guns[i//6]; j=i%6
  setup=dict(setupId=f'c35aj-{i:02d}',gun=g,map=['foundry','neon','arena'][j%3],seed=73149518+i*4219,
             lagMs=[65,135,215,245,85,175][j],opponents=['stress','mixed','official','stress','official','mixed'][j],seconds=90,bots=5)
  for arm in ['release','observe','randomized']:cases.append(dict(setup,arm=arm,id=setup['setupId']+'-'+arm))
 return dict(schema='fpsarena-c35aj-prospective-108-v1',cases=cases,sourceSHA256={p:sha(R/p) for p in LOCK},
   intendedSplits={'train':'c35aj-00..c35aj-23 plus C35-AI legacy groups 00..17', 'validation':'C35-AI legacy groups 18..23','holdout':'c35aj-24..c35aj-35; held out before model selection'},
   randomization={'arms':['incumbent','option-a','option-b'],'probability':[.5,.25,.25],'horizonSeconds':6,'doseSeconds':1.25,'cooldownSeconds':7.5},
   safety='C35-AH active research controller guards each tick; C35-AI physical audit is post-step only.',
   estimand='initial assigned whole option ITT; not physical displacement effect; no labels for unselected arms; clustered setup inference',
   outcome='bounded six-second server reward; raw counts and censoring preserved',
   limitations=['End-of-match right censoring excluded from complete-label model fit but always counted','Shared-match assignments correlated','Holdout one frozen evaluation only'])
def execute(c,registration):
 base=O/'matches'/c['id'];base.parent.mkdir(parents=True,exist_ok=True)
 kinds=['result'] if c['arm']=='release' else ['result','aim','dataset','fire','macro','option','physical']
 paths={k:Path(str(base)+'.'+k+'.json') for k in kinds}
 if any(p.exists() for p in paths.values()):
  if not all(p.exists() for p in paths.values()):raise RuntimeError('Partial registration: '+c['id'])
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
    '--c35ah-policy',c['arm'],'--c35ah-trace',str(paths['option']),'--c35ai-trace',str(paths['physical'])]
 p=subprocess.run(args,cwd=R,capture_output=True,text=True,timeout=480)
 Path(str(base)+'.log').write_text(p.stdout+'\n'+p.stderr)
 if p.returncode or not all(path.exists() for path in paths.values()):
  for f in paths.values():f.unlink(missing_ok=True)
  raise RuntimeError(f'{c["id"]}: {p.returncode} {p.stderr[-1800:]}')
 return dict(id=c['id'],reused=False,sha256={k:sha(p) for k,p in paths.items()})
def main():
 O.mkdir(parents=True,exist_ok=True);d=design();p=O/'FROZEN-DESIGN.json'
 if p.exists():assert json.loads(p.read_text())==d,'Frozen design source or case mismatch'
 else:save(p,d)
 h=sha(p);print('FROZEN_SHA',h,flush=True)
 done=[];start=time.monotonic()
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35AJ_WORKERS','6'))) as pool:
  futures=[pool.submit(execute,c,h) for c in d['cases']]
  for f in as_completed(futures):
   a=f.result();done.append(a);print(f'{len(done)}/108 {a["id"]}',flush=True)
 save(O/'EXECUTION-AUDIT.json',dict(schema='fpsarena-c35aj-execution-v1',registrationSHA256=h,
    elapsedWallSeconds=round(time.monotonic()-start,2),cases=sorted(done,key=lambda x:x['id'])))
if __name__=='__main__':main()
