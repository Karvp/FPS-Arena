#!/usr/bin/env python3
"""Frozen external holdout: C35P public confidence, no training on these matches."""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import os,json,subprocess,sys,time
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha
OUT=ROOT/'reports/c35p/new-seed-holdout-12'
HEAD=ROOT/'reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json'
FILES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/public-target-confidence-c35p.mjs','lab/arena/public-track-freshness-c35o.mjs','lab/arena/source-main/server/combat.js','lab/arena/source-main/server/abilities.js','lab/arena/source-main/server/game.js','scripts/c35p_confidence.py', 'scripts/run-c35p-prospective.py','reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json']
TYPES=('result','dataset','fire','macro','lane','calibration','identity','ballistic','track','confidence')
def registration():
 cases=[]
 for mi,mp in enumerate(('arena','neon','foundry')):
  for gi,gun in enumerate(('hk_sl8','uzi')):
   setup=f'c35p-{mi*2+gi:02d}';seed=91599521+(mi*2+gi)*7613
   for lag in (85,215):
    cases.append({'id':f'{setup}-lag{lag}','setupId':setup,'seed':seed,'map':mp,'gun':gun,'seconds':60,'lagMs':lag,'opponents':('official','mixed','stress')[(mi+gi)%3],'bots':5})
 return {'schema':'fpsarena-c35p-external-prospective-holdout-v1','status':'FROZEN BEFORE EXECUTION',
  'purpose':'External new seeds and unseen weapons hk_sl8/uzi; score frozen prediction only, no retraining or aim/motor intervention',
  'heads':['hasPlayerHit','aimCandidateCorrectConditionalOnHit'],
  'labels':'Shot miss target ID UNKNOWN; ambiguity 50/50 pellet majority unscored',
  'plan':'Six independently seeded setups, each at lag85 and lag215, same starting conditions within pair',
  'sourceSHA256':{p:sha(ROOT/p) for p in FILES},'cases':cases,'noPromotion':True}
def execute(c,reg):
 p=OUT/'matches'/c['id'];p.parent.mkdir(parents=True,exist_ok=True)
 fs={k:Path(str(p)+f'.{k}.json') for k in TYPES}
 existing=[f.exists() for f in fs.values()]
 if any(existing):
  if not all(existing):raise RuntimeError('Partial match files '+c['id'])
  return {'id':c['id'],'reused':True,'SHA256':{k:sha(f) for k,f in fs.items()}}
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
 '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],
 '--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],
 '--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
 '--c35c-dataset',str(fs['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
 '--c35g-trace',str(fs['fire']),'--c35h-trace',str(fs['macro']),'--c35h-policy','observe',
 '--c35i-trace',str(fs['lane']),'--c35j-trace',str(fs['calibration']),
 '--c35k-trace',str(fs['identity']),'--c35l-trace',str(fs['ballistic']),
 '--c35o-trace',str(fs['track']),'--c35p-trace',str(fs['confidence']),'--out',str(fs['result'])]
 env=dict(os.environ);env['TERM']='xterm'
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=300,env=env)
 Path(str(p)+'.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode or not all(f.exists() for f in fs.values()):raise RuntimeError(f'{c["id"]}: exit={r.returncode} {r.stderr[-1600:]}')
 return {'id':c['id'],'reused':False,'SHA256':{k:sha(f) for k,f in fs.items()}}
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 f=OUT/'FROZEN-DESIGN.json';d=registration()
 if f.exists():
  if load(f)!=d:raise RuntimeError('Frozen design/source changed: invalid reproducibility')
 else:dump(f,d)
 reg=sha(f);print('FROZEN REGISTRATION SHA256',reg,flush=True)
 t0=time.time();done=[]
 with ThreadPoolExecutor(max_workers=int(os.environ.get('C35P_WORKERS','4'))) as pool:
  futures=[pool.submit(execute,c,reg) for c in d['cases']]
  for future in as_completed(futures):
   x=future.result();done.append(x);print(f'{len(done)}/{len(d["cases"])} {x["id"]}',flush=True)
 dump(OUT/'EXECUTION-AUDIT.json',{'registrationSHA256':reg,'elapsedWallSeconds':time.time()-t0,'matches':sorted(done,key=lambda x:x['id'])})
 print('COMPLETED',len(done),'matches',flush=True)
if __name__=='__main__':main()
