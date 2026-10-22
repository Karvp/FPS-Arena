#!/usr/bin/env python3
"""Locked C35D2 actual Game.step technical pilot; NEVER a claim of combat efficacy."""
from __future__ import annotations
import concurrent.futures,hashlib,json,subprocess,time,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'reports/c35d2/predictive-18-pair'
SOURCES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/macro-micro-integration-c35c.mjs',
 'lab/arena/c35c-option-arbitration.mjs','lab/arena/public-macro-transition-c35d.mjs',
 'lab/arena/macro-forecast-policy-c35d.mjs','lab/arena/micro-action-reliability-c35b.mjs',
 'lab/arena/randomized-safe-action-c35.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/source-main/server/game.js',
 'lab/arena/source-main/server/bot.js','reports/c35d2/FROZEN-FORECAST.json']
MODEL='reports/c35d2/FROZEN-FORECAST.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canonical(x):return (json.dumps(x,sort_keys=True,indent=2)+'\n').encode()
def plan():
 guns=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'];maps=['arena','neon','foundry'];cases=[]
 for mi,mp in enumerate(maps):
  for gi,gun in enumerate(guns):
   i=mi*6+gi;seed=35393000+i*101;lag=[35,65,125][(gi+mi)%3];op=['official','mixed','stress'][(gi+2*mi)%3]
   for arm in ('legacy80','predictive80'):
    cases.append(dict(id=f'c35d2-{i:02}-{arm}',setupId=f'c35d2-{i:02}',seed=seed,map=mp,
      gun=gun,policy=arm,seconds=90,lagMs=lag,opponents=op,bots=5))
 return {'schema':'fpsarena-c35d2-locked-exploratory-matched-design-v1',
  'experiment':'18 setups x two policies (legacy80, predictive80), 90s TDM, real Game.step',
  'pilotGoal':'compare overall exposure vs conditional interruption under frozen passive-forecast threshold 0.05',
  'stopPolicy':'no production promotion irrespective of unpowered hostile hit outcomes',
  'registeredEndpoints':['prospectivePreoffers','microAssignments','interruptedMicro',
   'executedTicksPerPreoffer','hitPositiveComplete','shots','kills'],
  'sourceSHA256':{p:sha(ROOT/p) for p in SOURCES},'cases':cases}
def run(c,hashcode):
 d=DEST/'matches';d.mkdir(parents=True,exist_ok=True)
 ds=d/(c['id']+'.dataset.json');rs=d/(c['id']+'.result.json');log=d/(c['id']+'.log')
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
      '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots','5',
      '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
      '--c35c-dataset',str(ds),'--c35c-policy',c['policy'],'--c35c-setup-id',c['setupId'],
      '--c35c-enemy-primary',c['gun'],'--c35c-registration-sha',hashcode,
      '--out',str(rs)]
 if c['policy']=='predictive80':cmd+=['--c35d-forecast-model',MODEL]
 p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=180)
 log.write_text(p.stdout+'\n'+p.stderr)
 if p.returncode:raise RuntimeError(c['id']+': '+p.stderr[-1500:])
 obj=json.loads(ds.read_text());metrics=json.loads(rs.read_text());m=obj['matches'][0]
 if metrics['aggregate']['agentErrors'] or m['metadata']['policy']!=c['policy']:raise RuntimeError('bad run: '+c['id'])
 return {'id':c['id'],'datasetSHA256':sha(ds),'resultSHA256':sha(rs),'offers':len(m['offers']),
         'preoffers':len(m['c35c']['preoffers']),'errors':metrics['aggregate']['agentErrors']}
if __name__=='__main__':
 DEST.mkdir(parents=True,exist_ok=True);filename=DEST/'FROZEN-DESIGN.json';locked=plan()
 if filename.exists():
  if json.loads(filename.read_text())!=locked:raise RuntimeError('source differs from frozen design')
 else:filename.write_bytes(canonical(locked))
 planSHA=sha(filename);print('registered sha',planSHA,flush=True)
 started=time.monotonic();rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  futures={pool.submit(run,c,planSHA):c for c in locked['cases']}
  for f in concurrent.futures.as_completed(futures):
   v=f.result();rows.append(v)
   print(f"{len(rows):02d}/36 {v['id']} offers {v['offers']}",flush=True)
 if plan()!=locked:raise RuntimeError('source modified during execution')
 (DEST/'EXECUTION-AUDIT.json').write_bytes(canonical({'schema':'fpsarena-c35d2-completed-exploratory-v1',
  'registrationSHA256':planSHA,'sourceImmutable':True,'durationWallSec':round(time.monotonic()-started,2),
  'matches':sorted(rows,key=lambda v:v['id'])}))
 subprocess.run([sys.executable,'scripts/verify-c35d2.py'],cwd=ROOT,check=True)
 print('DONE',round(time.monotonic()-started,2),'seconds',flush=True)
