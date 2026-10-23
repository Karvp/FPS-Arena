#!/usr/bin/env python3
"""V61 preregistered multi-arm research. Holdout never runs automatically."""
import concurrent.futures
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'v61'
DATA.mkdir(parents=True, exist_ok=True)
REG = ROOT / 'research' / 'tdm-v61-frozen-registry.json'
ARMS = ('keep','close','strafe','withdraw')
FILES = ['lab/arena/tdm-engagement-trigger-v61.mjs','lab/arena/tdm-stratified-replay-v60.mjs','lab/arena/train-main-v61.mjs','tests/tdm-v61-engagement-trigger.test.mjs','scripts/tdm_v61_protocol.py']
PROTECTED = ['page-agent.js','lab/arena/source-main/server/game.js','lab/arena/source-main/server/bot.js']
CASES = [
 {'id':'v61-train-arena-uzi-aim', 'split':'discovery', 'map':'arena', 'weapon':'uzi', 'stratum':'aim-lock', 'seed':610101},
 {'id':'v61-train-arena-uzi-fire', 'split':'discovery', 'map':'arena', 'weapon':'uzi', 'stratum':'post-fire', 'seed':610102},
 {'id':'v61-train-foundry-uzi-aim', 'split':'discovery', 'map':'foundry', 'weapon':'uzi', 'stratum':'aim-lock', 'seed':610103},
 {'id':'v61-train-foundry-uzi-fire', 'split':'discovery', 'map':'foundry', 'weapon':'uzi', 'stratum':'post-fire', 'seed':610104},
 {'id':'v61-train-neon-aa12-fire', 'split':'discovery', 'map':'neon', 'weapon':'aa12', 'stratum':'post-fire', 'seed':610105},
 {'id':'v61-train-foundry-aa12-aim', 'split':'discovery', 'map':'foundry', 'weapon':'aa12', 'stratum':'aim-lock', 'seed':610106},
 {'id':'v61-train-arena-mp5sd-aim', 'split':'discovery', 'map':'arena', 'weapon':'mp5sd', 'stratum':'aim-lock', 'seed':610107},
 {'id':'v61-train-neon-m4a1-fire', 'split':'discovery', 'map':'neon', 'weapon':'m4a1', 'stratum':'post-fire', 'seed':610108},
 {'id':'v61-train-foundry-m4a1-damage', 'split':'discovery', 'map':'foundry', 'weapon':'m4a1', 'stratum':'post-damage', 'seed':610109},
 {'id':'v61-hold-arena-uzi-fire', 'split':'holdout', 'map':'arena', 'weapon':'uzi', 'stratum':'post-fire', 'seed':610110},
 {'id':'v61-hold-foundry-aa12-aim', 'split':'holdout', 'map':'foundry', 'weapon':'aa12', 'stratum':'aim-lock', 'seed':610111}
]

def digest(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def freeze():
 if REG.exists():raise RuntimeError('REGISTRY_EXISTS: do not overwrite frozen manifest')
 obj={'schema':'fpsarena-v61-frozen-preregistered-v1',
      'baseline':'C35AJ local, v61 public-combat trigger research, not V31 or v57', 'arms':ARMS,'cases':CASES,
      'sourceHash':{p:digest(ROOT/p) for p in FILES},
      'protectedHash':{p:digest(ROOT/p) for p in PROTECTED},
      'calibrationSeeds':[441108,441109],
      'protocol':{'researchOnly':True,'holdoutAutomaticallyBlocked':True,'windowTreatmentTicks':150,'windowOutcomeTicks':480,
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
 cmd=['node','lab/arena/train-main-v61.mjs','--profile','release','--modes','tdm','--episodes','1',
      '--seconds','78','--seed',str(case['seed']),'--classic-maps',case['map'],
      '--bots','8','--opponents','official','--lag-ms','45','--trainee-primary',case['weapon'],
      '--tdm-v61-arm',arm,'--tdm-v61-stratum',case['stratum'],'--out',str(dest)]
 x=subprocess.run(cmd,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
 (DATA/f"{case['id']}-{arm}.log").write_text(x.stdout+'\n'+x.stderr,encoding='utf-8')
 if x.returncode!=0 or not dest.exists():raise RuntimeError(f'FAILED {case["id"]} {arm} {x.returncode} {x.stderr[-500:]}')
 result=json.loads(dest.read_text(encoding='utf-8'))['results'][0]
 return {'case':case['id'],'arm':arm,'trigger':result['tdmV61']['triggerTick'],
  'changed':result['tdmV61']['changedTicks'],'kills':result['kills'],'deaths':result['deaths']}

def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)

def audit_case(case):
 records=[]
 for arm in ARMS:
  f=path(case,arm)
  if not f.exists():return {'id':case['id'],'status':'missing','missing':arm}
  m=json.loads(f.read_text(encoding='utf-8'))['results'][0]
  records.append((arm,m,m['tdmV61'],digest(f)))
 base=records[0][2]
 issues=[]
 for arm,m,t,sha in records:
  for key in ['triggerTick','prestate','prefixSHA256','triggerPublicFeatures','initial']:
   if canonical(t.get(key))!=canonical(base.get(key)):issues.append(f'{arm} mismatch {key}')
  if m['errors']!=0:issues.append(f'{arm} simulator errors')
  if t['changedTicks']>150 or t['activeTicks']>150:issues.append(f'{arm} exceeds treatment cap')
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
 report={'schema':'fpsarena-v61-independent-group-audit-v1','groups':rows,
  'groupsCompleted':len(rows),'allPass':all(x['status']=='PASS' for x in rows),
  'triggered':sum(x['trigger'] is not None for x in rows),
  'hazardRewardGroups':sum(x['event'] for x in rows),
  'registrySha256':digest(REG),'holdoutOpened':False,'noPromotion':True}
 (DATA/'v61-audit.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8')
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
