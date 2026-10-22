#!/usr/bin/env python3
"""Independent read-only verification. NO per-arm efficacy, only pooled diagnostics."""
import argparse,hashlib,json,pathlib,collections,statistics
ROOT=pathlib.Path(__file__).resolve().parent.parent
MASK=(1<<32)-1
ARMS=('baseline','micro-left','micro-right')
def hash32(x):
 x=(x+0x9e3779b9)&MASK
 x=((x^(x>>16))*0x85ebca6b)&MASK
 x=((x^(x>>13))*0xc2b2ae35)&MASK
 return (x^(x>>16))&MASK
def assignment(seed,index):
 u=hash32(((seed^((index*0x517cc1b7)&MASK)^0xc21f7a39)&MASK))/4294967296
 return ARMS[min(2,int(u*3))]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(root):
 plan=json.loads((root/'PRE-REGISTERED-PLAN.json').read_text());assert plan['schema']=='fpsarena-c35-preregistered-technical-pilot-v1'
 registration=plan['registrationSHA256'];base=dict(plan);del base['registrationSHA256']
 assert hashlib.sha256(json.dumps(base,sort_keys=True,separators=(',',':')).encode()).hexdigest()==registration
 for f,h in plan['sourceFilesSHA256'].items():assert sha(ROOT/f)==h,(f,'source drift')
 assert len(plan['cases'])==90
 diag={'schema':'fpsarena-c35-independent-technical-pilot-validation-v1','registrationSHA256':registration,
   'matches':0,'offers':0,'completeOffers':0,'censoredOffers':0,'hitPositiveOffers':0,
   'hostileHitEvents':0,'hostileDamageTotal':0.0,'byArmAssignments':dict.fromkeys(ARMS,0),
   'byMap':{},'byWeapon':{},'overrideOffers':0,'incompleteMatches':0,'safetyViolations':0,
   'assignmentMismatch':0,'serverLeak':0,'windowOverlap':0,'replayMismatch':0,
   'pilotCannotEstablishCausalEfficacy':True}
 for c in plan['cases']:
  prefix=root/f"match-{c['id']}"
  ds=json.loads(prefix.with_suffix('.dataset.json').read_text())
  results=json.loads(prefix.with_suffix('.result.json').read_text())
  assert ds['schema']=='fpsarena-c35-randomized-safe-action-dataset-v1'
  assert ds['registrationSHA256']==registration and ds['controlledEnemyPrimary']==c['enemyPrimary']
  assert len(ds['matches'])==1 and len(results['results'])==1
  m=ds['matches'][0];r=results['results'][0]
  assert m['metadata']['seed']==c['seed'] and m['metadata']['map']==c['map']
  assert m['metadata']['registrationSHA256']==registration
  assert m['metadata']['productionActuation'] is False
  assert r['errors']==0 and r['map']==c['map'] and r['seed']==c['seed']
  if c['enemyPrimary']!=ds['controlledEnemyPrimary']:raise AssertionError('wrong controlled weapon')
  diag['matches']+=1
  diag['byMap'][c['map']]=diag['byMap'].get(c['map'],0)+len(m['offers'])
  diag['byWeapon'][c['enemyPrimary']]=diag['byWeapon'].get(c['enemyPrimary'],0)+len(m['offers'])
  prev=-1e10
  for j,o in enumerate(m['offers'],1):
   assert o['offerId']==f"{m['metadata']['matchId']}:{j}"
   assert o['schema']=='fpsarena-c35-causal-offer-v1'
   assert o['assignedAction']==o['selectedAction']==assignment(c['seed'],j)
   assert abs(o['propensity']-1/3)<1e-12 and o['assignment']['eligibleBeforeAssignment'] is True
   assert o['eligibilityBeforeAssignment'] is True and o['candidateSet']==list(ARMS)
   assert isinstance(o['public']['staticMap']['nearbyBoxes'],list) and isinstance(o['public']['incumbent'],dict)
   assert o['public']['source'].startswith('headless client public snapshot')
   assert 'serverAudit' not in o['public'] and 'serverAfterDecision' not in o['public']
   assert o['serverAudit'] is not None and o['serverAudit']['neverInput'] is True
   assert o['serverAudit']['timing']=='postassignment-prestep'
   assert o['time']+1e-5>=prev
   prev=o['time']+1.8
   assert o['windowEnd']>=o['time']+1.7999
   outcome=o['outcome'];last=o['horizons']['1.8']
   assert abs(last['hostileDamage']-outcome['hostileWeaponDamage'])<.00011
   assert last['hostileHits']==outcome['hostileWeaponHits']
   assert last['censored']==outcome['censored']
   lastd=0;lasth=0
   for h in ('0.3','0.9','1.8'):
    y=o['horizons'][h]
    assert y['hostileDamage']>=lastd and y['hostileHits']>=lasth
    if y['censored'] is False:assert o['time']+float(h)<=c['seconds']+.04
    lastd=y['hostileDamage'];lasth=y['hostileHits']
   diag['offers']+=1;diag['byArmAssignments'][o['assignedAction']]+=1
   diag['overrideOffers']+=bool(o['runtimeOverride'])
   diag['censoredOffers']+=bool(outcome['censored'])
   if not outcome['censored']:
    diag['completeOffers']+=1
    diag['hitPositiveOffers']+=outcome['hostileWeaponHits']>0
    diag['hostileHitEvents']+=outcome['hostileWeaponHits']
    diag['hostileDamageTotal']+=outcome['hostileWeaponDamage']
 assert len(m['offers'])==sum(m['diagnostics']['actionCounts'].values())
 diag['hostileDamageTotal']=round(diag['hostileDamageTotal'],5)
 diag['hitPositiveRate']=round(diag['hitPositiveOffers']/max(1,diag['completeOffers']),6)
 diag['offersPerMatch']=round(diag['offers']/max(1,diag['matches']),4)
 diag['runtimeOverrideRate']=round(diag['overrideOffers']/max(1,diag['offers']),6)
 diag['safetyAndProvenancePass']=diag['safetyViolations']==diag['serverLeak']==diag['assignmentMismatch']==0
 dest=root/'INDEPENDENT-VALIDATION.json';dest.write_text(json.dumps(diag,indent=2,sort_keys=True)+'\n');return diag
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--dir',default='reports/c35/pilot-90');ns=ap.parse_args()
 report=verify(ROOT/ns.dir)
 print(json.dumps(report,indent=2))
