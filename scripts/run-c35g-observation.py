#!/usr/bin/env python3
"""C35-G preregistered, nonoverwriting, paired Game.step passive fire/motor audit."""
import concurrent.futures,hashlib,json,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35g/heldout-12-pairs'
SOURCE=['lab/arena/train-main.mjs','lab/arena/firing-opportunity-observer-c35g.mjs',
 'lab/arena/opportunity-constrained-scheduler-c35f.mjs',
 'lab/arena/opportunity-preserving-shadow-c35e.mjs',
 'lab/arena/macro-micro-integration-c35c.mjs',
 'lab/arena/encounter-randomization-c21.mjs',
 'lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/source-main/server/game.js',
 'lab/arena/source-main/shared/weaponstate.js',
 'page-agent.js','reports/c35d2/FROZEN-FORECAST.json']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,x):p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def plan():
 guns=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
 cases=[]
 for mi,mp in enumerate(['neon','foundry']):
  for gi,gun in enumerate(guns):
   i=mi*6+gi
   setting={'setupId':f'c35g-{i:02}','seed':35610001+i*151,'map':mp,'gun':gun,
    'seconds':90,'lagMs':[35,65,125][(i+mi)%3],
    'opponents':['official','mixed','stress'][(i+gi)%3],'bots':5}
   for policy in ['shadow80','stagger80']:
    cases.append({'id':f'c35g-{i:02}-{policy}','policy':policy,**setting})
 return {'schema':'fpsarena-c35g-opportunity-audit-prereg-v1',
  'design':'12 matched setups, 24 independent original Game.step TDM simulations; no policy changes beyond inherited unchanged shadow80/stagger80',
  'notCausal':'matched seeds do not imply identical post-treatment world trajectories; readiness is only a capability proxy, not targeting opportunity',
  'endpoints':['incumbent fire commands / minute','server shots / minute','ready-proxy ticks / minute','fire input suppression/injection','motor-fire coexistence ticks','original-to-applied movement modifications'],
  'analysis':'paired match cluster resampling 5000 draws; no post-treatment conditioning; all ticks including waiting phase',
  'sourceSHA256':{x:sha(ROOT/x) for x in SOURCE},'cases':cases}
def run(c,reg):
 folder=OUT/'matches';folder.mkdir(parents=True,exist_ok=True)
 stem=folder/c['id']
 paths={k:Path(str(stem)+f'.{k}.json') for k in ('trace','dataset','result')}
 log=Path(str(stem)+'.log')
 if any(p.exists() for p in (*paths.values(),log)):raise RuntimeError('no overwrite '+c['id'])
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--classic-maps',c['map'],'--seconds',str(c['seconds']),'--seed',str(c['seed']),
  '--bots',str(c['bots']),'--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),
  '--c35c-dataset',str(paths['dataset']),'--c35c-policy',c['policy'],
  '--c35c-setup-id',c['setupId'],'--c35c-enemy-primary',c['gun'],
  '--c35c-registration-sha',reg,
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(paths['trace']),'--out',str(paths['result'])]
 try:
  r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=300)
 except Exception as e:
  log.write_text(str(e));raise
 log.write_text(r.stdout+'\n'+r.stderr)
 if r.returncode:raise RuntimeError(c['id']+': '+r.stderr[-1600:])
 t=json.loads(paths['trace'].read_text())['traces'][0]
 g=json.loads(paths['result'].read_text())
 d=json.loads(paths['dataset'].read_text())
 if g['aggregate']['agentErrors'] or t['counts']['serverShots']!=g['aggregate']['shots']:
  raise RuntimeError('shot/agent reconciliation '+c['id'])
 if d['matches'][0]['metadata']['policy']!=c['policy']:
  raise RuntimeError('incorrect policy '+c['id'])
 if t['counts']['fireSuppressionTicks'] or t['counts']['fireInjectionTicks']:
  raise RuntimeError('changed incumbent fire '+c['id'])
 return {'id':c['id'],'setupId':c['setupId'],'policy':c['policy'],
  'traceSHA256':sha(paths['trace']),'datasetSHA256':sha(paths['dataset']),
  'resultSHA256':sha(paths['result']),'serverShots':t['counts']['serverShots'],
  'ticks':t['counts']['totalTicks']}
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 x=plan();regfile=OUT/'FROZEN-DESIGN.json'
 if regfile.exists():
  if json.loads(regfile.read_text())!=x:raise RuntimeError('source/config drift')
 else:write(regfile,x)
 reg=sha(regfile); print('C35-G prereg SHA',reg,flush=True)
 started=time.monotonic();results=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  futs={pool.submit(run,c,reg):c for c in x['cases']}
  for f in concurrent.futures.as_completed(futs):
   r=f.result();results.append(r)
   print(f'{len(results)}/{len(x["cases"])} {r["id"]} {r["serverShots"]} shots',flush=True)
 write(OUT/'EXECUTION-AUDIT.json',{'registrationSHA256':reg,'sourceSHA256':x['sourceSHA256'],
  'results':sorted(results,key=lambda r:r['id']),'elapsedWallSeconds':round(time.monotonic()-started,2)})
 subprocess.run([sys.executable,'scripts/analyze-c35g-observation.py'],cwd=ROOT,check=True)
