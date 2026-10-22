#!/usr/bin/env python3
"""Independent C35E label replay, C21 assignment and legacy80 equivalence audit."""
from __future__ import annotations
import hashlib,json,math,statistics,random
from pathlib import Path
from collections import Counter,defaultdict
ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/'reports/c35e/shadow-18-setup'
PARENT=ROOT/'reports/c35d2/predictive-18-pair/matches'
MODEL=ROOT/'reports/c35d2/FROZEN-FORECAST.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def c21(seed,n):
 mask=0xffffffff;x=(seed^((n*0x517cc1b7)&mask)^0xc21f7a39)&mask
 x=(x+0x9e3779b9)&mask;x=((x^(x>>16))*0x85ebca6b)&mask
 x=((x^(x>>13))*0xc2b2ae35)&mask;x=(x^(x>>16))&mask
 return ('baseline','micro-left','micro-right')[min(2,int((x/4294967296)*3))]
def validate_future(row,timeline,ix):
 end=row['tMs']+120
 future=[(t,int(b),int(timeline[j-1][1]) if j>0 else 0)
         for j,(t,b) in enumerate(timeline) if t>row['tMs']+0.001 and t<=end+0.001]
 complete=bool(timeline and timeline[-1][0]>=end-.001)
 assert row['complete']==complete,'censoring mismatch'
 if complete:
  assert row['futurePriority']==any(b for _,b,_ in future),'future priority mismatch'
  assert row['futurePriorityEdge']==any(b and not prev for _,b,prev in future),'future priority edge mismatch'
 else:assert row['futurePriority'] is None and row['futurePriorityEdge'] is None

