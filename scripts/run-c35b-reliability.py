#!/usr/bin/env python3
"""Preregistered C35-B dose engineering pilot (never confirmatory combat efficacy).

36 seeded setups x fixed 80/120/160 ms dose per setup. Assignment remains
3-arm C21 after unchanged C16 gate. Source SHA lock checked before any run.
"""
from __future__ import annotations
import argparse, concurrent.futures, hashlib, json, os, pathlib, subprocess, tempfile, time
ROOT=pathlib.Path(__file__).resolve().parent.parent
PARENT=ROOT.parent/'FPS-Arena-Combat-Suite-v2.9.11-C35-Randomized-Action-Pilot.zip'
MAPS=('arena','foundry','neon')
WEAPONS=('mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3')
OPPONENTS=('official','mixed','stress')
DOSES=(80,120,160)
LOCKED=('lab/arena/train-main.mjs','lab/arena/micro-action-reliability-c35b.mjs',
 'lab/arena/randomized-safe-action-c35.mjs','lab/arena/encounter-randomization-c21.mjs',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/safe-action-explorer-c14.mjs',
 'lab/arena/source-main/server/game.js','lab/arena/source-main/server/bot.js',
 'page-agent.js','scripts/run-c35b-reliability.py')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def atomic(p,x):
 p.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile('w',encoding='utf8',dir=p.parent,delete=False) as f:
  json.dump(x,f,indent=2,ensure_ascii=False);f.write('\n');tmp=f.name
 os.replace(tmp,p)
