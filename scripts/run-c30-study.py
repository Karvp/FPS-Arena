#!/usr/bin/env python3
"""C30 preregistered multi-stage transfer-and-game study. No production actions."""
import argparse,hashlib,json,subprocess,concurrent.futures,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/c30/study';OUT.mkdir(parents=True,exist_ok=True)
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']; MAPS=['arena','neon','foundry']
OPP=['stress','mixed','official']; LAG=[35,65,125];POLICIES=['baseline','simple','neural']
SRC=['lab/arena/train-main.mjs','lab/arena/research-policy-c30.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'lab/arena/counterfactual-fire-c30.mjs','scripts/run-c30-study.py','reports/c30/encounters/FROZEN-POLICY.json']
def sha(x):return hashlib.sha256(x).hexdigest()
source=sha('|'.join(sha((ROOT/x).read_bytes()) for x in SRC).encode())
def make(n,base,prefix,seconds=105):
 return [dict(id=f'{prefix}{i:03}',seed=base+i*173,
  map=MAPS[(i//6)%3],weapon=WEAPONS[i%6],opponent=OPP[(i//18)%3],
  lag=LAG[(i//3)%3],seconds=seconds) for i in range(n)]
PILOT=make(24,30100000,'p');FULL=make(36,30400000,'e')
model=json.loads((ROOT/'reports/c30/encounters/FROZEN-POLICY.json').read_text())
plan=dict(schema='fpsarena-c30-precommitted-study-v1',sourceSHA256=source,
 modelSHA256=sha((ROOT/'reports/c30/encounters/FROZEN-POLICY.json').read_bytes()),
 trainingRegistration=model['registrationSHA256'],
 validationWinner=model['preselectedPolicy'],
 pilot=PILOT,full=FULL,policies=POLICIES,
 limits=dict(minimumPilotGames=24,minimumPilotOffers=50,minTransferCoverage=.80,minActuationCoverage=.70,
  maxRuntimeErrors=0,requiresBrowserValidation=True,minimumPairedBlocks=36),
 primary='per-game paired difference in kills-deaths, neural vs validation-winning simple policy',
 secondary=['damageTaken','kills','deaths','shots','hits','distance','errors','interventionTicks'],
 report=['neural vs original baseline','neural vs simple','simple vs original baseline'],
 inferenceUnit='independent seed, never an offer or a shot',
 warnings=['C30 micro-harness omits obstacles and multiplayer tactics','neural LOST to always-left on development validation: efficacy experiment is research-only, NOT a deployment gate',
 'no tuning on the pilot or held-out full-match outcomes','same-seed simulator branches diverge after a policy action','no actual browser or human opponents'])
plan['registrationSHA256']=sha(json.dumps(plan,sort_keys=True,separators=(',',':')).encode())
path=OUT/'PRE-REGISTERED-PLAN.json'
if path.exists():
 if json.loads(path.read_text())!=plan:raise RuntimeError('Preregistered C30 study/source changed')
else:path.write_text(json.dumps(plan,indent=2)+'\n')
def paths(r,p):return OUT/f"{r['id']}.{p}.run.json",OUT/f"{r['id']}.{p}.dataset.json"
def get_valid(r,p):
 run,data=paths(r,p)
 if not(run.is_file() and data.is_file()):return None
 try:
  x=json.loads(run.read_text());d=json.loads(data.read_text());z=x['results'][0];m=d['matches'][0]
  assert len(x['results'])==len(d['matches'])==1
  assert x['seconds']==r['seconds'] and x['snapshotLagMs']==r['lag']
  assert z['seed']==m['metadata']['seed']==r['seed']
  assert z['mode']=='tdm' and z['primaryLoadout']==r['weapon'] and z['opponentPolicy']==r['opponent']
  assert z['c30']['policy']==m['metadata']['c30']['policy']==p
  assert z['c30']['modelSourceSHA256']==m['metadata']['c30']['modelSHA256']==plan['modelSHA256']
  assert z['errors']==0 and m['metadata']['c30']['productionActuation'] is False
  c=m['diagnostics']['c30'];assert c['eligible']>=0 and 0<=c['valid']<=c['eligible'] and c['proposedActs']<=c['valid']
  assert sum(c['selected'].values())==c['eligible']
  assert c['valid']+sum(c['fallbacks'].values())==c['eligible'] if p!='baseline' else True
  return dict(id=r['id'],seed=r['seed'],policy=p,map=r['map'],weapon=r['weapon'],opponent=r['opponent'],lag=r['lag'],
   kills=z['kills'],deaths=z['deaths'],damageTaken=z['damageTaken'],shots=z['shots'],hits=z['hits'],distance=z['distance'],errors=z['errors'],
   eligible=c['eligible'],valid=c['valid'],actuated=c['proposedActs'],selected=c['selected'],fallback=c['fallbacks'],
   interventionTicks=m['diagnostics']['interventionTicks'])
 except Exception:return None
def run_one(q):
 r,p=q
 if get_valid(r,p) is not None:return ('reused',r['id'],p)
 out,data=paths(r,p)
 if out.exists() or data.exists():raise RuntimeError(f'corrupted partial result {r["id"]} {p}')
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--seconds',str(r['seconds']),'--episodes','1',
  '--modes','tdm','--seed',str(r['seed']),'--classic-maps',r['map'],'--trainee-primary',r['weapon'],
  '--opponents',r['opponent'],'--lag-ms',str(r['lag']),'--c30-dataset',str(data),
  '--c30-policy',p,'--out',str(out)]
 result=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=210)
 if result.returncode or get_valid(r,p) is None:
  raise RuntimeError(f'Invalid run {r["id"]}/{p}: {result.returncode}, {result.stderr[-800:]}, {result.stdout[-300:]}')
 return ('finished',r['id'],p)
def pilot_gate():
 rows=[get_valid(r,'neural') for r in PILOT]
 if any(x is None for x in rows):return dict(status='INCOMPLETE',games=sum(x is not None for x in rows),expected=len(PILOT))
 offers=sum(x['eligible'] for x in rows);valid=sum(x['valid'] for x in rows);acted=sum(x['actuated'] for x in rows)
 ok=offers>=plan['limits']['minimumPilotOffers'] and valid/max(1,offers)>=.8 and acted/max(1,offers)>=.7
 return dict(status='PASS' if ok else 'FAIL',games=len(rows),eligibleOffers=offers,featureValid=valid,
  modelActionOffers=acted,featureCoverage=valid/max(1,offers),actuationCoverage=acted/max(1,offers),
  fallbackReasons={k:sum(x['fallback'].get(k,0) for x in rows) for k in sorted({k for r in rows for k in r['fallback']})})
def main():
 a=argparse.ArgumentParser();a.add_argument('--stage',choices=['pilot','full','status'],default='pilot');a.add_argument('--limit',type=int,default=1000);a.add_argument('--workers',type=int,default=4);o=a.parse_args()
 if o.limit<0 or o.workers<1 or o.workers>8:raise RuntimeError('invalid arguments')
 gate=pilot_gate()
 if o.stage=='full' and gate['status']!='PASS':raise RuntimeError(f'C30 transfer gate not passed: {gate}')
 rows=PILOT if o.stage!='full' else FULL
 policies=['neural'] if o.stage!='full' else POLICIES
 todo=[(r,p) for r in rows for p in policies if get_valid(r,p) is None]
 if o.stage!='status':
  with concurrent.futures.ThreadPoolExecutor(max_workers=o.workers) as pool:
   for x in concurrent.futures.as_completed([pool.submit(run_one,q) for q in todo[:o.limit]]):print('C30',*x.result(),flush=True)
 data=[x for r in rows for p in policies if (x:=get_valid(r,p)) is not None]
 s=dict(schema='fpsarena-c30-study-status-v1',registrationSHA256=plan['registrationSHA256'],
  stage=o.stage,finished=len(data),expected=len(rows)*len(policies),transferGate=pilot_gate(),
  efficacyIsResearchOnly=True,neuralValidationSelected=model['preselectedPolicy']=='neural',
  noProductionPromotion=True)
 (OUT/'STATUS.json').write_text(json.dumps(s,indent=2)+'\n');print(json.dumps(s,indent=2))
if __name__=='__main__':main()
