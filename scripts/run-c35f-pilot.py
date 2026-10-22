#!/usr/bin/env python3
"""Registered, non-overwriting, independently-seeded C35-F exploratory motor pilot.

36 authentic FPS Arena headless Game.step TDM runs (18 matched setups x two
policies). The pairing controls configurations, NOT future encounter states.
"""
from __future__ import annotations
import concurrent.futures, hashlib, json, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35f/pilot-18-pairs'
SOURCE=['lab/arena/train-main.mjs','lab/arena/opportunity-constrained-scheduler-c35f.mjs',
        'lab/arena/opportunity-preserving-shadow-c35e.mjs',
        'lab/arena/macro-micro-integration-c35c.mjs',
        'lab/arena/micro-action-reliability-c35b.mjs',
        'lab/arena/encounter-randomization-c21.mjs',
        'lab/arena/safe-action-explorer-c16.mjs',
        'lab/arena/macro-forecast-policy-c35d.mjs',
        'lab/arena/source-main/server/game.js', 'page-agent.js',
        'reports/c35d2/FROZEN-FORECAST.json']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canon(o):return (json.dumps(o,sort_keys=True,indent=2)+'\n').encode()
def plan():
 guns=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']; maps=['arena','neon','foundry']; cases=[]
 for mi,mp in enumerate(maps):
  for gi,gun in enumerate(guns):
   i=mi*6+gi; seed=35552001+i*137
   common={'setupId':f'c35f-{i:02}', 'seed':seed,'map':mp,'gun':gun,'seconds':90,
    'lagMs':[65,125,35][(i+mi)%3],'opponents':['stress','mixed','official'][(i+gi)%3],'bots':5}
   for policy in ['shadow80','stagger80']:
    cases.append({'id':f'c35f-{i:02}-{policy}',**common,'policy':policy})
 return {'schema':'fpsarena-c35f-motor-pilot-prereg-v1','researchStatus':'EXPLORATORY_NONPROMOTABLE',
  'exposureConstraint':'All C16-eligible offers retain C21 assignment: policy may defer first micro tick by <=1 server tick but never filter an arm.',
  'precommittedRiskThreshold':0.20,'precommittedMaxDelayTicks':1,
  'primary':'micro executed ticks / all attempted preoffers, intention-to-treat by setup',
  'coPrimary':['shots / simulated minute','C16 intervention safety violations'],
  'exploratoryMargins':{'executedTicksPerAttemptRatioLower':0.95,'shotsPerMinuteRatioLower':0.95},
  'analysisNote':'paired setup-cluster resampling, 5000 draws; all randomized arms included; no post-treatment filtering',
  'limitations':['not isolated identical counterfactual world states','sparse hostile hits','map families reused','90 sec censoring'],
  'sourceSHA256':{str(p):sha(ROOT/p) for p in SOURCE},'cases':cases}
def run(c,registration):
 p=OUT/'matches';p.mkdir(exist_ok=True,parents=True)
 prefix=p/c['id']; ds=Path(str(prefix)+'.dataset.json');rs=Path(str(prefix)+'.result.json');log=Path(str(prefix)+'.log')
 if ds.exists() or rs.exists() or log.exists():raise RuntimeError('refuse overwrite '+c['id'])
 argv=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
  '--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--c35c-dataset',str(ds),'--c35c-policy',c['policy'],'--c35c-setup-id',c['setupId'],
  '--c35c-enemy-primary',c['gun'],'--c35c-registration-sha',registration,
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--out',str(rs)]
 cp=subprocess.run(argv,cwd=ROOT,text=True,capture_output=True,timeout=240)
 log.write_text(cp.stdout+'\n'+cp.stderr)
 if cp.returncode:raise RuntimeError(f'{c["id"]}: {cp.stderr[-1200:]}')
 d=json.loads(ds.read_text());a=json.loads(rs.read_text());m=d['matches'][0]
 if a['aggregate']['agentErrors']!=0 or m['metadata']['policy']!=c['policy']:raise RuntimeError('corrupt result: '+c['id'])
 return {'id':c['id'],'setupId':c['setupId'],'policy':c['policy'],'seed':c['seed'],
  'datasetSHA256':sha(ds),'resultSHA256':sha(rs),'preoffers':m['c35c']['diagnostics']['attempts'],
  'offers':len(m['offers'])}
if __name__=='__main__':
 OUT.mkdir(exist_ok=True,parents=True)
 p=OUT/'FROZEN-DESIGN.json';registered=plan()
 if p.exists():
  if json.loads(p.read_text())!=registered:raise RuntimeError('source/config drift against frozen design')
 else:p.write_bytes(canon(registered))
 registration=sha(p)
 print('C35F PRE-REGISTERED',registration,flush=True)
 started=time.monotonic();rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for future in concurrent.futures.as_completed([pool.submit(run,c,registration) for c in registered['cases']]):
   x=future.result();rows.append(x);print(f'{len(rows):02}/36 {x["id"]} {x["offers"]} offers',flush=True)
 (OUT/'EXECUTION-AUDIT.json').write_bytes(canon({'registrationSHA256':registration,
  'executed':sorted(rows,key=lambda z:z['id']),'elapsedWallSeconds':round(time.monotonic()-started,2)}))
 subprocess.run([sys.executable,'scripts/analyze-c35f-pilot.py'],cwd=ROOT,check=True)
