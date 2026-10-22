#!/usr/bin/env python3
"""Independent source/assignment/outcome audit and setup-bootstrap engineering comparison."""
from __future__ import annotations
import hashlib,json,random,math
from collections import defaultdict,Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DIR=ROOT/'reports/c35d2/predictive-18-pair'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def c21(seed,n):
 mask=0xffffffff;x=(seed^((n*0x517cc1b7)&mask)^0xc21f7a39)&mask
 x=(x+0x9e3779b9)&mask;x=((x^(x>>16))*0x85ebca6b)&mask
 x=((x^(x>>13))*0xc2b2ae35)&mask;x=(x^(x>>16))&mask
 return ('baseline','micro-left','micro-right')[min(2,int((x/4294967296)*3))]

def audit():
 plan=json.loads((DIR/'FROZEN-DESIGN.json').read_text());regsha=sha(DIR/'FROZEN-DESIGN.json')
 attest=json.loads((DIR/'EXECUTION-AUDIT.json').read_text())
 assert len(attest['matches'])==len(plan['cases'])==36 and attest['registrationSHA256']==regsha
 for name,expected in plan['sourceSHA256'].items():assert sha(ROOT/name)==expected,'source hash mismatch: '+name
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 by={};joined=[];offers=[];randomMismatch=0
 for case in plan['cases']:
  base=DIR/'matches'/case['id'];ds=Path(str(base)+'.dataset.json');rs=Path(str(base)+'.result.json');report=json.loads(rs.read_text())
  rec=next(a for a in attest['matches'] if a['id']==case['id'])
  assert sha(ds)==rec['datasetSHA256'] and sha(rs)==rec['resultSHA256']
  data=json.loads(ds.read_text());m=data['matches'][0];c=m['c35c'];p=c['preoffers'];o=c['offers']
  assert report['aggregate']['agentErrors']==0 and data['registrationSHA256']==regsha
  assert m['metadata']['policy']==case['policy'] and m['metadata']['seed']==case['seed']
  assert len(p)==c['diagnostics']['attempts'] and len(o)==len(m['offers'])
  assert sum(x['eligible'] for x in p)==len(o)
  ids={a['attemptId']:a for a in p};assert len(ids)==len(p)
  for i,(a,b) in enumerate(zip(m['offers'],o),1):
   if a['assignedAction']!=c21(case['seed'],i):randomMismatch+=1
   assert b['assignment']==a['assignedAction'] and b['attemptId'] in ids
   assert ids[b['attemptId']]['eligible'] and ids[b['attemptId']]['nowMs']==b['startMs']
   assert a['candidateSet']==['baseline','micro-left','micro-right']
   assert a['validity']['serverLabelsOnlyAfterAssignment'] and a['serverAudit']['neverInput']
   assert b['propensity']=={'baseline':1/3,'micro-left':1/3,'micro-right':1/3}
   assert b['outcome']['hostileHits']==(a['outcome']['hostileWeaponHits'] if b['complete'] else None)
   assert b['outcome']['shotsLost'] is None
   if case['policy']=='predictive80':
    assert math.isfinite(a['c35c']['predictedPriorityRisk120ms'])
    assert math.isfinite(ids[b['attemptId']]['predictedPriorityRisk120ms'])
  if case['policy']=='predictive80':
   assert all(math.isfinite(x['predictedPriorityRisk120ms']) for x in p)
  key=(case['setupId'],case['policy']);micro=[x for x in m['offers'] if x['assignedAction']!='baseline']
  by[key]={'attempts':len(p),'eligible':len(o),'micro':len(micro),
    'interrupt':sum(x['interrupted'] for x in micro),'ticks':sum(x['executedTicks'] for x in micro),
    'hitPositive':sum(not x['outcome']['censored'] and x['outcome']['hostileWeaponHits']>0 for x in m['offers']),
    'kills':report['aggregate']['kills'],'shots':report['aggregate']['shots'],'hits':report['aggregate']['hits'],
    'blocked':sum(x['predecisionReason']=='macro-transition-imminent' for x in p),
    'totalPredictedLowRisk':sum((x.get('predictedPriorityRisk120ms') or 10)<=.05 for x in p)}
  joined.extend(p);offers.extend(o)
 assert randomMismatch==0
 (DIR/'C35D2-PREOFFERS.jsonl').write_text(''.join(json.dumps(x,separators=(',',':'))+'\n' for x in joined))
 (DIR/'C35D2-OFFERS.jsonl').write_text(''.join(json.dumps(x,separators=(',',':'))+'\n' for x in offers))
 names=['legacy80','predictive80'];metrics={name:{k:sum(x[k] for (sid,pol),x in by.items() if pol==name) for k in next(iter(by.values()))} for name in names}
 setups=sorted({sid for sid,policy in by})
 def rate(picks,k,denom):
  def r(policy):
   n=sum(by[(s,policy)][denom] for s in picks)
   return sum(by[(s,policy)][k] for s in picks)/n if n else None
  a=r('legacy80');b=r('predictive80');return b-a if a is not None and b is not None else None
 rng=random.Random(35395057);diffs={}
 for label,k,denom in [('interruptionRate','interrupt','micro'),('microPerAttempt','micro','attempts'),
                        ('ticksPerAttempt','ticks','attempts'),('eligibilityRate','eligible','attempts')]:
  expected=rate(setups,k,denom);boot=[]
  for _ in range(5000):
   x=rate([rng.choice(setups) for _ in setups],k,denom)
   if x is not None:boot.append(x)
  boot.sort();diffs[label]={'difference':expected,'bootstrap95':[boot[int(.025*(len(boot)-1))],boot[int(.975*(len(boot)-1))]]}
 result={'schema':'fpsarena-c35d2-independent-technical-audit-v1','status':'RESEARCH_ONLY_NO_PROMOTION',
  'lockedSource':'PASS','independentC21AssignmentMismatch':0,'authoritativeEngineMatches':36,
  'matchedSetups':18,'preoffers':len(joined),'offers':len(offers),'productionPageAgentUnchanged':True,
  'metrics':metrics,'matchedSetupBootstrap':diffs,
  'causalCombatEfficacy':'NOT_ESTABLISHED','trainingC36':'BLOCKED'}
 (DIR/'C35D2-VALIDATION.json').write_text(json.dumps(result,indent=2)+'\n')
 return result
if __name__=='__main__':print(json.dumps(audit(),indent=2))
