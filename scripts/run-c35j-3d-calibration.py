#!/usr/bin/env python3
"""C35-J locked observational calibration: original C35-H policies unchanged.
18 independent new-seed setups x 2 arms. All safety and sampling audit retained.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib, json, subprocess, time, sys
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35j/pilot-18-fresh-3d-v2'
SOURCES=['lab/arena/train-main.mjs','lab/arena/public-firing-corridor-c35i.mjs',
 'lab/arena/firing-corridor-calibration-c35j.mjs','lab/arena/firing-compatible-macro-c35h.mjs',
 'lab/arena/source-main/shared/geometry.js','lab/arena/source-main/shared/movement.js',
 'lab/arena/source-main/server/combat.js','lab/arena/source-main/server/game.js',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'page-agent.js','reports/c35d2/FROZEN-FORECAST.json']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,sort_keys=True,indent=2)+'\n')
def plan():
 cases=[]
 for mi,mp in enumerate(['arena','neon','foundry']):
  for wi,gun in enumerate(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']):
   i=mi*6+wi
   base={'setupId':f'c35j-{i:02d}','seed':36200011+i*157,'map':mp,'gun':gun,
     'seconds':60,'lagMs':[35,65,125][(i+wi)%3],'opponents':['official','mixed','stress'][(i+mi)%3], 'bots':5}
   for policy in ['observe','lateral']:cases.append({**base,'policy':policy,'id':f'c35j-{i:02d}-{policy}'})
 return {'schema':'fpsarena-c35j-frozen-3d-preregister-v1','cases':cases,
  'sourceSHA256':{s:sha(ROOT/s) for s in SOURCES},'date':'2026-10-13',
  'primary':'Compare C35I 2D footprint obstruction with pre-action 3D public body-center ray at every fire tick',
  'secondary':['poststep static oracle vs public predecision 3D (temporal mismatch not accuracy)','nearest-vs-aim-aligned target ID','weapon subgroup and snapshot validity','C21 and fire integrity'],
  'boundaries':'all public features frozen before Game.step; post-step server geometry/hits only audit, never bot inputs',
  'unchangedPolicies':['C35H observe','C35H lateral'],'promotion':'PROHIBITED',
  'interpretation':'observation only, shots and hits not proof of corridor prediction correctness'}
def execute(c,registration):
 pre=OUT/'matches'/c['id'];pre.parent.mkdir(exist_ok=True,parents=True)
 files={kind:Path(f'{pre}.{kind}.json') for kind in ['result','dataset','fire','macro','lane','calibration']}
 log=Path(f'{pre}.log')
 if any(p.exists() for p in [*files.values(),log]):
  if not all(p.exists() for p in [*files.values(),log]):raise RuntimeError('incomplete existing case, refuses overwrite '+c['id'])
  a=json.loads(files['result'].read_text())['aggregate']
  j=json.loads(files['calibration'].read_text())['traces'][0]['counts']
  if a['agentErrors'] or j['fireModified'] or j['serverShots']!=a['shots']:raise RuntimeError('existing case invalid '+c['id'])
  return {'id':c['id'],'shots':a['shots'],'fireTicks':j['fireTicks'],'validPublic':j['validPublic'],
   'sha256':{k:sha(v) for k,v in files.items()},'reusedVerified':True}
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
  '--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],
  '--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
  '--c35c-registration-sha',registration,'--c35c-dataset',str(files['dataset']),
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(files['fire']),'--c35h-trace',str(files['macro']),
  '--c35h-policy',c['policy'],'--c35i-trace',str(files['lane']),
  '--c35j-trace',str(files['calibration']),'--out',str(files['result'])]
 try:r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=240)
 except Exception as e:log.write_text(str(e));raise
 log.write_text(r.stdout+'\n'+r.stderr)
 if r.returncode:raise RuntimeError(c['id']+' '+r.stderr[-900:])
 result=json.loads(files['result'].read_text())['aggregate']
 lane=json.loads(files['lane'].read_text())['traces'][0]['counts']
 fire=json.loads(files['fire'].read_text())['traces'][0]['counts']
 calib=json.loads(files['calibration'].read_text())['traces'][0]['counts']
 if (result['agentErrors'] or calib['fireModified'] or calib['fireTicks']!=lane['sampledFire']
     or calib['fireTicks']!=fire['incumbentFireTicks'] or calib['serverShots']!=result['shots']
     or calib['validPublic']+calib['invalidPublic']!=calib['fireTicks']):
  raise RuntimeError('C35J FIRE/DENOMINATOR AUDIT FAILED '+c['id'])
 return {'id':c['id'],'shots':result['shots'],'fireTicks':calib['fireTicks'],
  'validPublic':calib['validPublic'],'sha256':{k:sha(v) for k,v in files.items()}}
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 design=plan();frozen=OUT/'FROZEN-DESIGN.json'
 if frozen.exists():
  if json.loads(frozen.read_text())!=design:raise RuntimeError('source changed after registration')
 else:write(frozen,design)
 reg=sha(frozen);print('C35J preregistered',reg,flush=True)
 seen=[];start=time.monotonic()
 with ThreadPoolExecutor(max_workers=5) as ex:
  tasks={ex.submit(execute,c,reg):c for c in design['cases']}
  for f in as_completed(tasks):
   d=f.result();seen.append(d);print(f'{len(seen)}/36 {d["id"]} shots={d["shots"]} valid={d["validPublic"]}',flush=True)
 write(OUT/'EXECUTION-AUDIT.json',{'registrationSHA256':reg,'matches':sorted(seen,key=lambda d:d['id']),
  'elapsedWallSeconds':round(time.monotonic()-start,2)})
 subprocess.run([sys.executable,'scripts/analyze-c35j-3d-calibration.py'],cwd=ROOT,check=True)
