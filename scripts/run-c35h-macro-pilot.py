#!/usr/bin/env python3
"""C35-H frozen prospective paired real Game.step experiment. Never overwrite runs."""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import hashlib,json,subprocess,sys,time
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35h/pilot-18-pairs'
SRC=['lab/arena/train-main.mjs','lab/arena/firing-compatible-macro-c35h.mjs',
 'lab/arena/firing-opportunity-observer-c35g.mjs','lab/arena/opportunity-preserving-shadow-c35e.mjs',
 'lab/arena/macro-micro-integration-c35c.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/source-main/server/game.js',
 'page-agent.js','reports/c35d2/FROZEN-FORECAST.json']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2,sort_keys=True)+'\n')
def create_plan():
 cases=[]
 for mi,m in enumerate(['arena','neon','foundry']):
  for wi,gun in enumerate(['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']):
   i=6*mi+wi
   attrs={'setupId':f'c35h-{i:02d}','seed':35930011+i*127,'map':m,'gun':gun,
    'seconds':90,'lagMs':[35,65,125][(i+mi)%3],
    'opponents':['official','mixed','stress'][(i+wi)%3],'bots':5}
   for policy in ('observe','lateral'):
    cases.append({**attrs,'policy':policy,'id':f'c35h-{i:02d}-{policy}'})
 return {'schema':'fpsarena-c35h-frozen-fire-compatible-macro-design-v1',
  'date':'2026-10-13','nSetups':18,'cases':cases,
  'parent':'C35G','intervention':'When original fire+forward with no conflicting macro controls, public target <=200ms old and symmetric public geometry clear, append left/right for up to 3 ticks; <=1 initiation per 0.5s; preserve all fire/aim fields',
  'primary':'server-confirmed shots per total randomization setup minute: reject promotion if 5th percentile of paired cluster bootstrap ratio <0.95',
  'secondary':['delivered C21 micro ticks per full preoffer population','agent original fire input ticks','damage/hits and K/D descriptive only','C35H macro movement exposure and C35G suppressed fire inputs'],
  'noPeeking':'true weapon state available only to post-action C35G auditor, not C35H; no outcomes input to policy',
  'safety':'C16 C21 unchanged, fire input never touched, static public bilateral clearance; macro/fire guard distinct from C16 micro gate',
  'doNotPromote':'no source patch into page-agent.js; no C36; 18 setup cluster count insufficient for strong gameplay claims',
  'sourceSHA256':{s:sha(ROOT/s) for s in SRC}}
def run(case,reg):
 stem=OUT/'matches'/case['id'];stem.parent.mkdir(parents=True,exist_ok=True)
 paths={k:Path(str(stem)+f'.{k}.json') for k in ('macro','fire','dataset','result')}
 log=Path(str(stem)+'.log')
 if any(p.exists() for p in [*paths.values(),log]):
  raise RuntimeError('no-overwrite: '+case['id'])
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
  '--classic-maps',case['map'],'--seconds',str(case['seconds']),'--seed',str(case['seed']),
  '--bots',str(case['bots']),'--opponents',case['opponents'],'--lag-ms',str(case['lagMs']),
  '--c35c-dataset',str(paths['dataset']),'--c35c-policy','shadow80',
  '--c35c-setup-id',case['setupId'],'--c35c-enemy-primary',case['gun'],
  '--c35c-registration-sha',reg,'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(paths['fire']),'--c35h-trace',str(paths['macro']),
  '--c35h-policy',case['policy'],'--out',str(paths['result'])]
 try: p=subprocess.run(args,cwd=ROOT,text=True,capture_output=True,timeout=240)
 except Exception as e:log.write_text(str(e));raise
 log.write_text(p.stdout+'\n'+p.stderr)
 if p.returncode:raise RuntimeError(case['id']+': '+p.stderr[-1600:])
 a=json.loads(paths['macro'].read_text())['traces'][0]
 b=json.loads(paths['fire'].read_text())['traces'][0]
 r=json.loads(paths['result'].read_text())
 if r['aggregate']['agentErrors'] or b['counts']['fireSuppressionTicks'] or b['counts']['fireInjectionTicks'] or b['counts']['serverShots']!=r['aggregate']['shots'] or a['counts']['otherControlsModified']:
  raise RuntimeError('C35H safety/shot mismatch '+case['id'])
 return {'id':case['id'],'counts':a['counts'],'shots':r['aggregate']['shots'],
  'sha':{k:sha(v) for k,v in paths.items()}}
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 plan=create_plan();pf=OUT/'FROZEN-DESIGN.json'
 if pf.exists():
  if json.loads(pf.read_text())!=plan:raise RuntimeError('source/prereg drift; never rewrite')
 else:write(pf,plan)
 reg=sha(pf);print('C35H FROZEN DESIGN SHA',reg,flush=True)
 t=time.monotonic();res=[]
 with ThreadPoolExecutor(max_workers=5) as pool:
  futures={pool.submit(run,c,reg):c for c in plan['cases']}
  for f in as_completed(futures):
   v=f.result();res.append(v);print(f'{len(res)}/{len(plan["cases"])} {v["id"]} shots={v["shots"]} macroTicks={v["counts"]["modifiedTicks"]}',flush=True)
 write(OUT/'EXECUTION-AUDIT.json',{'schema':'fpsarena-c35h-execution-audit-v1','registrationSHA256':reg,
  'files':sorted(res,key=lambda v:v['id']),'elapsedWallSeconds':round(time.monotonic()-t,1)})
 subprocess.run([sys.executable,'scripts/analyze-c35h-macro-pilot.py'],cwd=ROOT,check=True)
