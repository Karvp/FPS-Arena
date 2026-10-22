#!/usr/bin/env python3
"""C35-E pre-registered shadow-only real-engine evaluation using historical matched C35-D2 legacy setups."""
from __future__ import annotations
import concurrent.futures,hashlib,json,subprocess,time,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'reports/c35e/shadow-18-setup'
PARENT=ROOT/'reports/c35d2/predictive-18-pair/FROZEN-DESIGN.json'
SOURCES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/macro-micro-integration-c35c.mjs',
'lab/arena/opportunity-preserving-shadow-c35e.mjs','lab/arena/c35c-option-arbitration.mjs',
'lab/arena/macro-forecast-policy-c35d.mjs','lab/arena/public-macro-transition-c35d.mjs',
'lab/arena/micro-action-reliability-c35b.mjs','lab/arena/randomized-safe-action-c35.mjs',
'lab/arena/safe-action-explorer-c16.mjs','lab/arena/encounter-randomization-c21.mjs',
'lab/arena/source-main/server/game.js','lab/arena/source-main/server/bot.js',
'reports/c35d2/FROZEN-FORECAST.json']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canon(d):return (json.dumps(d,sort_keys=True,indent=2)+'\n').encode()
def plan():
 original=json.loads(PARENT.read_text()); legacy=[c for c in original['cases'] if c['policy']=='legacy80']
 assert len(legacy)==18 and len({c['setupId'] for c in legacy})==18
 cases=[{**x,'id':x['id'].replace('legacy80','shadow80'),'policy':'shadow80'} for x in legacy]
 return {'schema':'fpsarena-c35e-registered-shadow-observation-v1',
  'stage':'SHADOW_ONLY_NO_MOTOR_PROMOTION',
  'hypothesis':'C35-D2 predictor should be measured among C16-eligible preoffers without deleting an opportunity',
  'source':'real authoritative Game.step, source-locked, 18 historical matched setups x 90 s',
  'historicalDesignSHA256':sha(PARENT),
  'sourceSHA256':{p:sha(ROOT/p) for p in SOURCES},
  'precommittedEndpoints':['totalDeliveredMicroTicksPerPreoffer','shots','kills','C21AssignmentParity',
   'C16EligibleForecastBrier','C16EligibleLowRiskObservedRate','preofferRefusalReasons',
   'futurePublicCommandPriorityWithin120ms','rightCensoredWindows'],
  'modelSHA256':sha(ROOT/'reports/c35d2/FROZEN-FORECAST.json'),
  'cases':cases}
def run(c,reg):
 d=DEST/'matches';d.mkdir(parents=True,exist_ok=True)
 ds=d/(c['id']+'.dataset.json');rs=d/(c['id']+'.result.json');log=d/(c['id']+'.log')
 if ds.exists() and rs.exists():
  # Explicit --resume semantics are handled by verifier later, never blindly trust stale files.
  if not RESUME:raise RuntimeError('output exists, specify --resume: '+c['id'])
  obj=json.loads(ds.read_text());assert obj.get('registrationSHA256')==reg
  return {'id':c['id'],'datasetSHA256':sha(ds),'resultSHA256':sha(rs),'offers':len(obj['matches'][0]['offers']),
    'preoffers':len(obj['matches'][0]['c35e']['rows']),'errors':json.loads(rs.read_text())['aggregate']['agentErrors']}
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
      '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
      '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
      '--c35c-dataset',str(ds),'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
      '--c35c-enemy-primary',c['gun'],'--c35c-registration-sha',reg,
      '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--out',str(rs)]
 p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=180)
 log.write_text(p.stdout+'\n'+p.stderr)
 if p.returncode:raise RuntimeError(c['id']+': '+p.stderr[-1500:])
 obj=json.loads(ds.read_text());metrics=json.loads(rs.read_text());m=obj['matches'][0]
 if metrics['aggregate']['agentErrors'] or m['metadata']['policy']!='shadow80':raise RuntimeError('bad run: '+c['id'])
 return {'id':c['id'],'datasetSHA256':sha(ds),'resultSHA256':sha(rs),'offers':len(m['offers']),
         'preoffers':len(m['c35e']['rows']),'errors':metrics['aggregate']['agentErrors']}
if __name__=='__main__':
 RESUME='--resume' in sys.argv
 DEST.mkdir(parents=True,exist_ok=True);fp=DEST/'FROZEN-DESIGN.json';locked=plan()
 if fp.exists():
  if json.loads(fp.read_text())!=locked:raise RuntimeError('source or design differs from locked design')
 else:fp.write_bytes(canon(locked))
 reg=sha(fp);print('locked registration',reg,flush=True)
 started=time.monotonic();rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  futures={pool.submit(run,c,reg):c for c in locked['cases']}
  for f in concurrent.futures.as_completed(futures):
   v=f.result();rows.append(v);print(f"{len(rows):02d}/18 {v['id']} offers={v['offers']} preoffers={v['preoffers']}",flush=True)
 if plan()!=locked:raise RuntimeError('source modified during execution')
 (DEST/'EXECUTION-AUDIT.json').write_bytes(canon({'schema':'fpsarena-c35e-execution-audit-v1',
  'registrationSHA256':reg,'sourceImmutable':True,'durationWallSec':round(time.monotonic()-started,3),
  'matches':sorted(rows,key=lambda v:v['id'])}))
 subprocess.run([sys.executable,'scripts/verify-c35e-shadow.py'],cwd=ROOT,check=True)
 print('DONE',round(time.monotonic()-started,3),'seconds',flush=True)
