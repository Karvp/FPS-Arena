#!/usr/bin/env python3
"""Second C35-E cohort: independent seeded 120s matches; frozen model and source locked."""
from __future__ import annotations
import concurrent.futures,hashlib,json,subprocess,time,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/c35e/independent-18-holdout'
# Share the source lock with the preceding C35E pilot (no new model fitting).
BASE=ROOT/'reports/c35e/shadow-18-setup/FROZEN-DESIGN.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canon(o):return (json.dumps(o,indent=2,sort_keys=True)+'\n').encode()
def plan():
 parent=json.loads(BASE.read_text());guns=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'];maps=['arena','neon','foundry']
 cases=[]
 for mi,mp in enumerate(maps):
  for gi,gun in enumerate(guns):
   i=mi*6+gi
   cases.append({'id':f'c35e-hold-{i:02}-shadow80','setupId':f'c35e-hold-{i:02}',
    'seed':35481000+131*i,'map':mp,'gun':gun,'policy':'shadow80','seconds':120,
    'lagMs':[125,35,65][(gi+2*mi)%3],'opponents':['stress','official','mixed'][(gi+mi)%3],'bots':5})
 assert not {x['seed'] for x in cases}&{x['seed'] for x in parent['cases']}
 return {'schema':'fpsarena-c35e-independent-120s-holdout-v1',
  'historicalShadowPlanSHA256':sha(BASE),'sourceSHA256':parent['sourceSHA256'],
  'modelSHA256':parent['modelSHA256'],'stage':'SEALED_SOURCE_ZERO_MODEL_REFIT',
  'objective':'measure calibration among C16-eligible offers under frozen shadow-only actuator using newly selected seeds',
  'caveats':['not map-disjoint','not an efficacy test','sequential within-match dependence'],
  'cases':cases}
def run(c,reg):
 d=OUT/'matches';d.mkdir(parents=True,exist_ok=True)
 base=d/c['id'];ds=Path(str(base)+'.dataset.json');rs=Path(str(base)+'.result.json');log=Path(str(base)+'.log')
 if ds.exists() or rs.exists():raise RuntimeError('refusing overwrite: '+c['id'])
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
   '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
   '--bots','5','--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
   '--c35c-dataset',str(ds),'--c35c-policy','shadow80',
   '--c35c-setup-id',c['setupId'],'--c35c-enemy-primary',c['gun'],
   '--c35c-registration-sha',reg,'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--out',str(rs)]
 p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=240)
 log.write_text(p.stdout+'\n'+p.stderr)
 if p.returncode:raise RuntimeError(c['id']+': '+p.stderr[-2000:])
 m=json.loads(ds.read_text())['matches'][0];r=json.loads(rs.read_text())
 assert r['aggregate']['agentErrors']==0 and m['metadata']['policy']=='shadow80'
 return {'id':c['id'],'datasetSHA256':sha(ds),'resultSHA256':sha(rs),
  'preoffers':len(m['c35e']['rows']),'offers':len(m['offers'])}
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True);d=OUT/'FROZEN-DESIGN.json';locked=plan()
 if d.exists():assert json.loads(d.read_text())==locked
 else:d.write_bytes(canon(locked))
 reg=sha(d);print('sealed independent holdout',reg,flush=True)
 for fn,h in locked['sourceSHA256'].items():assert sha(ROOT/fn)==h,fn
 started=time.monotonic();rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  futs=[pool.submit(run,c,reg) for c in locked['cases']]
  for f in concurrent.futures.as_completed(futs):
   a=f.result();rows.append(a);print(f"{len(rows):02d}/18 {a['id']} {a['offers']} offers",flush=True)
 assert plan()==locked
 (OUT/'EXECUTION-AUDIT.json').write_bytes(canon({'registrationSHA256':reg,'matches':sorted(rows,key=lambda a:a['id']),
   'sourceImmutable':True,'elapsedWallSeconds':round(time.monotonic()-started,3)}))
 subprocess.run([sys.executable,'scripts/verify-c35e-heldout.py'],cwd=ROOT,check=True)
 print('DONE',round(time.monotonic()-started,3),flush=True)
