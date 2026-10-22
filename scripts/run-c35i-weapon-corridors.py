#!/usr/bin/env python3
"""Frozen C35-I paired live-engine experiment, including opponent, seed, and player gun.
Independent multi-cohort run; never overwrites a match. Output is exploratory.
"""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import hashlib,json,subprocess,sys,time
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35i/pilot-18-weapon-pairs'
SOURCES=['lab/arena/train-main.mjs','lab/arena/public-firing-corridor-c35i.mjs',
 'lab/arena/firing-compatible-macro-c35h.mjs','lab/arena/firing-opportunity-observer-c35g.mjs',
 'lab/arena/safe-action-explorer-c16.mjs','lab/arena/encounter-randomization-c21.mjs',
 'lab/arena/source-main/server/game.js','lab/arena/source-main/shared/weapons.js',
 'page-agent.js','reports/c35d2/FROZEN-FORECAST.json']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,sort_keys=True,indent=2)+'\n')
def plan():
 cases=[]
 for mi,m in enumerate(['arena','neon','foundry']):
  for wi,gun in enumerate(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']):
   i=6*mi+wi
   base={'setupId':f'c35i-{i:02d}','seed':35990011+i*137,'map':m,'gun':gun,
         'seconds':60,'lagMs':[35,65,125][(i+mi)%3],
         'opponents':['official','mixed','stress'][(i+wi)%3],'bots':5}
   for policy in ('observe','lateral'):cases.append({**base,'policy':policy,'id':f'c35i-{i:02d}-{policy}'})
 return {'schema':'fpsarena-c35i-frozen-weapon-corridors-preregister-v1',
  'date':'2026-10-13','nSetups':18,'cases':cases,
  'parent':'C35H',
  'manipulation':'C35H observe/lateral unchanged, C35I passive observer on BOTH arms, C21 shadow80 unchanged',
  'primary':'Integrity: firing command untouched, C21 hash matches, sampled gun and public quality before Game.step, matched setup cluster shot ratio',
  'secondary':['per-weapon fire+movement rate','sparsity of C35H macro initiation','public footprint-lane quality distribution','server hits/shots descriptive only'],
  'status':'observational measurement and replication only; no policy promotion',
  'sampling':'every incumbent fire tick (not every sixth GAME tick)',
  'provenance':'player weapon public client state, nearest delayed target, public static boxes; post-step server labels separated',
  'sourceSHA256':{s:sha(ROOT/s) for s in SOURCES}}
def run(c,reg):
 pre=OUT/'matches'/c['id'];pre.parent.mkdir(parents=True,exist_ok=True)
 files={kind:Path(f'{pre}.{kind}.json') for kind in ['result','dataset','fire','macro','lane']}
 log=Path(f'{pre}.log')
 if any(x.exists() for x in [*files.values(),log]):raise RuntimeError('NO OVERWRITE '+c['id'])
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
  '--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],
  '--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],
  '--c35c-registration-sha',reg,'--c35c-dataset',str(files['dataset']),
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(files['fire']),'--c35h-trace',str(files['macro']),
  '--c35h-policy',c['policy'],'--c35i-trace',str(files['lane']),'--out',str(files['result'])]
 try:p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=240)
 except Exception as e:log.write_text(str(e));raise
 log.write_text(p.stdout+'\n'+p.stderr)
 if p.returncode:raise RuntimeError(c['id']+' '+p.stderr[-900:])
 result=json.loads(files['result'].read_text())
 lane=json.loads(files['lane'].read_text())['traces'][0]
 fire=json.loads(files['fire'].read_text())['traces'][0]
 if (result['aggregate']['agentErrors'] or lane['counts']['suppressed'] or lane['counts']['injected'] or
  lane['counts']['sampledFire']!=fire['counts']['incumbentFireTicks'] or
  lane['counts']['appliedFire']!=fire['counts']['appliedFireTicks'] or
  lane['counts']['sampledServerShots']!=result['aggregate']['shots']):
  raise RuntimeError('C35I realtime integrity FAILURE '+c['id'])
 return {'id':c['id'],'shots':result['aggregate']['shots'],'rows':lane['counts']['sampledFire'],
  'sha':{k:sha(v) for k,v in files.items()}}
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True);design=plan();prereg=OUT/'FROZEN-DESIGN.json'
 if prereg.exists():
  if json.loads(prereg.read_text())!=design:raise RuntimeError('FROZEN design source drift')
 else:write(prereg,design)
 reg=sha(prereg);print('C35I FROZEN SHA',reg,flush=True)
 out=[];start=time.monotonic()
 with ThreadPoolExecutor(max_workers=5) as ex:
  tasks={ex.submit(run,c,reg):c for c in design['cases']}
  for f in as_completed(tasks):
   v=f.result();out.append(v);print(f'{len(out)}/{len(design["cases"])} {v["id"]}: shots={v["shots"]}, laneRows={v["rows"]}',flush=True)
 write(OUT/'EXECUTION-AUDIT.json',{'schema':'fpsarena-c35i-execution-v1','registrationSHA256':reg,
  'files':sorted(out,key=lambda r:r['id']),'elapsedWallSeconds':round(time.monotonic()-start,1)})
 subprocess.run([sys.executable,'scripts/analyze-c35i-weapon-corridors.py'],cwd=ROOT,check=True)
