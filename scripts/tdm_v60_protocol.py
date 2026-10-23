#!/usr/bin/env python3
"""V60 preregistered multi-arm research. Holdout never runs automatically."""
import concurrent.futures
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'v60'
DATA.mkdir(parents=True, exist_ok=True)
REG = ROOT / 'research' / 'tdm-v60-frozen-registry.json'
ARMS = ('keep','close','strafe','withdraw')
FILES = ['lab/arena/tdm-stratified-replay-v60.mjs','lab/arena/train-main.mjs','tests/tdm-v60-stratified-replay.test.mjs','scripts/tdm_v60_protocol.py']
PROTECTED = ['page-agent.js','lab/arena/source-main/server/game.js','lab/arena/source-main/server/bot.js']
CASES = [
 {'id':'train-neon-aa12-0','split':'discovery','map':'neon','weapon':'aa12','stratum':'range-gap','seed':520001},
 {'id':'train-foundry-aa12-1','split':'discovery','map':'foundry','weapon':'aa12','stratum':'range-gap','seed':520002},
 {'id':'train-arena-uzi-2','split':'discovery','map':'arena','weapon':'uzi','stratum':'contact','seed':520003},
 {'id':'train-foundry-uzi-3','split':'discovery','map':'foundry','weapon':'uzi','stratum':'contact','seed':520004},
 {'id':'holdout-neon-m4a1-4','split':'holdout','map':'neon','weapon':'m4a1','stratum':'contact','seed':520005},
 {'id':'holdout-arena-mp5sd-5','split':'holdout','map':'arena','weapon':'mp5sd','stratum':'contact','seed':520006}
]

def digest(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def freeze():
 if REG.exists():raise RuntimeError('REGISTRY_EXISTS: do not overwrite frozen manifest')
 obj={'schema':'fpsarena-v60-frozen-preregistered-v1',
      'baseline':'C35AJ local, not V31 or v57', 'arms':ARMS,'cases':CASES,
      'sourceHash':{p:digest(ROOT/p) for p in FILES},
      'protectedHash':{p:digest(ROOT/p) for p in PROTECTED},
      'calibrationSeeds':[441108,441109],
      'protocol':{'researchOnly':True,'holdoutAutomaticallyBlocked':True,'windowTreatmentTicks':120,'windowOutcomeTicks':300,
       'unit':'seed-group', 'noTrainingBefore':'at least 16 independent triggered groups and 8 reward/hazard-positive',
       'failureHandling':'keep not-triggered and right-censored cases'},
      'limitations':['this is deterministic replay not state cloning','partial public-state proxy from headless runner',
       'server witness only for auditing, not for controller','aggregate WASD checks, not independent tick-by-tick audit']}
 REG.parent.mkdir(parents=True,exist_ok=True)
 REG.write_text(json.dumps(obj,indent=2,sort_keys=True)+'\n',encoding='utf-8')
 return obj

def verify():
 obj=json.loads(REG.read_text(encoding='utf-8'))
 if obj['cases']!=CASES or obj['arms']!=list(ARMS):raise RuntimeError('REGISTRY_MISMATCH')
 for rel,record in {**obj['sourceHash'],**obj['protectedHash']}.items():
  now=digest(ROOT/rel)
  if now!=record:raise RuntimeError(f'HASH_MISMATCH: {rel}')
 return obj

def path(case,arm):return DATA/f"{case['id']}-{arm}.json"

def run(case,arm):
 dest=path(case,arm)
 if dest.exists():raise RuntimeError(f'RESULT_ALREADY_EXISTS {dest.name}')
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--episodes','1',
      '--seconds','65','--seed',str(case['seed']),'--classic-maps',case['map'],
      '--bots','8','--opponents','official','--lag-ms','45','--trainee-primary',case['weapon'],
      '--tdm-v60-arm',arm,'--tdm-v60-stratum',case['stratum'],'--out',str(dest)]
 x=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
 (DATA/f"{case['id']}-{arm}.log").write_text(x.stdout+'\n'+x.stderr,encoding='utf-8')
 if x.returncode!=0 or not dest.exists():raise RuntimeError(f'FAILED {case["id"]} {arm} {x.returncode} {x.stderr[-500:]}')
 result=json.loads(dest.read_text(encoding='utf-8'))['results'][0]
 return {'case':case['id'],'arm':arm,'trigger':result['tdmV60']['triggerTick'],
  'changed':result['tdmV60']['changedTicks'],'kills':result['kills'],'deaths':result['deaths']}

