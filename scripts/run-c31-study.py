#!/usr/bin/env python3
"""C31 preregistered gun-diversity transfer/efficacy study; never production.

Stage 1: frozen C30 model on new game seeds with explicitly assigned enemy weapons.
Stage 2: only after coverage/action-diversity preregistered gates, run whole
same-seed game controls (baseline, always-left, frozen C30 neural).
"""
import argparse,concurrent.futures,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c31/study';OUT.mkdir(parents=True,exist_ok=True)
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
MAPS=['arena','neon','foundry'];OPP=['stress','mixed','official'];LAGS=[35,65,125]
POLICIES=['baseline','simple','neural']
def sha(blob):return hashlib.sha256(blob).hexdigest()
SOURCE_FILES=['lab/arena/train-main.mjs','lab/arena/research-policy-c31.mjs',
 'lab/arena/research-policy-c30.mjs','lab/arena/safe-action-explorer-c16.mjs',
 'scripts/run-c31-study.py','reports/c30/encounters/FROZEN-POLICY.json']
SOURCE_SHA=sha('|'.join(sha((ROOT/x).read_bytes()) for x in SOURCE_FILES).encode())
MODEL_SHA=sha((ROOT/'reports/c30/encounters/FROZEN-POLICY.json').read_bytes())
def make(stage,reps,base,seconds):
 return [dict(id=f'{stage}{i:03}',seed=base+i*191,
  enemyWeapon=WEAPONS[i%6],traineeWeapon=WEAPONS[(i//6+i)%6],
  map=MAPS[(i//6+i)%3],opponent=OPP[(i//3)%3],lag=LAGS[(i//2)%3],seconds=seconds)
  for i in range(reps*6)]
PILOT=make('p',6,31100000,75)
EVAL=make('e',6,31500000,105)
PLAN=dict(schema='fpsarena-c31-weapon-diversity-preregistration-v1',sourceSHA256=SOURCE_SHA,
 frozenC30ModelSHA256=MODEL_SHA,parent='C30 fixed C30 policy weights, NEVER refit using C31 outcomes',
 pilot=PILOT,efficacy=EVAL,policies=POLICIES,
 thresholds=dict(minPilotMatches=36,minEligibleOffers=120,minTotalSeenWeapons=6,
  minOffersPerGun=8,minPublicTruthAgreement=.95,minFeatureCoverage=.90,
  minNonLeftNeuralRate=.08,minWeaponsWithNonLeft=2,maxRuntimeErrors=0),
 primary='same-seed entire-match (kills-deaths) paired neural minus always-left on 36 independent game seeds',
 secondary=['damageTaken','shots','hits','kills','deaths','engagement distance','actuation','weapon-truth mismatch'],
 researchLimitations=['headless not real human gameplay','C30 network lost validation to always-left',
 'both scripts use same frozen model; outcome comparison is diagnostic only',
 'enemy weapon set pre-match for all bots, special abilities may temporarily override',
 'same-seed full-game branches diverge and are not individual-action counterfactuals'],
 promotion=False)
PLAN['registrationSHA256']=sha(json.dumps(PLAN,sort_keys=True,separators=(',',':')).encode())
PLAN_PATH=OUT/'PRE-REGISTERED-PLAN.json'
if PLAN_PATH.exists():
 if json.loads(PLAN_PATH.read_text())!=PLAN:raise RuntimeError('C31 pre-registration/source changed. Refuse silent alterations')
else:PLAN_PATH.write_text(json.dumps(PLAN,indent=2)+'\n')
def paths(r,policy):return OUT/f'{r["id"]}.{policy}.run.json',OUT/f'{r["id"]}.{policy}.dataset.json'
def validated(r,policy):
 run,dataset=paths(r,policy)
 if not run.exists() or not dataset.exists():return None
 try:
  rr=json.loads(run.read_text()); dd=json.loads(dataset.read_text());
  assert len(rr['results'])==len(dd['matches'])==1
  x=rr['results'][0];m=dd['matches'][0]
  assert dd['schema']=='fpsarena-c31-controlled-enemy-weapon-dataset-v1'
  assert rr['seconds']==r['seconds'] and rr['snapshotLagMs']==r['lag']
  assert x['seed']==m['metadata']['seed']==r['seed']
  assert x['mode']=='tdm' and x['primaryLoadout']==r['traineeWeapon']
  assert x['opponentPolicy']==r['opponent'] and x['errors']==0
  assert x['c31']['policy']==m['metadata']['c31']['policy']==policy
  assert x['c31']['enemyPrimary']==m['metadata']['c31']['controlledEnemyPrimary']==r['enemyWeapon']
  assert x['c31']['modelSourceSHA256']==m['metadata']['c31']['modelSHA256']==MODEL_SHA
  assert m['metadata']['c31']['researchOnly'] is True
  d=m['diagnostics']['c31']; assert d['offers']==len(m['offers'])
  assert d['offers']==sum(d['bySelectedAction'].values())
  assert d['weaponTruthKnown']==sum(d['serverWeapons'].values())
  assert d['weaponTruthMismatch']>=0 and d['weaponTruthMismatch']<=d['weaponTruthKnown']
  for o in m['offers']:
   c=o['c31']; assert c['result']=='controlled-opponent-loadout'
   assert c['serverWeaponAfterDecision'] is None or bool(c['truthMatchesPublic']) == (c['serverWeaponAfterDecision']==c['publicWeapon'])
  return dict(id=r['id'],seed=r['seed'],policy=policy,weapon=r['enemyWeapon'],map=r['map'],lag=r['lag'],opponent=r['opponent'],
   eligible=d['offers'],valid=d['validFeatures'],selected=d['bySelectedAction'],seen=d['seenPublicWeapons'],
   truthKnown=d['weaponTruthKnown'],truthMismatch=d['weaponTruthMismatch'],
   kills=x['kills'],deaths=x['deaths'],damageTaken=x['damageTaken'],shots=x['shots'],hits=x['hits'],distance=x['distance'],
   interventionTicks=m['diagnostics']['interventionTicks'])
 except Exception:return None
def execute(q):
 r,policy=q
 if validated(r,policy) is not None:return ('cached',r['id'],policy)
 run,data=paths(r,policy)
 if run.exists() or data.exists():raise RuntimeError('Corrupted or partial C31 result: '+r['id']+'/'+policy)
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--seconds',str(r['seconds']),
  '--episodes','1','--modes','tdm','--seed',str(r['seed']),
  '--classic-maps',r['map'],'--trainee-primary',r['traineeWeapon'],
  '--opponents',r['opponent'],'--lag-ms',str(r['lag']),
  '--c31-dataset',str(data),'--c31-policy',policy,'--enemy-primary',r['enemyWeapon'],'--out',str(run)]
 x=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=240)
 if x.returncode or validated(r,policy) is None:raise RuntimeError(f'Invalid run {r["id"]}/{policy}: {x.returncode}: {x.stderr[-800:]} {x.stdout[-200:]}')
 return ('finished',r['id'],policy)
def gate():
 rows=[validated(r,'neural') for r in PILOT]
 if any(x is None for x in rows):return dict(status='INCOMPLETE',completed=sum(x is not None for x in rows),expected=len(rows))
 offers=sum(x['eligible'] for x in rows);valid=sum(x['valid'] for x in rows);truth=sum(x['truthKnown'] for x in rows)
 mismatches=sum(x['truthMismatch'] for x in rows)
 by={w:sum(x['seen'].get(w,0) for x in rows) for w in WEAPONS}
 nonleft=sum(x['selected'].get('micro-right',0)+x['selected'].get('baseline',0) for x in rows)
 different=sum(sum(x['selected'].get(a,0) for x in rows if x['weapon']==w for a in ('micro-right','baseline'))>0 for w in WEAPONS)
 reasons=[];th=PLAN['thresholds']
 if offers<th['minEligibleOffers']:reasons.append('too-few-offers')
 if sum(v>0 for v in by.values())<th['minTotalSeenWeapons']:reasons.append('too-few-weapon-types')
 if min(by.values())<th['minOffersPerGun']:reasons.append('too-few-per-gun')
 if truth/max(1,offers)<.90 or 1-mismatches/max(1,truth)<th['minPublicTruthAgreement']:reasons.append('weapon-provenance-failure')
 if valid/max(1,offers)<th['minFeatureCoverage']:reasons.append('input-coverage-failure')
 if nonleft/max(1,offers)<th['minNonLeftNeuralRate'] or different<th['minWeaponsWithNonLeft']:reasons.append('policy-action-collapse')
 return dict(status='PASS' if not reasons else 'FAIL',reasons=reasons,matches=len(rows),offers=offers,
  validFeatureRate=valid/max(1,offers),publicTruthAgreement=1-mismatches/max(1,truth),
  truthKnown=truth,byWeapon=by,nonLeft=nonleft,nonLeftRate=nonleft/max(1,offers),weaponsWithNonLeft=different,
  actionTotals={a:sum(x['selected'].get(a,0) for x in rows) for a in ('baseline','micro-left','micro-right')})
def main():
 p=argparse.ArgumentParser();p.add_argument('--stage',choices=['pilot','efficacy','status'],default='pilot');p.add_argument('--workers',type=int,default=4);p.add_argument('--limit',type=int,default=1000);a=p.parse_args()
 if not 1<=a.workers<=8 or a.limit<0:raise ValueError('invalid worker/limit')
 g=gate()
 if a.stage=='efficacy' and g['status']!='PASS':raise RuntimeError('Frozen C31 pilot failed, do not run efficacy: '+str(g))
 q=[] if a.stage=='status' else [(r,z) for r in (PILOT if a.stage=='pilot' else EVAL) for z in (['neural'] if a.stage=='pilot' else POLICIES) if validated(r,z) is None]
 with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
  for fut in concurrent.futures.as_completed([pool.submit(execute,x) for x in q[:a.limit]]):print('C31',*fut.result(),flush=True)
 g=gate();evalRows=[validated(r,z) for r in EVAL for z in POLICIES]
 summary=dict(schema='fpsarena-c31-locked-status-v1',registrationSHA256=PLAN['registrationSHA256'],
  pilotGate=g,efficacyCompleted=sum(x is not None for x in evalRows),efficacyExpected=len(evalRows),
  noProductionPromotion=True)
 (OUT/'STATUS.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
if __name__=='__main__':main()
