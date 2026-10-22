#!/usr/bin/env python3
"""Preregistered 18 independent games verifying frozen public aim candidate vs nearest-target ID.
Never changes actual game controls. Authoritative shot truth stays after-step only.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import sys,subprocess,json,time,hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35m/new-seed-18'
sys.path.insert(0,str(ROOT/'scripts'))
from c35m_target_alignment import analyze,read,write,sha
HASHED=['lab/arena/train-main.mjs','lab/arena/ballistic-truth-c35l.mjs',
 'lab/arena/source-main/server/combat.js','lab/arena/source-main/server/game.js',
 'lab/arena/public-target-los-c35k.mjs','lab/arena/firing-corridor-calibration-c35j.mjs',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'page-agent.js','reports/c35d2/FROZEN-FORECAST.json',
 'scripts/c35m_target_alignment.py']

def design():
 cases=[]
 for mi,mp in enumerate(['arena','neon','foundry']):
  for wi,gun in enumerate(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']):
   i=mi*6+wi
   cases.append({'id':f'c35m-{i:02d}-observe','setupId':f'c35m-{i:02d}',
    'seed':50973001+i*541,'map':mp,'gun':gun,'seconds':60,'lagMs':[35,65,125][(i+wi+1)%3],
    'opponents':['official','mixed','stress'][(i+mi+1)%3],'bots':5,'policy':'observe'})
 return {'schema':'fpsarena-c35m-independent-public-aim-validation-v1','date':'2026-10-13',
  'scope':'ANALYSIS ONLY, 18 fresh seeds not included in C35L discovery pilot',
  'hypothesis':'public aim-angle candidate agrees with hit-pellet target more often than nearest public hostile',
  'primaryUnit':'server shot with >=1 player-hit pellet, within-shot mean target-ID agreement',
  'primaryEstimate':'difference in shot-macro hit target alignment (aim-minus-nearest)',
  'statisticalUnit':'independent match, 3k match-cluster bootstrap',
  'exclusions':'shots without player hits are unscored for target identity',
  'cases':cases,'sourceSHA256':{s:sha(ROOT/s) for s in HASHED},
  'motorPolicy':'shadow80 with unchanged C21/C16 and observe; not productized'}

def execute(c,reg):
 p=OUT/'matches'/c['id'];p.parent.mkdir(parents=True,exist_ok=True)
 kind=['result','dataset','fire','macro','lane','calibration','identity','ballistic']
 fs={k:Path(str(p)+f'.{k}.json') for k in kind}
 if any(x.exists() for x in fs.values()):
  if not all(x.exists() for x in fs.values()):raise RuntimeError('Partial case '+c['id'])
  return (c['id'],{k:sha(v) for k,v in fs.items()},True)
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
  '--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],
  '--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
  '--c35c-registration-sha',reg,'--c35c-dataset',str(fs['dataset']),
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(fs['fire']),'--c35h-trace',str(fs['macro']),'--c35h-policy','observe',
  '--c35i-trace',str(fs['lane']),'--c35j-trace',str(fs['calibration']),
  '--c35k-trace',str(fs['identity']),'--c35l-trace',str(fs['ballistic']),'--out',str(fs['result'])]
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=300)
 Path(str(p)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode:raise RuntimeError(f'{c["id"]} exit={r.returncode}: {r.stderr[-1300:]}')
 return (c['id'],{k:sha(v) for k,v in fs.items()},False)

if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 f=OUT/'FROZEN-DESIGN.json';plan=design()
 if f.exists():
  if read(f)!=plan:raise SystemExit('FROZEN DESIGN OR SOURCES DIFFER; refusing replay')
 else:write(f,plan)
 reg=sha(f)
 print('LOCK',reg,flush=True)
 t0=time.monotonic();done=[]
 with ThreadPoolExecutor(max_workers=4) as pool:
  futures={pool.submit(execute,c,reg):c for c in plan['cases']}
  for result in as_completed(futures):
   match,hashes,reused=result.result()
   done.append({'match':match,'SHA256':hashes,'reused':reused})
   print(len(done),'/18',match,flush=True)
 write(OUT/'EXECUTION-AUDIT.json',{'lockedRegistrationSHA256':reg,
     'elapsedWallSeconds':round(time.monotonic()-t0,3),'matches':sorted(done,key=lambda x:x['match'])})
 result=analyze(OUT)
 print('HOLDOUT',json.dumps({'overall':result['overall'],'CI95':result['shotLevelImprovementCI95']},indent=2),flush=True)