def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)

def audit_case(case):
 records=[]
 for arm in ARMS:
  f=path(case,arm)
  if not f.exists():return {'id':case['id'],'status':'missing','missing':arm}
  m=json.loads(f.read_text(encoding='utf-8'))['results'][0]
  records.append((arm,m,m['tdmV60'],digest(f)))
 base=records[0][2]
 issues=[]
 for arm,m,t,sha in records:
  for key in ['triggerTick','prestate','prefixSHA256','triggerPublicFeatures','initial']:
   if canonical(t.get(key))!=canonical(base.get(key)):issues.append(f'{arm} mismatch {key}')
  if m['errors']!=0:issues.append(f'{arm} simulator errors')
  if t['changedTicks']>120 or t['activeTicks']>120:issues.append(f'{arm} exceeds treatment cap')
  if t.get('onlyMovementModified') is not True:issues.append(f'{arm} motor mutation contract')
  if t.get('privilegedWitnessNotActorInput') is not True:issues.append(f'{arm} privileged leak contract')
  if t['triggerTick'] is not None:
   if t['prestate'] is None or t['prestate'].get('tick')!=t['triggerTick']:issues.append(f'{arm} bad witness')
   if not isinstance(t['prestate'].get('rngState'),int):issues.append(f'{arm} absent RNG state')
   if not t['complete']:issues.append(f'{arm} censored outcome')
  elif t['prestate'] is not None:issues.append(f'{arm} witness without trigger')
  if t['complete']:
   for key,value in t['initial'].items():
    if t['outcome'][key] != t['terminal'][key]-value:issues.append(f'{arm} wrong {key} delta')
 if base['changedTicks']:issues.append('keep changed WASD')
 return {'id':case['id'],'status':'PASS' if not issues else 'FAIL','issues':issues,
   'trigger':base['triggerTick'],'changedArms':sum(v['changedTicks']>0 for _,_,v,_ in records),
   'event':any(v['outcome'] and any(v['outcome'].get(k,0) for k in ('kills','deaths','damageTaken')) for _,_,v,_ in records),
   'arms':{a:{'changed':v['changedTicks'],'finalKills':m['kills'],'finalDeaths':m['deaths'],
      'outcome':v['outcome'],'sha256':sha} for a,m,v,sha in records}}

def audit(reg):
 rows=[audit_case(c) for c in reg['cases'] if c['split']=='discovery' and all(path(c,a).exists() for a in ARMS)]
 report={'schema':'fpsarena-v60-independent-group-audit-v1','groups':rows,
  'groupsCompleted':len(rows),'allPass':all(x['status']=='PASS' for x in rows),
  'triggered':sum(x['trigger'] is not None for x in rows),
  'hazardRewardGroups':sum(x['event'] for x in rows),
  'registrySha256':digest(REG),'holdoutOpened':False,'noPromotion':True}
 (DATA/'v60-audit.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8')
 return report

if __name__=='__main__':
 task=sys.argv[1] if len(sys.argv)>1 else 'verify'
 if task=='freeze':print('FROZEN',digest(REG) if REG.exists() else len(freeze()['cases']))
 elif task=='verify':print('VERIFIED',len(verify()['cases']),digest(REG))
 elif task=='run':
  obj=verify()
  chosen=set(sys.argv[2:])
  cs=[c for c in obj['cases'] if c['split']=='discovery' and (not chosen or c['id'] in chosen)]
  if chosen and set(c['id'] for c in cs)!=chosen:raise RuntimeError('HOLDOUT_OR_UNKNOWN_CASE_BLOCKED')
  for c in cs:
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    tasks=[pool.submit(run,c,a) for a in ARMS]
    for t in concurrent.futures.as_completed(tasks):print('RESULT',json.dumps(t.result()),flush=True)
 elif task=='audit':
  obj=audit(verify());print(json.dumps({k:obj[k] for k in ['groupsCompleted','allPass','triggered','hazardRewardGroups','holdoutOpened']}))
  if not obj['allPass']:sys.exit(2)
 else:raise SystemExit('usage: freeze|verify|run [discovery group IDs]|audit')
