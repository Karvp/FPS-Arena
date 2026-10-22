#!/usr/bin/env python3
"""Frozen new-seed C35-N TDM cohort; gameplay controls unchanged."""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import subprocess,sys,time,json
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35n_shot_outcome import sha,load,dump,analyze
OUT=ROOT/'reports/c35n/new-seed-18'
SOURCES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/ballistic-truth-c35l.mjs','lab/arena/public-target-los-c35k.mjs','lab/arena/source-main/server/combat.js','lab/arena/source-main/server/game.js','lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs','scripts/c35n_shot_outcome.py']
def design():
 cases=[]
 for mi,mp in enumerate(['arena','neon','foundry']):
  for gi,gun in enumerate(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']):
   i=mi*6+gi
   cases.append({'id':f'c35n-{i:02d}-observe','setupId':f'c35n-{i:02d}','seed':73142021+i*7919,'map':mp,'gun':gun,'seconds':60,'lagMs':[30,85,150,215][(i+mi)%4],'opponents':['official','mixed','stress'][(i+gi)%3],'bots':5,'policy':'shadow80'})
 return {'schema':'fpsarena-c35n-frozen-new-seed-v1','objective':'Record all shot outcomes, misses, static/dynamic cover and latency, without policy changes','exclusions':'No completed shots excluded; misses have unknown identity','unit':'shot; clustered by match','cases':cases,'sourceSHA256':{s:sha(ROOT/s) for s in SOURCES}}
def execute(c,reg):
 p=OUT/'matches'/c['id'];p.parent.mkdir(parents=True,exist_ok=True)
 ks=['result','dataset','fire','macro','lane','calibration','identity','ballistic']
 fs={k:Path(str(p)+f'.{k}.json') for k in ks}
 present=[v.is_file() for v in fs.values()]
 if any(present):
  if not all(present):raise RuntimeError('Partial case: '+c['id'])
  return {'match':c['id'],'hashes':{k:sha(v) for k,v in fs.items()},'reused':True}
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],'--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,'--c35c-dataset',str(fs['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--c35g-trace',str(fs['fire']),'--c35h-trace',str(fs['macro']),'--c35h-policy','observe','--c35i-trace',str(fs['lane']),'--c35j-trace',str(fs['calibration']),'--c35k-trace',str(fs['identity']),'--c35l-trace',str(fs['ballistic']),'--out',str(fs['result'])]
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=300)
 Path(str(p)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode:raise RuntimeError(f"{c['id']} failed: {r.stderr[-1500:]}")
 if not all(v.is_file() for v in fs.values()):raise RuntimeError('Missing outputs '+c['id'])
 return {'match':c['id'],'hashes':{k:sha(v) for k,v in fs.items()},'reused':False}
def run():
 OUT.mkdir(parents=True,exist_ok=True);f=OUT/'FROZEN-DESIGN.json';d=design()
 if f.is_file():
  if load(f)!=d:raise RuntimeError('Source/design mismatch with preregistration')
 else:dump(f,d)
 reg=sha(f);print('FROZEN',reg,flush=True);results=[];t=time.monotonic()
 with ThreadPoolExecutor(max_workers=5) as pool:
  fs=[pool.submit(execute,c,reg) for c in d['cases']]
  for fut in as_completed(fs):
   item=fut.result();results.append(item);print(f"{len(results)}/18 {item['match']}",flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',{'registrationSHA256':reg,'wallSeconds':round(time.monotonic()-t,3),'cases':sorted(results,key=lambda x:x['match'])})
 print('RESULT',json.dumps(analyze(OUT)['overall'],indent=2),flush=True)
if __name__=='__main__':run()