def plan():
 cases=[]
 for mi,m in enumerate(MAPS):
  for wi,w in enumerate(WEAPONS):
   for rep in range(2):
    setup=mi*12+wi*2+rep;seed=35380001+setup*107
    for dose in DOSES:
     cases.append(dict(id=f'{setup:02}-{dose}',setupId=f'{setup:02}',seed=seed,
       map=m,enemyPrimary=w,opponentPolicy=OPPONENTS[(wi+rep)%3],
       lagMs=(35,65,125)[(mi+rep+wi)%3],doseMs=dose,seconds=120,split='technical-pilot'))
 cases.sort(key=lambda v:(int(v['setupId'])*13+v['doseMs']//40)%109)
 assert len(cases)==108 and len({c['seed'] for c in cases})==36
 reg={'schema':'fpsarena-c35b-preregistered-dose-reliability-v1',
  'parentC35ArchiveSHA256':sha(PARENT),'cases':cases,
  'sourceFilesSHA256':{x:sha(ROOT/x) for x in LOCKED},
  'objective':'diagnose post-assignment interruption reasons, delivery fraction, eligible offer and hostile-hit densities',
  'design':'36 base seeds x 3 dose variants (80/120/160 ms) with matched preset map/weapon/opponent/lag; randomized arm each offer by unchanged C21; not equivalent to paired counterfactual encounters',
  'primaryEngineeringEndpoints':['micro interruption proportion per assigned micro','executed ticks / nominal ticks','pre-decision eligible offer counts'],
  'secondaryEngineeringEndpoints':['post-assignment C16 interruption reasons','pooled hostile-hit window density','public local positional displacement at 100/300/900ms','weapon-hit density by setup'],
  'forbiddenInterpretation':'not preregistered or powered for arm-specific damage efficacy, win rate, learned dodge policy, or per-protocol causal effects',
  'safety':'unchanged C16, inspected before assignment and every intervened tick, original Autopilot priority always wins',
  'nonoverlap':'minimum 1.8s elapsed between offers',
  'knownThreats':['offer counts differ across policy-altered trajectories','action duration influences dose by construction','within-match interference','client locally predicted motion','thin actual hostile damage signals'],
  'gates':{'eligibleThreeArmSafety':'strict','assignmentReplayMismatch':0,'runtimeErrors':0,'publicLeak':0,'minimumCompleteOffers':300,
   'targetInterruptionAt80ms':.05,'note':'5% is diagnostic aspirational threshold; duration comparison is a dose feasibility test; no action promotion'},
  'actionAssignment':'C21 hash and probability 1/3, no new RNG; same seed dose variants may diverge after first intervention',
  'freezeBeforeData':True}
 reg['registrationSHA256']=hashlib.sha256(json.dumps(reg,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 return reg
def check_case(c,p,reg):
 stem=p/f'match-{c["id"]}';a=stem.with_suffix('.result.json');b=stem.with_suffix('.dataset.json')
 if not(a.is_file() and b.is_file()):return False
 try:
  res=json.loads(a.read_text());ds=json.loads(b.read_text());m=ds['matches'][0];r=res['results'][0]
  assert ds['schema']=='fpsarena-c35b-reliability-dataset-v1' and len(ds['matches'])==1
  assert ds['registrationSHA256']==reg['registrationSHA256']
  assert ds['controlledEnemyPrimary']==c['enemyPrimary']
  assert m['schema']=='fpsarena-c35b-duration-reliability-match-v1'
  assert m['metadata']['registrationSHA256']==reg['registrationSHA256']
  assert m['metadata']['seed']==c['seed'] and m['metadata']['map']==c['map']
  assert m['metadata']['doseMs']==c['doseMs']
  assert r['errors']==0 and r['mode']=='tdm' and r['seed']==c['seed'] and r['map']==c['map']
  assert res['seconds']==120 and res['snapshotLagMs']==c['lagMs'] and res['opponentPolicy']==c['opponentPolicy']
  return True
 except (AssertionError,KeyError,IndexError,TypeError,ValueError):return False
def main():
 p=argparse.ArgumentParser();p.add_argument('--dir',default='reports/c35b/pilot-108');p.add_argument('--workers',type=int,default=6);p.add_argument('--resume',action='store_true');a=p.parse_args()
 if not 1<=a.workers<=12:raise SystemExit('workers must be 1..12')
 if not PARENT.is_file():raise SystemExit('C35 parent archive unavailable')
 reg=plan();output=ROOT/a.dir;output.mkdir(parents=True,exist_ok=True)
 target=output/'PRE-REGISTERED-PLAN.json'
 if target.exists():
  if not a.resume or json.loads(target.read_text())!=reg:raise SystemExit('C35-B locked plan/source mismatch')
 else:
  if a.resume:raise SystemExit('cannot resume without plan')
  atomic(target,reg)
 pending=[c for c in reg['cases'] if not check_case(c,output,reg)]
 print(f"C35B prereg={reg['registrationSHA256']} pending={len(pending)} cases=108",flush=True)
 def run(c):
  stem=output/f"match-{c['id']}";res=stem.with_suffix('.result.json');ds=stem.with_suffix('.dataset.json');log=stem.with_suffix('.log')
  for f in [res,ds]:f.unlink(missing_ok=True)
  cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds','120',
   '--seed',str(c['seed']),'--bots','5','--lag-ms',str(c['lagMs']),'--opponents',c['opponentPolicy'],
   '--c35b-enemy-primary',c['enemyPrimary'],'--c35b-dose-ms',str(c['doseMs']),
   '--c35b-registration-sha',reg['registrationSHA256'],'--c35b-dataset',str(ds),'--out',str(res)]
  with open(log,'w') as f:
   try:completed=subprocess.run(cmd,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,timeout=200)
   except subprocess.TimeoutExpired:return c['id'],'TIMEOUT'
  return c['id'],'complete' if completed.returncode==0 and check_case(c,output,reg) else 'INVALID'
 now=time.monotonic();failed=[];done=108-len(pending)
 with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
  for future in concurrent.futures.as_completed([pool.submit(run,c) for c in pending]):
   ident,status=future.result()
   if status=='complete':done+=1
   else:failed.append((ident,status))
   if done%6==0 or status!='complete':print(f'C35B {done}/108 {ident} {status} elapsed={time.monotonic()-now:.1f}s',flush=True)
 if failed:raise SystemExit('failed cases: '+str(failed))
 subprocess.run(['python','scripts/verify-c35b-reliability.py','--dir',a.dir],cwd=ROOT,check=True)
 print('C35-B PILOT COMPLETE',flush=True)
if __name__=='__main__':main()
