#!/usr/bin/env python3
"""Frozen exploratory C35-C3 technical feasibility pilot: actual Game.step().
Not a confirmatory efficacy trial. Generates a sealed plan before first outcome.
"""
from __future__ import annotations
import concurrent.futures,hashlib,json,subprocess,sys,time,os
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
DEST=BASE/'reports'/'c35c3'/'exploratory-18-pair'
SOURCE_FILES=['page-agent.js','lab/arena/train-main.mjs','lab/arena/macro-micro-integration-c35c.mjs',
 'lab/arena/micro-action-reliability-c35b.mjs','lab/arena/randomized-safe-action-c35.mjs',
 'lab/arena/encounter-randomization-c21.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/c35c-option-arbitration.mjs','lab/arena/source-main/server/game.js',
 'lab/arena/source-main/server/bot.js']
SEED_BASE=35393000

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canonical(obj):return (json.dumps(obj,sort_keys=True,indent=2)+'\n').encode()
def make_plan():
 maps=['arena','neon','foundry']
 guns=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
 cases=[]
 for mi,mp in enumerate(maps):
  for wi,gun in enumerate(guns):
   index=mi*6+wi
   setup_id=f'c35c3-{index:02}'
   seed=SEED_BASE+index*101
   lag=[35,65,125][(wi+mi)%3]
   policy=['official','mixed','stress'][(wi+2*mi)%3]
   for arm in ('legacy80','hierarchical80'):
    cases.append({'setupId':setup_id,'map':mp,'enemyPrimary':gun,'seed':seed,
      'lagMs':lag,'opponents':policy,'policy':arm,'seconds':90,'bots':5})
 return {'schema':'fpsarena-c35c3-exploratory-registration-v1','status':'FROZEN_TECHNICAL_PILOT_NOT_CONFIRMATORY',
  'hypothesis':'public prospective quiet-time option arbitration can improve micro delivery without unacceptable loss of opportunity',
  'simulation':'authoritative headless Game.step TDM; no altered weapon stats, macro fire or C16/C21',
  'sourceSHA256':{p:sha(BASE/p) for p in SOURCE_FILES},
  'parentC35BArchiveSHA256':'50039be4efca0e4d081600675d50abfb0dde7e44a48db2bb26af361fc782a6de',
  'design':{'setups':18,'matches':36,'durationEachMaxSeconds':90,'maps':maps,'weapons':guns,
    'primaryEndpoints':['interruptionsPerMicro','microAssignedPerAttempt','executedTicksPerAttempt'],
    'secondaryEndpoints':['hostileHitPositiveComplete','shotsFired','hits','kills','deaths','damageTaken','meters'],
    'analysisUnit':'matched simulator setup, descriptive only','unknownThreatBin':'unknown',
    'noPosthocFiltering':True,'phase':'exploratory engineering pilot'},'cases':cases}

def validate_source(plan):
 for p,expected in plan['sourceSHA256'].items():
  if sha(BASE/p)!=expected:raise RuntimeError('FROZEN SOURCE MODIFIED '+p)

def run_case(item):
 arm=item['policy'];sid=item['setupId'];case=f'{sid}-{arm}'
 folder=DEST/'matches';folder.mkdir(parents=True,exist_ok=True)
 data=folder/(case+'.dataset.json');res=folder/(case+'.result.json');log=folder/(case+'.log')
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm',
      '--classic-maps',item['map'],'--seconds',str(item['seconds']),'--seed',str(item['seed']),
      '--bots',str(item['bots']),'--opponents',item['opponents'],'--lag-ms',str(item['lagMs']),
      '--c35c-dataset',str(data),'--c35c-policy',arm,'--c35c-setup-id',sid,
      '--c35c-enemy-primary',item['enemyPrimary'],'--c35c-registration-sha',PLAN_SHA,
      '--out',str(res)]
 completed=subprocess.run(cmd,cwd=BASE,text=True,capture_output=True,timeout=100)
 log.write_text(completed.stdout+'\n'+completed.stderr)
 if completed.returncode:raise RuntimeError(f'{case} FAIL {completed.stderr[-1100:]}')
 d=json.loads(data.read_text());r=json.loads(res.read_text())
 if len(d['matches'])!=1 or d['matches'][0]['schema']!='fpsarena-c35c-integrated-prospective-match-v1':
  raise RuntimeError(case+' dataset shape')
 if r['aggregate']['agentErrors']!=0:raise RuntimeError(case+' agent errors')
 return {'case':case,'dataSHA256':sha(data),'resultSHA256':sha(res),
         'offers':len(d['matches'][0]['offers']),
         'preoffers':len(d['matches'][0]['c35c']['preoffers']),
         'errorCount':r['aggregate']['agentErrors']}

if __name__=='__main__':
 DEST.mkdir(parents=True,exist_ok=True)
 fp=DEST/'PRE-REGISTERED-PLAN.json'
 if fp.exists():
  plan=json.loads(fp.read_text());expected=make_plan()
  if plan!=expected:raise RuntimeError('frozen registration differs from source/config: ABORT')
 else:
  plan=make_plan();fp.write_bytes(canonical(plan))
 PLAN_SHA=sha(fp)
 validate_source(plan)
 (DEST/'REGISTRATION-SHA256.txt').write_text(PLAN_SHA+'\n')
 print('FROZEN registration:',PLAN_SHA,flush=True)
 print('running',len(plan['cases']),'engine matches with worker pool',flush=True)
 started=time.monotonic();out=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  futures={pool.submit(run_case,c):c for c in plan['cases']}
  for f in concurrent.futures.as_completed(futures):
   try: result=f.result()
   except BaseException as exc:
    for future in futures:future.cancel()
    raise
   out.append(result)
   print(f"[{len(out)}/{len(plan['cases'])}] {result['case']} offers={result['offers']}",flush=True)
 validate_source(plan)
 summary={'registrationSHA256':PLAN_SHA,'wallSeconds':round(time.monotonic()-started,2),
 'matchesCompleted':len(out),'matches':sorted(out,key=lambda v:v['case'])}
 (DEST/'EXECUTION-ATTESTATION.json').write_bytes(canonical(summary))
 print('completed, wall:',summary['wallSeconds'],flush=True)