def audit():
 p=json.loads((DIR/'FROZEN-DESIGN.json').read_text());a=json.loads((DIR/'EXECUTION-AUDIT.json').read_text())
 assert p['schema']=='fpsarena-c35e-registered-shadow-observation-v1' and len(p['cases'])==18
 assert a['registrationSHA256']==sha(DIR/'FROZEN-DESIGN.json')
 for f,h in p['sourceSHA256'].items():assert sha(ROOT/f)==h,f
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 assert sha(MODEL)==p['modelSHA256']
 all_rows=[];legacy={};by={};bad=0
 for c in p['cases']:
  item=next(x for x in a['matches'] if x['id']==c['id'])
  path=DIR/'matches'/c['id'];ds=Path(str(path)+'.dataset.json');rs=Path(str(path)+'.result.json')
  assert sha(ds)==item['datasetSHA256'] and sha(rs)==item['resultSHA256']
  obj=json.loads(ds.read_text());m=obj['matches'][0];report=json.loads(rs.read_text());e=m['c35e'];o=m['offers']
  assert obj['registrationSHA256']==a['registrationSHA256'] and m['metadata']['policy']=='shadow80'
  assert report['aggregate']['agentErrors']==0
  assert len(e['rows'])==len(m['c35c']['preoffers'])==m['c35c']['diagnostics']['attempts']
  assert e['complete']+e['censored']==len(e['rows'])
  assert len(o)==len(m['c35c']['offers'])
  pending={x['attemptId']:x for x in e['rows']}
  for z in e['rows']:
   assert 0<=z['forecastRisk']<=1 and math.isfinite(z['forecastRisk'])
   assert z['source']=='predecision-incumbent-command-only'
   validate_future(z,e['timeline'],0)
   if z['complete']:all_rows.append({**z,'setupId':c['setupId']})
  for i,offer in enumerate(o,1):
   if offer['assignedAction']!=c21(c['seed'],i):bad+=1
   assert offer['candidateSet']==['baseline','micro-left','micro-right']
   assert offer['serverAudit']['neverInput'] and offer['validity']['serverLabelsOnlyAfterAssignment']
  offers={x['offerId']:x for x in o}
  for z in e['rows']:
   assert z['assigned']==bool(z['offerId'])
   if z['assigned']:
    v=offers[z['offerId']];assert z['assignment']==v['assignedAction']
    assert z['interrupted']==(bool(v['interrupted']) if z['assignment']!='baseline' else None)
   else:assert z['interrupted'] is None and z['executedTicks'] is None
  # HARD historical parity: same seeded setup and original agent; no forecast motor veto.
  oldid=c['id'].replace('shadow80','legacy80');prev=PARENT/(oldid+'.dataset.json')
  assert prev.exists(),'missing historical matched baseline'
  old=json.loads(prev.read_text())['matches'][0]
  assert len(old['offers'])==len(o),'shadow changed the number of C21 assignments'
  for v,w in zip(old['offers'],o):
   for key in ('time','assignedAction','selectedAction','executedTicks','interrupted','outcome','horizons','actualFirstCommand'):
    assert v.get(key)==w.get(key),f'shadow changed {key}: {c["id"]}'
  for k in ('actionCounts','interruptions'):
   if k in old['diagnostics']:assert old['diagnostics'][k]==m['diagnostics'][k]
  assert len(old['c35c']['preoffers'])==len(m['c35c']['preoffers'])
  for x,y in zip(old['c35c']['preoffers'],m['c35c']['preoffers']):
   for k in ('nowMs','eligible','predecisionReason','riskBin'):
    assert x.get(k)==y.get(k),'preoffer parity failure'
  oldresult=json.loads((PARENT/(oldid+'.result.json')).read_text())
  assert oldresult['aggregate']==report['aggregate'],'gameplay aggregate parity failure'
  aoffers=[x for x in o if x['assignedAction']!='baseline']
  by[c['setupId']]={'attempts':len(e['rows']),'eligible':sum(z['assigned'] for z in e['rows']),
   'micro':len(aoffers),'ticks':sum(z['executedTicks'] for z in aoffers),
   'interrupt':sum(bool(z['interrupted']) for z in aoffers),
   'shots':report['aggregate']['shots'],'hits':report['aggregate']['hits'],'kills':report['aggregate']['kills']}
  legacy[c['setupId']]=len(old['offers'])
 assert bad==0,'C21 assignment mismatch'
 eligible=[x for x in all_rows if x['assigned']]
 def rate(xs):return sum(x['futurePriority'] for x in xs)/len(xs) if xs else None
 low=[x for x in eligible if x['forecastRisk']<=.05]
 high=[x for x in eligible if x['forecastRisk']>.05]
 def brier(xs):return statistics.mean((int(x['futurePriority'])-x['forecastRisk'])**2 for x in xs) if xs else None
 def stats(xs):return {'n':len(xs),'positive':sum(x['futurePriority'] for x in xs),'observedRate':rate(xs),'meanPredicted':statistics.mean(x['forecastRisk'] for x in xs) if xs else None,'brier':brier(xs)}
 # bootstrap by 18 setup clusters; zero or finite counts enforced.
 setups=sorted(by);rng=random.Random(35395550);boot=[]
 for _ in range(5000):
  picks=[rng.choice(setups) for _ in setups]
  group=[x for sid in picks for x in eligible if x['setupId']==sid]
  if group:boot.append(brier(group))
 boot.sort()
 result={'schema':'fpsarena-c35e-independent-shadow-audit-v1','status':'SHADOW_PASS_MOTOR_EFFICACY_UNTESTED',
 'matches':18,'matchedHistoricalSource':'C35-D2 legacy80','historicalGameplayParity':True,
 'C21AssignmentMismatch':0,'productionAgentUnchanged':True,'totalPreoffers':sum(x['attempts'] for x in by.values()),
 'totalEligible':sum(x['eligible'] for x in by.values()),'totalMicro':sum(x['micro'] for x in by.values()),
 'totalExecutedMicroTicks':sum(x['ticks'] for x in by.values()),
 'totalInterruptedMicro':sum(x['interrupt'] for x in by.values()),
 'totalShots':sum(x['shots'] for x in by.values()),'totalKills':sum(x['kills'] for x in by.values()),
 'prospectiveAllComplete':stats(all_rows),'prospectiveEligibleComplete':stats(eligible),
 'forecastRiskLessThanOrEqual5pct':stats(low),'forecastRiskAbove5pct':stats(high),
 'eligibleBrierSetupBootstrap95':[boot[int((len(boot)-1)*.025)],boot[int((len(boot)-1)*.975)]] if boot else None,
 'interpretation':'Forecast observed against future public priority at C16-eligible offers; cannot establish causal dodge value',
 'gates':{'observationalCalibration':'DESCRIPTIVE_ONLY','motorPolicyPromotion':'BLOCKED','neuralC36':'BLOCKED'}}
 (DIR/'C35E-VALIDATION.json').write_text(json.dumps(result,indent=2)+'\n')
 return result
if __name__=='__main__':print(json.dumps(audit(),indent=2))
