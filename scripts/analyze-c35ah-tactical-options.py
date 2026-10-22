#!/usr/bin/env python3
"""Cluster-level, pre-assigned bounded motor option ITT and paired match outcome.
 No action-conditioned Q derived. Censored windows reported but not zero-filled.
"""
from pathlib import Path
from collections import defaultdict
import csv,json,random,statistics
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ah/frozen-54'
def read(p):return json.loads(p.read_text())
d=read(O/'FROZEN-DESIGN.json');cases=[];rows=[];allrows=[]
for c in d['cases']:
 prefix=O/'matches'/c['id'];result=read(Path(str(prefix)+'.result.json'))['results'][0]
 line={k:c[k] for k in ('id','setupId','gun','arm','seed','map','lagMs')}
 line.update({k:result[k] for k in ('kills','deaths','shots','hits','damageDealt','damageTaken','errors')})
 cases.append(line)
 if c['arm']!='randomized':continue
 t=read(Path(str(prefix)+'.option.json'))['traces'][0]
 for a in t['rows']:
  item={k:c[k] for k in ('setupId','gun','map','seed')}
  item.update(index=a['index'],assignedArm=a['assignedArm'],propensity=a['propensity'],
   optionTicks=a['optionTicks'],modifiedTicks=a['modifiedTicks'],replannedTicks=a['replannedTicks'],
   interruptions=a['interruptions'],complete=a['factual']['complete'])
  if a['factual']['complete']:
   y=a['factual'];v={k:y[k] for k in ('shots','hits','damageDealt','damageTaken','ownKills','deathCount','survived')}
   v['boundedCombatReturn']=(min(y['damageDealt'],300)-min(y['damageTaken'],300)+100*(y['ownKills']-y['deathCount']))/100
   item.update(v);rows.append(item)
  allrows.append(item)
with (O/'TDM-THREE-ARM.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(cases[0]));w.writeheader();w.writerows(cases)
with (O/'TACTICAL-OPTION-FACTUAL.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
setups=sorted({x['setupId'] for x in cases})
bysetup={s:{r['arm']:r for r in cases if r['setupId']==s} for s in setups}
summary={a:{k:sum(x[k] for x in cases if x['arm']==a) for k in ('kills','deaths','shots','hits','damageDealt','damageTaken','errors')} for a in ('release','observe','randomized')}
ratio=lambda p,q,k:sum(bysetup[s][p][k] for s in q)/max(1,sum(bysetup[s][q2][k] for s in q for q2 in ['observe']))
# bootstrap paired setups. Exclude made-up exact zero deaths in denominator by reporting status honestly.
rng=random.Random(350235);bs=[]
for _ in range(5000):
 sampled=[rng.choice(setups) for _ in setups]
 x={}
 for k in ('kills','deaths'):
  a=sum(bysetup[s]['randomized'][k] for s in sampled)
  b=sum(bysetup[s]['observe'][k] for s in sampled)
  x[k]=(a/b) if b else None
 bs.append(x)
def ci(vals):
 arr=sorted(x for x in vals if x is not None)
 return [round(arr[int(.025*len(arr))],5),round(arr[min(len(arr)-1,int(.975*len(arr)))],5)] if arr else None
# Arm ITT by original random assignment and cluster resampling; complete only is exploratory due right censoring.
byoffer=defaultdict(list)
for r in rows:byoffer[r['setupId']].append(r)
def ht(samples,k,a):
 return sum((r[k]/r['propensity'] if r['assignedArm']==a else -r[k]/r['propensity'] if r['assignedArm']=='incumbent' else 0) for r in samples)/len(samples) if samples else None
itts={}
for a in ('option-a','option-b'):
 vals={k:ht(rows,k,a) for k in ('boundedCombatReturn','ownKills','deathCount','hits','survived')}
 boots=[]
 for _ in range(5000):
  sampled=[x for _ in setups for x in byoffer[rng.choice(setups)]]
  if sampled:boots.append({k:ht(sampled,k,a) for k in vals})
 itts[a]={'estimate':{k:round(v,6) for k,v in vals.items()},'clusterBootstrap95':{k:ci([q[k] for q in boots]) for k in vals}}
report={'schema':'fpsarena-c35ah-independent-analysis-v1','simulatedMinutes':81,'matches':len(cases),'setupClusters':len(setups),
 'matchedTDM':summary,'randomized':{'offers':len(allrows),'completed':len(rows),'rightCensored':len(allrows)-len(rows),
 'byAssignment':{a:{'assigned':sum(x['assignedArm']==a for x in allrows),'completed':sum(x['assignedArm']==a for x in rows),
 'modifiedTicks':sum(x['modifiedTicks'] for x in allrows if x['assignedArm']==a)} for a in ('incumbent','option-a','option-b')},
 'totalModifiedTicks':sum(x['modifiedTicks'] for x in allrows),
 'doseTicksAmongModified':{'mean':round(statistics.mean(x['modifiedTicks'] for x in allrows if x['modifiedTicks']),4) if any(x['modifiedTicks'] for x in allrows) else 0,
 'max':max(x['modifiedTicks'] for x in allrows)},
 'intentToTreatExploratoryCompleteWindowOnly':itts},
 'matchedRandomizedOverObserve95':{k:ci([x[k] for x in bs]) for k in ('kills','deaths')},
 'note':'Never condition ITT primary on realized optionTicks/modifiedTicks: post-assignment compliance is a mediator. Exploratory complete-case bootstrap may be biased by censoring and match carryover; match-cluster ratios preserve paired setups. No policy promotion without held-out match improvement.'}
(O/'INDEPENDENT-ANALYSIS.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
print(json.dumps(report,indent=2))
