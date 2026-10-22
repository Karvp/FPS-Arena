#!/usr/bin/env python3
"""Preregistered matched TDM aggregates and exploratory physical mediator audit.
True independent clusters are SETUPS. Offer-level physical measures are downstream of
assignment and must not be used to filter randomized units or identify causal effects.
"""
from pathlib import Path
from collections import Counter,defaultdict
import json,random,csv,statistics
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ai/frozen-72-v5'
def read(p):return json.loads(Path(p).read_text())
def file(c,k):return read(O/'matches'/f'{c["id"]}.{k}.json')
d=read(O/'FROZEN-DESIGN.json');cases=[];opts=[]
for c in d['cases']:
 r=file(c,'result')['results'][0]
 line={k:c[k] for k in ['id','setupId','gun','arm','seed','map','lagMs','opponents']}
 line.update({k:r.get(k) for k in ['kills','deaths','shots','hits','damageDealt','damageTaken','errors','distance']})
 cases.append(line)
 if c['arm']!='randomized':continue
 o=file(c,'option')['traces'][0];p=file(c,'physical')['traces'][0]
 for a,m in zip(o['rows'],p['rows'],strict=True):
  x={k:c[k] for k in ['setupId','gun','map','seed','opponents']}
  x.update(index=a['index'],assignedArm=a['assignedArm'],propensity=a['propensity'],complete=a['factual']['complete'],
   interrupted=a['interruptions']>0,modifiedTicks=a['modifiedTicks'],optionTicks=a['optionTicks'])
  x.update({k:v for k,v in m['measure'].items()})
  if a['factual']['complete']:
   f=a['factual'];x.update({k:f[k] for k in ['ownKills','deathCount','damageDealt','damageTaken','hits','shots','survived']})
   x['boundedReturn']=(min(f['damageDealt'],300)-min(f['damageTaken'],300)+100*(f['ownKills']-f['deathCount']))/100
  opts.append(x)
def csvout(path,rows):
 with (O/path).open('w',newline='') as f:
  fields=[]
  for r in rows:
   for k in r: 
    if k not in fields: fields.append(k)
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
csvout('TDM-THREE-ARM.csv',cases);csvout('TACTICAL-PHYSICAL-FACTUAL.csv',opts)
setup=sorted({c['setupId'] for c in cases});by={s:{r['arm']:r for r in cases if r['setupId']==s} for s in setup}
summary={a:{k:sum(r[k] for r in cases if r['arm']==a) for k in ['kills','deaths','shots','hits','errors','distance']} for a in ['release','observe','randomized']}
rng=random.Random(350241);bootstrap=[]
for _ in range(5000):
 sampled=[rng.choice(setup) for _ in setup]
 dct={}
 for k in ['kills','deaths','distance']:
  den=sum(by[s]['observe'][k] for s in sampled);dct[k]=sum(by[s]['randomized'][k] for s in sampled)/den if den>0 else None
 bootstrap.append(dct)
def ci(arr):
 a=sorted(x for x in arr if x is not None);return [round(a[int(.025*len(a))],4),round(a[min(len(a)-1,int(.975*len(a)))],4)] if a else None
arms={a:[x for x in opts if x['assignedArm']==a] for a in ['incumbent','option-a','option-b']}
byweapon={w:{'offers':sum(o['gun']==w for o in opts),'modifiedCommandTicks':sum(o['modifiedTicks'] for o in opts if o['gun']==w),
 'actualMovingTicksWithModifiedCommand':sum(o['modifiedRealizedMovingTicks'] for o in opts if o['gun']==w),
 'travelMetersWhileModifiedCommand':round(sum(o['modifiedTravelMeters'] for o in opts if o['gun']==w),3),
 'interruptions':sum(o['interrupted'] for o in opts if o['gun']==w)} for w in sorted({x['gun'] for x in opts})}
report={'schema':'fpsarena-c35ai-physical-tactical-analysis-v1','matches':len(cases),'setupClusters':len(setup),'simulatedMinutes':len(cases)*1.5,
 'matchedTDM':summary,'setupBootstrap95RatioRandomizedToObserve':{k:ci([b[k] for b in bootstrap]) for k in ['kills','deaths','distance']},
 'options':{'assigned':len(opts),'complete':sum(x['complete'] for x in opts),'censored':sum(not x['complete'] for x in opts),
  'assignmentCounts':{a:len(rows) for a,rows in arms.items()},
  'modifiedCommandTicks':sum(x['modifiedTicks'] for x in opts),
  'actualMovingTicksWithModifiedCommand':sum(x['modifiedRealizedMovingTicks'] for x in opts),
  'distanceMetersWhileModifiedCommand':round(sum(x['modifiedTravelMeters'] for x in opts),3),
  'stalledMotorTicksWithinOption':sum(x['stalledMotorTicks'] for x in opts),
  'momentumTravelMetersWithinOption':round(sum(x['momentumTravelMeters'] for x in opts),3),
  'interruptedOffers':sum(x['interrupted'] for x in opts),
  'byWeapon':byweapon},
 'notes':['Physical motion is post-assignment mediator, not the randomized treatment; do NOT condition IPS on changed/moved/stalled.',
  'Option-level results include interruptions under original assignment (ITT).',
  'Matched seeds do not imply identical future trajectories after randomized options.',
  'Completed window estimates are exploratory; end-game right censoring reported, not zero-filled.']}
(O/'INDEPENDENT-ANALYSIS.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
