#!/usr/bin/env python3
"""C35-O pre-registered cross-randomized lag within map/gun/seed setups."""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import subprocess,sys,time,os,json
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha,analyze
OUT=ROOT/'reports/c35o/paired-latency-48'
LAGS=(30,85,150,215)
HASHED=['page-agent.js','lab/arena/train-main.mjs','lab/arena/public-track-freshness-c35o.mjs','lab/arena/public-target-los-c35k.mjs','lab/arena/ballistic-truth-c35l.mjs','lab/arena/source-main/server/combat.js','lab/arena/source-main/server/game.js','lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs','reports/c35d2/FROZEN-FORECAST.json','scripts/c35o_freshness_analysis.py','scripts/run-c35o-paired-latency.py']
TYPES=('result','dataset','fire','macro','lane','calibration','identity','ballistic','track')
def design():
 cases=[]
 for mi,mp in enumerate(('arena','neon','foundry')):
  for gi,gun in enumerate(('mp5sd','m4a1','aa12','l115a3')):
   i=mi*4+gi;setup=f'c35o-{i:02d}';seed=91503011+i*6733
   for lag in LAGS:
    cases.append({'id':f'{setup}-lag{lag}','setupId':setup,'seed':seed,'map':mp,'gun':gun,'seconds':60,'lagMs':lag,
     'opponents':('official','mixed','stress')[(i+gi)%3],'bots':5,'motorPolicy':'shadow80','observers':'passive'})
 return {'schema':'fpsarena-c35o-paired-latency-factorial-v1','status':'FROZEN BEFORE EXECUTION',
  'objective':'Isolate lag-related target candidate coverage across four latencies in the same initial seed/map/gun/opponent setup',
  'primary':'paired 350ms-minus-200ms pre-decision eligible-candidate coverage at simulated 215ms lag',
  'secondary':'player-hit-conditional aim ID agreement & CV projection availability, bootstrap clustered by 12 setups',
  'baseline':'all games same production page-agent + shadow80, observers cannot actuate',
  'noPromotion':True,'noServerTruthToActor':True,'cases':cases,'sourceSHA256':{s:sha(ROOT/s) for s in HASHED}}
def execute(c,reg):
 p=OUT/'matches'/c['id'];p.parent.mkdir(parents=True,exist_ok=True)
 fs={k:Path(str(p)+f'.{k}.json') for k in TYPES}
 existing=[f.is_file() for f in fs.values()]
 if any(existing):
  if not all(existing):raise RuntimeError('partial dataset '+c['id'])
  return {'id':c['id'],'reused':True,'SHA256':{k:sha(f) for k,f in fs.items()}}
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
  '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],
  '--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],
  '--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
  '--c35c-dataset',str(fs['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(fs['fire']),'--c35h-trace',str(fs['macro']),'--c35h-policy','observe',
  '--c35i-trace',str(fs['lane']),'--c35j-trace',str(fs['calibration']),'--c35k-trace',str(fs['identity']),
  '--c35l-trace',str(fs['ballistic']),'--c35o-trace',str(fs['track']),'--out',str(fs['result'])]
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=300)
 Path(str(p)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode:raise RuntimeError(f'{c["id"]} failed {r.returncode}: {r.stderr[-1800:]}')
 if not all(f.is_file() for f in fs.values()):raise RuntimeError('Missing dataset '+c['id'])
 return {'id':c['id'],'reused':False,'SHA256':{k:sha(f) for k,f in fs.items()}}
def main():
 OUT.mkdir(parents=True,exist_ok=True);f=OUT/'FROZEN-DESIGN.json';d=design()
 if f.exists():
  if load(f)!=d:raise RuntimeError('FROZEN SOURCE or registration mismatch')
 else:dump(f,d)
 reg=sha(f);print('REGISTRATION',reg,flush=True)
 t0=time.monotonic();done=[]
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35O_WORKERS','5'))) as pool:
  futures=[pool.submit(execute,c,reg) for c in d['cases']]
  for future in as_completed(futures):
   x=future.result();done.append(x);print(f'{len(done)}/{len(d["cases"])} {x["id"]}',flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',{'registrationSHA256':reg,'elapsedWallSeconds':round(time.monotonic()-t0,3),'matches':sorted(done,key=lambda x:x['id'])})
 result=analyze(OUT)
 print('OVERALL',json.dumps(result['overall'],indent=2),flush=True)
 print('BY_LAG',json.dumps(result['byLag'],indent=2),flush=True)
if __name__=='__main__':main()
