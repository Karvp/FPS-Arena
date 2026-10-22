#!/usr/bin/env python3
"""Independent C35-F C21/C16/public-state and matched-setup audit."""
from __future__ import annotations
import hashlib,json,random,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/c35f/pilot-18-pairs'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canon(x):return (json.dumps(x,sort_keys=True,indent=2)+'\n').encode()
def hash32(x):
 x=(x+0x9e3779b9)&0xffffffff;x=(((x^(x>>16))*0x85ebca6b)&0xffffffff)
 x=(((x^(x>>13))*0xc2b2ae35)&0xffffffff);return (x^(x>>16))&0xffffffff
def assign(seed,i):
 index=min(2,(hash32((seed^((i*0x517cc1b7)&0xffffffff)^0xc21f7a39)&0xffffffff)*3)//4294967296)
 return ['baseline','micro-left','micro-right'][index]
def study():
 design=json.loads((OUT/'FROZEN-DESIGN.json').read_text());reg=sha(OUT/'FROZEN-DESIGN.json')
 for f,h in design['sourceSHA256'].items():assert sha(ROOT/f)==h,('source tamper',f)
 audit=json.loads((OUT/'EXECUTION-AUDIT.json').read_text());assert audit['registrationSHA256']==reg
 assert len(design['cases'])==len(audit['executed'])==36
 rows=[];violations=[]
 for c in design['cases']:
  p=OUT/'matches'/c['id']; ds=Path(str(p)+'.dataset.json');rs=Path(str(p)+'.result.json')
  listed=next(x for x in audit['executed'] if x['id']==c['id'])
  assert sha(ds)==listed['datasetSHA256'] and sha(rs)==listed['resultSHA256']
  d=json.loads(ds.read_text());assert d['registrationSHA256']==reg
  m=d['matches'][0];a=json.loads(rs.read_text())['aggregate'];pre=m['c35c']['preoffers'];offers=m['offers']
  assert m['metadata']['policy']==c['policy'] and m['metadata']['seed']==c['seed']
  assert m['metadata']['registrationSHA256']==reg and a['agentErrors']==0
  assert len(pre)==m['c35c']['diagnostics']['attempts'];assert m['c35c']['diagnostics']['blockedByMacro']=={}
  assert len(offers)==m['c35c']['diagnostics']['recordedAssignments']
  assert len(m['c35e']['rows'])==len(pre) and len(m['c35e']['timeline'])>=len(pre)
  completed=0;hits=0;micro=0;interrupts=0;ticks=0
  decisions=m.get('c35f',{}).get('decisions',[])
  if c['policy']=='stagger80':assert len(decisions)==len(offers)
  for i,o in enumerate(offers,1):
   assert o['assignedAction']==assign(c['seed'],i) and o['propensity']==1/3
   assert o['candidateSet']==['baseline','micro-left','micro-right']
   assert o['registrationSHA256']==reg
   assert o['eligibilityBeforeAssignment'] and o['validity']['preActionPublicFeaturesOnly']
   assert o['c35c']['predecisionOnly'] and o['c35c']['allThreeArmsC16Eligible']
   assert 0<=o['executedTicks']<=5
   assert o['c35c']['attemptId'] in {p['attemptId'] for p in pre if p['eligible']}
   assert o['offerId'] in {p['offerId'] for p in m['c35e']['rows'] if p['assigned']}
   if c['policy']=='stagger80':
    cf=o['c35f'];assert cf['offerId']==o['offerId'] and cf['deferralTicks'] in (0,1)
    assert (cf['risk']>=.2 and o['assignedAction']!='baseline')==(cf['deferralTicks']==1)
   if not o['outcome']['censored']:
    completed+=1;hits+=int(o['outcome']['hostileWeaponHits']>0)
   if o['assignedAction']!='baseline':
    micro+=1;interrupts+=int(o['interrupted']);ticks+=o['executedTicks']
  assert ticks==m['diagnostics']['interventionTicks']
  assert m['diagnostics']['interruptions']==interrupts
  assert all(p['complete'] or(p['futurePriority'] is None and p['futurePriorityEdge'] is None) for p in m['c35e']['rows'])
  if c['policy']=='stagger80':
   assert m['c35f']['deliveredMicroTicks']==ticks
   assert m['c35f']['delayedMicro']==sum(x['deferralTicks'] for x in decisions)
  rows.append({'id':c['id'],'setupId':c['setupId'],'policy':c['policy'],'attempts':len(pre),'offers':len(offers),
   'micro':micro,'interruptions':interrupts,'ticks':ticks,'shots':a['shots'],'kills':a['kills'],
   'agentErrors':a['agentErrors'],'hostileHitPositive':hits,'completeOutcomes':completed,
   'deferrals':m.get('c35f',{}).get('delayedMicro',0),'durationMinutes':c['seconds']/60})
 pairs=[]
 for id in sorted({x['setupId'] for x in rows}):
  rr={x['policy']:x for x in rows if x['setupId']==id}
  assert set(rr)=={'shadow80','stagger80'}
  pairs.append(rr)
 def measure(items):
  return {p:{'matches':len(items),'preoffers':sum(x[p]['attempts'] for x in items),
   'offers':sum(x[p]['offers'] for x in items),'micro':sum(x[p]['micro'] for x in items),
   'interruptions':sum(x[p]['interruptions'] for x in items),
   'ticks':sum(x[p]['ticks'] for x in items),'shots':sum(x[p]['shots'] for x in items),
   'kills':sum(x[p]['kills'] for x in items),'deferrals':sum(x[p]['deferrals'] for x in items),
   'hitPositive':sum(x[p]['hostileHitPositive'] for x in items),
   'ticksPerPreoffer':sum(x[p]['ticks'] for x in items)/sum(x[p]['attempts'] for x in items),
   'shotsPerMinute':sum(x[p]['shots'] for x in items)/sum(x[p]['durationMinutes'] for x in items),
   'interruptionRate':sum(x[p]['interruptions'] for x in items)/max(1,sum(x[p]['micro'] for x in items))} for p in ['shadow80','stagger80']}
 observed=measure(pairs)
 rng=random.Random(35570001);draws={'ticksRatio':[],'shotsRatio':[],'ticksDifference':[]}
 for _ in range(5000):
  m=measure([rng.choice(pairs) for _ in pairs]);a,b=m['shadow80'],m['stagger80'];
  if a['ticksPerPreoffer']:
   draws['ticksRatio'].append(b['ticksPerPreoffer']/a['ticksPerPreoffer'])
   draws['ticksDifference'].append(b['ticksPerPreoffer']-a['ticksPerPreoffer'])
  if a['shotsPerMinute']:draws['shotsRatio'].append(b['shotsPerMinute']/a['shotsPerMinute'])
 def quant(v,q):v=sorted(v);return v[round((len(v)-1)*q)]
 intervals={k:{'p025':quant(v,.025),'p05':quant(v,.05),'median':quant(v,.5),'p95':quant(v,.95),'p975':quant(v,.975)} for k,v in draws.items()}
 tickRatio=observed['stagger80']['ticksPerPreoffer']/observed['shadow80']['ticksPerPreoffer']
 shotRatio=observed['stagger80']['shotsPerMinute']/observed['shadow80']['shotsPerMinute']
 gates={'C16AndAssignment':'PASS','deferredNotVetoed':'PASS',
  'ticksExposureNoninferiority': 'PASS' if intervals['ticksRatio']['p05']>=.95 else 'FAIL',
  'shotsPreservation': 'PASS' if intervals['shotsRatio']['p05']>=.95 else 'FAIL',
  'combatEfficacy':'NOT_ESTIMABLE_SPARSE_HOSTILE_HITS','productionPromotion':'NO','C36':'BLOCKED'}
 out={'schema':'fpsarena-c35f-independent-audit-v1','registrationSHA256':reg,
  'setupPairs':len(pairs),'matches':len(rows),'simulatedMinutes':sum(x['durationMinutes'] for x in rows),
  'policies':observed,'effect':{'ticksPerPreofferRatio':tickRatio,'shotsPerMinuteRatio':shotRatio},
  'bootstrapByPairedSetup':{'replicates':5000,'intervals':intervals},'gates':gates,'matchesRaw':rows,
  'caveats':['exploratory motor trial, not causal dodge efficacy','within-match treatment interference',
   'paired configurations do not imply identical future encounters','unobserved counterfactual arms not labeled']}
 (OUT/'VALIDATION.json').write_bytes(canon(out));print(json.dumps({k:v for k,v in out.items() if k!='matchesRaw'},indent=2));return out
if __name__=='__main__':study()
