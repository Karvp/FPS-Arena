#!/usr/bin/env python3
"""C29 STOP/GO preregistered transfer pilot and larger 3-arm match evaluation.
A failure of transfer eligibility prevents efficacy claims. All seed units fixed
before observing their outputs. Re-running resumes only missing artifacts.
"""
import argparse,hashlib,json,subprocess,concurrent.futures,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'reports/c29/long-study';P.mkdir(parents=True,exist_ok=True)
POLICIES=['baseline','simple','neural']
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
MAPS=['arena','neon','foundry'];OPP=['stress','mixed','official'];LAGS=[35,65,125]
SOURCE=['lab/arena/train-main.mjs','lab/arena/research-policy-c29.mjs',
        'lab/arena/safe-action-explorer-c16.mjs','scripts/run-c29-research.py',
        'reports/c28/micro-v1/FROZEN-POLICY.json']
def sha(x):return hashlib.sha256(x).hexdigest()
source_hash=sha('|'.join(sha((ROOT/f).read_bytes()) for f in SOURCE).encode())
# Deterministic order, balanced enough for transfer-coverage audit; later efficacy
# phase uses a separate locked sequence never touched by the pilot.
PILOT=[]
for i in range(48):
  wi=i%6;mi=(i//6)%3;oi=(i//18)%3
  PILOT.append(dict(id=f'p{i:03}',seed=29000000+i*131,weapon=WEAPONS[wi],map=MAPS[mi],
   opponent=OPP[oi],lag=LAGS[(i//3)%3],seconds=105))
FULL=[]
for i in range(216):
 wi=i%6;mi=(i//6)%3;oi=(i//18)%3;li=(i//54)%3
 FULL.append(dict(id=f'e{i:03}',seed=29300000+i*151,weapon=WEAPONS[wi],map=MAPS[mi],
  opponent=OPP[oi],lag=LAGS[li],seconds=150))
plan=dict(schema='fpsarena-c29-long-gated-protocol-v1',sourceSHA256=source_hash,
 design='headless Game.step actual shots, identical game seed in 3 policy forks, no C28 micro-harness outcomes as match labels',
 modelSource='C28 frozen weights; no refit; public-facing input mapping is a domain-shift proxy',
 thresholds=dict(pilotMinimumMatchedSeeds=16,pilotMinimumOffers=50,minimumNeuralCoverage=.80,
  minimumFullMatchedSeeds=144,minimumFullExposedSeeds=36,alpha=.05,unit='entire independent game seed',
  primary='paired difference in kills minus deaths, neural vs best simple, 95% bootstrap lower bound >0',
  secondary=['damageTaken','kills','deaths','shots','hits','distance','errors','interventionTicks'],
  maxSafetyErrors=0,requiresBrowserRuntimeValidation=True,failedGateBlocksPromotion=True),
 pilot=PILOT,full=FULL,policies=POLICIES,
 noResultDependentSeedExpansion=True,
 warnings=['C28 features were generated in a scripted clear arena; source covariate support must be checked first',
 'pilot cannot be used to choose policy, tune safety thresholds, or train weights',
 'paired same-seed simulations may diverge after first policy action; outcomes are full-game conditional effects',
 'full headless match success alone never authorizes live production'])
plan['registrationSHA256']=sha(json.dumps(plan,sort_keys=True,separators=(',',':')).encode())
planfile=P/'PRE-REGISTERED-PLAN.json'
if planfile.exists():
 old=json.loads(planfile.read_text());assert old==plan,'Registered plan changed; choose new study ID'
else:planfile.write_text(json.dumps(plan,indent=2)+'\n')

def paths(row,policy):
 stem=f"{row['id']}.{policy}"
 return P/f'{stem}.run.json',P/f'{stem}.dataset.json'
def valid(row,policy):
 runp,datap=paths(row,policy)
 if not runp.exists() or not datap.exists():return False
 try:
  r=json.loads(runp.read_text());d=json.loads(datap.read_text())
  x=r['results'][0];m=d['matches'][0]
  assert len(r['results'])==len(d['matches'])==1
  assert x['seed']==m['metadata']['seed']==row['seed']
  assert x['mode']=='tdm' and x['opponentPolicy']==row['opponent']
  assert x['primaryLoadout']==row['weapon']
  assert r['snapshotLagMs']==row['lag']
  assert r['seconds']==row['seconds']
  assert x['c29']['policy']==m['metadata']['c29']['policy']==policy
  assert x['errors']==0 and m['metadata']['c29']['c28FrozenSourceSHA256']==r['results'][0]['c29']['modelSourceSHA256']
  return True
 except Exception:return False

def run_one(item):
 row,policy=item
 if valid(row,policy):return ('reused',row['id'],policy)
 dest,data=paths(row,policy)
 # Invalid output cannot be overwritten and silently washed out.
 if dest.exists() or data.exists():raise RuntimeError(f'incomplete or corrupt pair: {row["id"]} {policy}')
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--seconds',str(row['seconds']),
  '--episodes','1','--modes','tdm','--seed',str(row['seed']),'--classic-maps',row['map'],
  '--trainee-primary',row['weapon'],'--opponents',row['opponent'],'--lag-ms',str(row['lag']),
  '--c29-policy',policy,'--c29-dataset',str(data),'--out',str(dest)]
 proc=subprocess.run(cmd,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=140)
 if proc.returncode or not valid(row,policy):
  raise RuntimeError(f'{row["id"]} {policy} exit={proc.returncode} stdout={proc.stdout[-400:]} stderr={proc.stderr[-500:]}')
 return ('finished',row['id'],policy)

def summarize(rows,policies):
 out=[]
 for row in rows:
  for policy in policies:
   if not valid(row,policy):continue
   r=json.loads(paths(row,policy)[0].read_text())['results'][0]
   d=json.loads(paths(row,policy)[1].read_text())['matches'][0]
   stats=r['c29']['diagnostics'];counts=stats['selectedCounts']
   out.append(dict(id=row['id'],seed=row['seed'],policy=policy,map=row['map'],weapon=row['weapon'],opponent=row['opponent'],lag=row['lag'],
    kills=r['kills'],deaths=r['deaths'],damageTaken=r['damageTaken'],shots=r['shots'],hits=r['hits'],errors=r['errors'],
    offers=d['diagnostics']['eligibleOffers'],inferences=stats['inferenceCalls'],
    actionCount=sum(counts[x] for x in ['micro-left','micro-right']),
    fallbacks=stats['fallbacks'],interventionTicks=d['diagnostics']['interventionTicks']))
 return out

def main():
 p=argparse.ArgumentParser();p.add_argument('--stage',choices=['pilot','full','status'],default='pilot')
 p.add_argument('--limit',type=int,default=24);p.add_argument('--workers',type=int,default=4);a=p.parse_args()
 if a.limit<0 or a.workers<1 or a.workers>8:raise SystemExit('bad worker/limit')
 stageRows=plan['pilot'] if a.stage!='full' else plan['full'];policies=['neural'] if a.stage!='full' else POLICIES
 if a.stage=='full':
  s=summarize(PILOT,['neural']);matched=len(s);offers=sum(x['offers'] for x in s);covered=sum(x['actionCount'] for x in s)
  if matched<len(PILOT) or offers<plan['thresholds']['pilotMinimumOffers'] or covered/max(1,offers)<.8:
   raise SystemExit('TRANSFER GATE FAILED OR INCOMPLETE: do not run full efficacy study')
 todo=[(r,pol) for r in stageRows for pol in policies if not valid(r,pol)]
 if a.stage!='status':
  todo=todo[:a.limit]
  with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
   tasks=[pool.submit(run_one,item) for item in todo]
   for f in concurrent.futures.as_completed(tasks):print('C29',*f.result(),flush=True)
 records=summarize(stageRows,policies)
 offers=sum(x['offers'] for x in records if x['policy']=='neural')
 covered=sum(x['actionCount'] for x in records if x['policy']=='neural')
 summary=dict(schema='fpsarena-c29-transfer-gate-status-v1',registrationSHA256=plan['registrationSHA256'],
  stage=a.stage,succeeded=len(records),expected=len(stageRows)*len(policies),neuralEligibleOffers=offers,
  neuralActuatedOffers=covered,coverage=covered/max(1,offers),
  fallbackBreakdown={k:sum(x['fallbacks'].get(k,0) for x in records if x['policy']=='neural')
   for k in sorted({k for x in records if x['policy']=='neural' for k in x['fallbacks']})},
  transferGate='NOT EVALUABLE' if len(records)<16 or offers<50 else 'PASS' if covered/offers>=.8 else 'FAIL',
  fullEfficacyTrialComplete=a.stage=='full' and len(records)==len(stageRows)*len(policies),
  summaryPurpose='coverage pilot not causal efficacy; no production promotion')
 (P/'STATUS.json').write_text(json.dumps(summary,indent=2)+'\n')
 print(json.dumps(summary,indent=2))
if __name__=='__main__':main()
