#!/usr/bin/env python3
"""C35-AJ preregistered new-cohort matched TDM, physical mediators descriptive only."""
from pathlib import Path
from collections import Counter,defaultdict
import csv,json,random,statistics
R=Path(__file__).resolve().parents[1];O=R/'reports/c35aj/prospective-108-v1'
def get(p):return json.loads(Path(p).read_text())
d=get(O/'FROZEN-DESIGN.json');cases=[];options=[]
for c in d['cases']:
 result=get(O/'matches'/f'{c["id"]}.result.json')['results'][0]
 r={k:c[k] for k in ['id','setupId','gun','map','lagMs','opponents','arm','seed']}
 r.update({k:result.get(k) for k in ['kills','deaths','shots','hits','damageDealt','damageTaken','distance','errors']});cases.append(r)
 if c['arm']!='randomized':continue
 option=get(O/'matches'/f'{c["id"]}.option.json')['traces'][0]
 phy=get(O/'matches'/f'{c["id"]}.physical.json')['traces'][0]
 for a,p in zip(option['rows'],phy['rows'],strict=True):
  assert a['index']==p['index'] and p['measure']['modifiedCommandTicks']==a['modifiedTicks']
  x={k:c[k] for k in ['setupId','gun','map','lagMs','opponents','seed']}
  x.update(index=a['index'],arm=a['assignedArm'],propensity=a['propensity'],complete=a['factual']['complete'],
           interrupted=a['interruptions']>0,modifiedTicks=a['modifiedTicks'],physicalMeters=p['measure']['modifiedTravelMeters'],
           stalledMotorTicks=p['measure']['stalledMotorTicks'],momentumTravelMeters=p['measure']['momentumTravelMeters'])
  if a['factual']['complete']:
   f=a['factual'];x.update({k:f[k] for k in ['ownKills','deathCount','damageDealt','damageTaken','shots','hits','survived']})
  options.append(x)
def output_csv(name,entries):
 keys=[]
 for x in entries:
  for k in x:
   if k not in keys:keys.append(k)
 with (O/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(entries)
output_csv('TDM-THREE-ARM-108.csv',cases);output_csv('TACTICAL-PHYSICAL-NEW-FACTUAL.csv',options)
setups=sorted({r['setupId'] for r in cases});by={sid:{r['arm']:r for r in cases if r['setupId']==sid} for sid in setups}
assert len(setups)==36 and all(len(v)==3 for v in by.values())
summary={arm:{metric:sum(r[metric] for r in cases if r['arm']==arm) for metric in ['kills','deaths','shots','hits','damageDealt','damageTaken','distance','errors']} for arm in ['release','observe','randomized']}
rng=random.Random(350226)
def quantile(a):
 a=sorted(a);return [round(a[int(.025*len(a))],5),round(a[min(len(a)-1,int(.975*len(a)))],5)]
bootstrap={}
for metric in ['kills','deaths','shots','hits','distance']:
 samples=[]
 for _ in range(5000):
  picks=[rng.choice(setups) for _ in setups];num=sum(by[s]['randomized'][metric] for s in picks);den=sum(by[s]['observe'][metric] for s in picks)
  if den>0:samples.append(num/den)
 bootstrap[metric]=quantile(samples)
bygun={gun:{arm:{m:sum(x[m] for x in cases if x['gun']==gun and x['arm']==arm) for m in ['kills','deaths','shots','hits']} for arm in ['release','observe','randomized']} for gun in sorted({c['gun'] for c in cases})}
report={'schema':'fpsarena-c35aj-prospective-matched-tdm-v1','matches':len(cases),'independentSetups':len(setups),'simulatedMinutes':len(cases)*1.5,'totals':summary,
        'randomizedToObserveSetupBootstrap95Ratio':bootstrap,'weapons':bygun,
        'optionOffers':len(options),'assignmentCounts':dict(Counter(r['arm'] for r in options)),
        'completed':sum(x['complete'] for x in options),'censored':sum(not x['complete'] for x in options),
        'modifiedMotorTicks':sum(x['modifiedTicks'] for x in options),'metersObservedDuringModification':round(sum(x['physicalMeters'] for x in options),3),
        'interruptedOffers':sum(x['interrupted'] for x in options),'modifiedByGun':{g:sum(x['modifiedTicks'] for x in options if x['gun']==g) for g in bygun},
        'limitations':['Three-arm TDM compared by setup cluster (paired seed), not option-level independence',
                       'Modified command displacement is post-treatment mediator, not incremental causal meters',
                       'Do not condition randomized ITT estimates on interruptions/motion',
                       'Observation randomizes bounded option class, not long-term full policy']}
(O/'INDEPENDENT-MATCH-ANALYSIS.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
