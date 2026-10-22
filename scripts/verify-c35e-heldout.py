#!/usr/bin/env python3
"""Independent, unchanged model C35E 120-second novel-seed evaluation. Noncausal diagnostics only."""
from __future__ import annotations
import json,hashlib,math,random,statistics,runpy
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1];DIR=ROOT/'reports/c35e/independent-18-holdout'
helpers=runpy.run_path(str(ROOT/'scripts/verify-c35e-shadow.py'))
sha=helpers['sha'];c21=helpers['c21'];validate_future=helpers['validate_future']
def audit():
 plan=json.loads((DIR/'FROZEN-DESIGN.json').read_text());audit=json.loads((DIR/'EXECUTION-AUDIT.json').read_text())
 assert plan['schema']=='fpsarena-c35e-independent-120s-holdout-v1' and len(plan['cases'])==18
 assert audit['registrationSHA256']==sha(DIR/'FROZEN-DESIGN.json')
 assert plan['modelSHA256']==sha(ROOT/'reports/c35d2/FROZEN-FORECAST.json')
 assert plan['historicalShadowPlanSHA256']==sha(ROOT/'reports/c35e/shadow-18-setup/FROZEN-DESIGN.json')
 for f,h in plan['sourceSHA256'].items():assert sha(ROOT/f)==h,'tampered source '+f
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 rows=[];allrows=[];by={};assignmentMismatch=0;totalMinutes=0
 for c in plan['cases']:
  base=DIR/'matches'/c['id'];ds=Path(str(base)+'.dataset.json');rs=Path(str(base)+'.result.json')
  meta=next(x for x in audit['matches'] if x['id']==c['id'])
  assert sha(ds)==meta['datasetSHA256'] and sha(rs)==meta['resultSHA256']
  d=json.loads(ds.read_text());m=d['matches'][0];r=json.loads(rs.read_text());e=m['c35e']
  assert d['registrationSHA256']==audit['registrationSHA256']
  assert r['aggregate']['agentErrors']==0 and m['metadata']['policy']=='shadow80'
  assert len(e['rows'])==len(m['c35c']['preoffers'])
  assert len(m['offers'])==sum(z['assigned'] for z in e['rows'])
  for i,o in enumerate(m['offers'],1):
   if o['assignedAction']!=c21(c['seed'],i):assignmentMismatch+=1
   assert o['candidateSet']==['baseline','micro-left','micro-right']
   assert o['serverAudit']['neverInput'] and o['validity']['serverLabelsOnlyAfterAssignment']
  for z in e['rows']:
   assert math.isfinite(z['forecastRisk']) and 0<=z['forecastRisk']<=1
   validate_future(z,e['timeline'],0)
   if z['complete']:
    allrows.append({**z,'setupId':c['setupId']})
    if z['assigned']:rows.append({**z,'setupId':c['setupId']})
  micro=[x for x in m['offers'] if x['assignedAction']!='baseline']
  by[c['setupId']]={'preoffers':len(e['rows']),'assigned':len(m['offers']),
    'micro':len(micro),'interrupt':sum(x['interrupted'] for x in micro),
    'ticks':sum(x['executedTicks'] for x in micro),
    'shots':r['aggregate']['shots'],'kills':r['aggregate']['kills']}
  totalMinutes+=c['seconds']/60
 assert assignmentMismatch==0
 def stats(g):
  if not g:return {'n':0,'positive':0,'meanPredicted':None,'observedRate':None,'brier':None}
  return {'n':len(g),'positive':sum(x['futurePriority'] for x in g),
   'meanPredicted':statistics.mean(x['forecastRisk'] for x in g),
   'observedRate':statistics.mean(int(x['futurePriority']) for x in g),
   'brier':statistics.mean((int(x['futurePriority'])-x['forecastRisk'])**2 for x in g)}
 def low(g):return [x for x in g if x['forecastRisk']<=.05]
 def high(g):return [x for x in g if x['forecastRisk']>.05]
 def bootstrap(values,func):
  rng=random.Random(35481220);sids=list(by);v=[]
  for _ in range(5000):
   sample=rng.choices(sids,k=len(sids));group=[x for sid in sample for x in values if x['setupId']==sid]
   out=func(group)
   if out is not None:v.append(out)
  v.sort();return [v[int((len(v)-1)*.025)],v[int((len(v)-1)*.975)]] if v else None
 micro=[x for x in rows if x['assignment']!='baseline']
 def ir(g):return sum(x['interrupted'] for x in g)/len(g) if g else None
 def compare(g):
  a=ir(high(g));b=ir(low(g));return a-b if a is not None and b is not None else None
 result={'schema':'fpsarena-c35e-independent-heldout-audit-v1','status':'DESCRIPTIVE_RESEARCH_ONLY',
  'matchedPriorC35D2':False,'independentSeedMatches':18,'simulatedMinutes':totalMinutes,
  'assignmentMismatch':assignmentMismatch,'productionAgentUnchanged':True,
  'offersTotal':sum(x['assigned'] for x in by.values()),
  'preoffersTotal':sum(x['preoffers'] for x in by.values()),
  'microTotal':sum(x['micro'] for x in by.values()),
  'interruptTotal':sum(x['interrupt'] for x in by.values()),
  'ticksTotal':sum(x['ticks'] for x in by.values()),
  'allComplete':stats(allrows),'C16Eligible':stats(rows),
  'C16EligibleLowRisk5':stats(low(rows)),'C16EligibleHighRisk':stats(high(rows)),
  'microLowRisk':{'count':len(low(micro)),'interrupted':sum(x['interrupted'] for x in low(micro)),'rate':ir(low(micro))},
  'microHighRisk':{'count':len(high(micro)),'interrupted':sum(x['interrupted'] for x in high(micro)),'rate':ir(high(micro))},
  'microHighMinusLowInterruption':compare(micro),
  'microHighMinusLowSetupBootstrap95':bootstrap(micro,compare),
  'eligibleBrierSetupBootstrap95':bootstrap(rows,lambda a:stats(a)['brier']),
  'nextGate':'NO actuator adjustment until prospective seeded C16-eligible motor test and power sufficiency',
  'policyPromotion':'NO','C36Training':'BLOCKED'}
 (DIR/'C35E-HOLDOUT-VALIDATION.json').write_text(json.dumps(result,indent=2)+'\n')
 return result
if __name__=='__main__':print(json.dumps(audit(),indent=2))
