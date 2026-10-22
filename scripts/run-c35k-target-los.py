#!/usr/bin/env python3
"""Preregistered C35-K independent 18-match observational pilot, no actuator change."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib,json,subprocess,time,sys
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35k/pilot-18-fresh'
SOURCES=['lab/arena/train-main.mjs','lab/arena/public-target-los-c35k.mjs',
 'lab/arena/match-engagement-recorder-c12.mjs','lab/arena/public-firing-corridor-c35i.mjs',
 'lab/arena/firing-corridor-calibration-c35j.mjs','lab/arena/firing-compatible-macro-c35h.mjs',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/source-main/shared/geometry.js','page-agent.js','reports/c35d2/FROZEN-FORECAST.json']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,sort_keys=True,indent=2)+'\n')
def plan():
 cases=[]
 for mi,mp in enumerate(['arena','neon','foundry']):
  for wi,gun in enumerate(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']):
   i=mi*6+wi
   cases.append({'id':f'c35k-{i:02d}-observe','setupId':f'c35k-{i:02d}',
    'seed':37510013+i*193,'map':mp,'gun':gun,'seconds':60,'lagMs':[35,65,125][(i+wi)%3],
    'opponents':['official','mixed','stress'][(i+mi)%3],'bots':5,'policy':'observe'})
 return {'schema':'fpsarena-c35k-frozen-measurement-v1','date':'2026-10-13','cases':cases,
  'sourceSHA256':{s:sha(ROOT/s) for s in SOURCES},
  'primary':'Legacy C12/C35I selected-ID matches verified public nearest-hostile ID, among C35K-eligible fire ticks',
  'secondary':['3D vs footprint cover, cover height classes','hostile candidate freshness/unknown team abstention',
  'fire command/shot parity and C21 assignment integrity'],
  'eligibility':'Every pre-step fire tick; public team IDs, delayed public snapshot, geometry validation; no poststep fallback',
  'fixedStatus':'MEASUREMENT_ONLY; NO POLICY PROMOTION; C36 BLOCKED'}
def run_case(c,reg):
 prefix=OUT/'matches'/c['id'];prefix.parent.mkdir(parents=True,exist_ok=True)
 files={kind:Path(str(prefix)+f'.{kind}.json') for kind in ['result','dataset','fire','macro','lane','calibration','identity']}
 log=Path(str(prefix)+'.log')
 if any(p.exists() for p in files.values()):
  if not all(p.exists() for p in files.values()):raise RuntimeError('partial case refused: '+c['id'])
  return {'id':c['id'],'sha256':{k:sha(f) for k,f in files.items()},'reused':True}
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
  '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],
  '--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80',
  '--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,'--c35c-dataset',str(files['dataset']),
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(files['fire']),'--c35h-trace',str(files['macro']),'--c35h-policy','observe',
  '--c35i-trace',str(files['lane']),'--c35j-trace',str(files['calibration']),
  '--c35k-trace',str(files['identity']),'--out',str(files['result'])]
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=240)
 log.write_text(r.stdout+'\n'+r.stderr)
 if r.returncode:raise RuntimeError(c['id']+' '+r.stderr[-1200:])
 return {'id':c['id'],'sha256':{k:sha(f) for k,f in files.items()},'reused':False}
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 design=plan();f=OUT/'FROZEN-DESIGN.json'
 if f.exists():
  if json.loads(f.read_text())!=design:raise RuntimeError('SOURCE OR DESIGN CHANGED AFTER LOCK')
 else:write(f,design)
 reg=sha(f);print('FROZEN',reg,flush=True)
 results=[];start=time.monotonic()
 with ThreadPoolExecutor(max_workers=5) as pool:
  tasks={pool.submit(run_case,c,reg):c for c in design['cases']}
  for fut in as_completed(tasks):
   d=fut.result();results.append(d);print(len(results),'/',len(design['cases']),d['id'],flush=True)
 write(OUT/'EXECUTION-AUDIT.json',{'registrationSHA256':reg,'matches':sorted(results,key=lambda a:a['id']),
  'elapsedWallSeconds':round(time.monotonic()-start,2)})
 subprocess.run([sys.executable,'scripts/analyze-c35k-target-los.py'],cwd=ROOT,check=True)
