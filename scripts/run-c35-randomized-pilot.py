#!/usr/bin/env python3
"""C35 technical pilot: fixed-match identities, 3-arm assignment, research-only.

No per-arm efficacy inspection; pilot is for safety, provenance, opportunity
and event-rate accounting. It must not be used as a confirmatory holdout.
"""
from __future__ import annotations
import argparse, concurrent.futures, hashlib, json, os, pathlib, subprocess, tempfile, time, collections
ROOT=pathlib.Path(__file__).resolve().parent.parent
C34_ARCHIVE=ROOT.parent/'FPS-Arena-Combat-Suite-v2.9.11-C34-Real-Encounter-Study.zip'
PARENT_SHA='b13a002ad123eb1ee63f73519fd20fb1e3f37ad44c75dbf9ae397015ec6b8df7'
WEAPONS=('mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3')
MAPS=('arena','foundry','neon')
OPPONENTS=('official','mixed','stress')
LOCKED=('lab/arena/train-main.mjs','lab/arena/randomized-safe-action-c35.mjs',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/safe-action-explorer-c14.mjs','lab/arena/real-encounter-observer-c34.mjs',
 'lab/arena/source-main/server/game.js','lab/arena/source-main/server/bot.js',
 'page-agent.js','scripts/run-c35-randomized-pilot.py')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=path.parent,delete=False) as f:
  json.dump(data,f,indent=2,ensure_ascii=False);f.write('\n'); temp=f.name
 os.replace(temp,path)
def plan():
 cases=[]
 for m,mapname in enumerate(MAPS):
  for w,weapon in enumerate(WEAPONS):
   for rep in range(5):
    i=(m*6+w)*5+rep
    cases.append(dict(id=f'{i:03}',seed=35360001+i*73,map=mapname,enemyPrimary=weapon,
      opponentPolicy=OPPONENTS[(rep+w)%3],lagMs=(35,65,125)[(m+rep)%3],seconds=180,
      split='technical-pilot'))
 assert len(cases)==90 and len({c['seed'] for c in cases})==90
 reg={
  'schema':'fpsarena-c35-preregistered-technical-pilot-v1',
  'purpose':'validate causal randomization pipeline integrity, safety, sparsity and compute; no per-arm efficacy evaluation',
  'parentC34ArchiveSHA256':PARENT_SHA,'cases':cases,'sourceFilesSHA256':{p:sha(ROOT/p) for p in LOCKED},
  'assignment':'C21 independent hash, known probability 1/3, C16 symmetric candidate set before assignment',
  'outcome':'server-confirmed hostile weapon damage in nonoverlapping 1.8s windows; partial windows censored',
  'horizonsSeconds':[.3,.9,1.8],
  'followup':'Full C35 confirmatory cohort requires separate preregistration and new seeds; proposed >=750 x180s, offer/event gates based on pilot nuisance rates',
  'pilotAnalysis':'pooled event density, arm assignment balance, interruption rates, integrity; no treatment effect or model fitting',
  'failClosed':['missing server event','seed collision','unsafe C16 offer','snapshot leakage','invalid propensity','assignment replay mismatch','missing outcome window','hash mismatch']
 }
 reg['registrationSHA256']=hashlib.sha256(json.dumps(reg,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 return reg
def check_case(c,p):
 stem=p/f"match-{c['id']}"; a=stem.with_suffix('.result.json');b=stem.with_suffix('.dataset.json')
 if not(a.is_file() and b.is_file()):return False
 try:
  res=json.loads(a.read_text());ds=json.loads(b.read_text());mm=ds['matches'][0];r=res['results'][0]
  assert ds['schema']=='fpsarena-c35-randomized-safe-action-dataset-v1'
  assert ds['registrationSHA256']==REG['registrationSHA256']
  assert ds['controlledEnemyPrimary']==c['enemyPrimary']
  assert mm['metadata']['registrationSHA256']==REG['registrationSHA256']
  assert mm['metadata']['seed']==c['seed'] and mm['metadata']['map']==c['map']
  assert mm['schema']=='fpsarena-c35-causal-match-v1' and mm['metadata']['snapshotLagMs']==c['lagMs']
  assert res['seed']==c['seed'] and res['seconds']==180 and res['snapshotLagMs']==c['lagMs']
  assert res['opponentPolicy']==c['opponentPolicy'] and res['profile']=='release'
  assert r['errors']==0 and r['mode']=='tdm' and r['map']==c['map']
  assert r['seed']==c['seed']
  assert len(ds['matches'])==1
  assert sum(mm['diagnostics']['actionCounts'].values())==len(mm['offers'])
  return True
 except (AssertionError,KeyError,IndexError,TypeError,ValueError):return False
REG=None
def main():
 global REG
 parser=argparse.ArgumentParser();parser.add_argument('--dir',default='reports/c35/pilot-90');parser.add_argument('--workers',type=int,default=6);parser.add_argument('--resume',action='store_true');args=parser.parse_args()
 if not 1<=args.workers<=12:raise SystemExit('worker count must be 1..12')
 p=ROOT/args.dir;p.mkdir(parents=True,exist_ok=True)
 REG=plan();plan_file=p/'PRE-REGISTERED-PLAN.json'
 if not C34_ARCHIVE.is_file() or sha(C34_ARCHIVE)!=PARENT_SHA:raise SystemExit('C34 immutable parent missing or SHA changed')
 if plan_file.exists():
  if not args.resume or json.loads(plan_file.read_text())!=REG:raise SystemExit('C35 locked pilot has different source/cases or --resume was not passed')
 else:
  if args.resume:raise SystemExit('C35 cannot resume without immutable plan')
  atomic(plan_file,REG)
 pending=[c for c in REG['cases'] if not check_case(c,p)]
 print(f"C35 prereg={REG['registrationSHA256']} cases=90 pending={len(pending)}",flush=True)
 def run(c):
  stem=p/f"match-{c['id']}";a=stem.with_suffix('.result.json');b=stem.with_suffix('.dataset.json');log=stem.with_suffix('.log')
  for f in (a,b):f.unlink(missing_ok=True)
  cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
   '--seconds','180','--seed',str(c['seed']),'--bots','5','--lag-ms',str(c['lagMs']),
   '--opponents',c['opponentPolicy'],'--c35-enemy-primary',c['enemyPrimary'],
   '--c35-registration-sha',REG['registrationSHA256'],'--c35-dataset',str(b),'--out',str(a)]
  with open(log,'w') as f:
   try:proc=subprocess.run(cmd,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,timeout=240)
   except subprocess.TimeoutExpired:return c['id'],'timeout'
  return c['id'],'complete' if proc.returncode==0 and check_case(c,p) else 'INVALID'
 start=time.monotonic();failed=[];done=90-len(pending)
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
  futures=[pool.submit(run,c) for c in pending]
  for future in concurrent.futures.as_completed(futures):
   ident,status=future.result()
   if status!='complete':failed.append((ident,status))
   else:done+=1
   print(f'C35 PILOT {done}/90 case={ident} {status} elapsed={time.monotonic()-start:.1f}s',flush=True)
 if failed:raise SystemExit(f'C35 incomplete; valid files preserved; run --resume on identical code: {failed}')
 from subprocess import run as cmdrun
 result=cmdrun(['python','scripts/verify-c35-pilot.py','--dir',args.dir],cwd=ROOT,check=True)
 print('C35 PILOT 90/90 complete and independently verified',flush=True)
if __name__=='__main__':main()
