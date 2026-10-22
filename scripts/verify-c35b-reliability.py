#!/usr/bin/env python3
"""Independent C35B complete match source-lock, assignment, telemetry integrity verifier.
Never uses outcomes to select winning actions.
"""
import argparse,hashlib,json,pathlib,collections,math
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

def verify(out):
 plan=json.loads((out/'PRE-REGISTERED-PLAN.json').read_text())
 reg=plan['registrationSHA256'];bare=dict(plan);del bare['registrationSHA256']
 assert hashlib.sha256(json.dumps(bare,sort_keys=True,separators=(',',':')).encode()).hexdigest()==reg
 assert len(plan['cases'])==108 and len({c['seed'] for c in plan['cases']})==36
 for f,h in plan['sourceFilesSHA256'].items():assert sha(ROOT/f)==h,('source drift',f)
 result={'schema':'fpsarena-c35b-independent-validation-v1','registrationSHA256':reg,'matches':0,
  'offers':0,'complete':0,'censored':0,'hitPositive':0,'hostileHits':0,'micro':0,'interruptions':0,
  'assignmentMismatch':0,'overlap':0,'missingInterruptReason':0,'missingAudit':0,
  'byDose':{},'byMap':{},'safetyViolations':0,'publicServerLeak':0,'sampleTimeErrors':0,
  'sourceLocked':True,'productionActuation':False,'causalEfficacyNotEstimated':True}
 for c in plan['cases']:
  stem=out/f"match-{c['id']}"
  ds=json.loads(stem.with_suffix('.dataset.json').read_text());rs=json.loads(stem.with_suffix('.result.json').read_text())
  assert ds['schema']=='fpsarena-c35b-reliability-dataset-v1' and ds['registrationSHA256']==reg
  assert ds['controlledEnemyPrimary']==c['enemyPrimary']
  assert len(ds['matches'])==len(rs['results'])==1
  m=ds['matches'][0];r=rs['results'][0]
  assert m['schema']=='fpsarena-c35b-duration-reliability-match-v1'
  assert m['metadata']['doseMs']==c['doseMs'] and m['metadata']['seed']==c['seed']
  assert m['metadata']['map']==c['map'] and m['metadata']['registrationSHA256']==reg
  assert m['metadata']['productionActuation'] is False
  assert r['errors']==0 and r['seed']==c['seed'] and r['map']==c['map']
  key=str(c['doseMs']);z=result['byDose'].setdefault(key,{'matches':0,'offers':0,'micro':0,'interruptions':0,'positive':0,'complete':0,'ticks':0,'hitEvents':0,'nominalTicks':0,'proximalAt100ms':0,'reasons':{}})
  z['matches']+=1;result['matches']+=1
  result['byMap'][c['map']]=result['byMap'].get(c['map'],0)+1
  last=-1e10
  for i,o in enumerate(m['offers'],1):
   assert o['offerId']==f"{m['metadata']['matchId']}:{i}"
   assert o['assignedAction']==o['selectedAction']==assignment(c['seed'],i)
   assert abs(o['propensity']-1/3)<1e-12 and o['assignment']['eligibleBeforeAssignment'] is True
   assert o['eligibilityBeforeAssignment'] is True and o['candidateSet']==list(ARMS)
   assert o['time']>=last-1e-5;last=o['time']+1.8
   assert o['public']['source'].startswith('headless client public snapshot')
   assert 'serverAudit' not in o['public'] and 'serverAfterDecision' not in o['public']
   assert o['serverAudit'] and o['serverAudit']['neverInput'] and o['serverAudit']['timing']=='postassignment-prestep'
   assert o['c35b']['doseMs']==c['doseMs'] and o['c35b']['preassignment']
   assert o['outcome']['censored']==o['horizons']['1.8']['censored']
   assert o['outcome']['hostileWeaponHits']==o['horizons']['1.8']['hostileHits']
   assert abs(o['outcome']['hostileWeaponDamage']-o['horizons']['1.8']['hostileDamage'])<.00011
   for h,v in o['c35b']['proximals'].items():
    assert h in ('0.1','0.3','0.9')
    assert v['sampleAgeSeconds']+1e-4>=float(h)
    assert math.isfinite(v['distance']) and v['distance']>=0
   result['offers']+=1;z['offers']+=1
   if not o['outcome']['censored']:
    result['complete']+=1;z['complete']+=1
    z['positive']+=int(o['outcome']['hostileWeaponHits']>0)
    result['hitPositive']+=int(o['outcome']['hostileWeaponHits']>0)
    z['hitEvents']+=o['outcome']['hostileWeaponHits']
    result['hostileHits']+=o['outcome']['hostileWeaponHits']
   else:result['censored']+=1
   if '0.1' in o['c35b']['proximals']:z['proximalAt100ms']+=1
   if o['assignedAction']!='baseline':
    result['micro']+=1;z['micro']+=1
    z['ticks']+=o['executedTicks'];z['nominalTicks']+=c['doseMs']/1000*60
    assert o['executedTicks']>=1
    assert o['actionDurationSeconds']<=c['doseMs']/1000+1e-5
    assert o['c35b']['deliveredFraction'] is not None
    if o['interrupted']:
     result['interruptions']+=1;z['interruptions']+=1
     info=o['c35b']['interruption']
     assert info and info['reasons'] and info['ticksBeforeInterrupt']==o['executedTicks']
     for reason in info['reasons']:z['reasons'][reason]=z['reasons'].get(reason,0)+1
    else:assert o['c35b']['interruption'] is None
   else:
    assert not o['interrupted'] and o['c35b']['deliveredFraction'] is None
  assert sum(m['diagnostics']['actionCounts'].values())==len(m['offers'])
 assert result['matches']==108
 for z in result['byDose'].values():
  assert z['matches']==36
  z['interruptionRateMicro']=round(z['interruptions']/max(1,z['micro']),7)
  z['completePositiveRate']=round(z['positive']/max(1,z['complete']),7)
  z['relativeDeliveredTicks']=round(z['ticks']/max(1,z['nominalTicks']),5)
 result['pooledHitPositiveRate']=round(result['hitPositive']/max(1,result['complete']),7)
 (out/'INDEPENDENT-VALIDATION.json').write_text(json.dumps(result,indent=2,ensure_ascii=False,sort_keys=True)+'\n')
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--dir',default='reports/c35b/pilot-108');a=p.parse_args()
 print(json.dumps(verify(ROOT/a.dir),indent=2,ensure_ascii=False))
