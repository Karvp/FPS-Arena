#!/usr/bin/env python3
"""C35-X matched 3-arm TDM, registered setup-level cluster uncertainty."""
from pathlib import Path
import csv,json,random
R=Path(__file__).resolve().parents[1]
O=R/'reports/c35x/expansion-54-v2'
read=lambda p:json.loads(Path(p).read_text())
def dump(p,d):Path(p).write_text(json.dumps(d,indent=2,sort_keys=True)+'\n')
d=read(O/'FROZEN-DESIGN.json');a=read(O/'INDEPENDENT-AUDIT.json')
assert a['status']=='PASS' and len(d['cases'])==54
rows=[];by={}
for c in d['cases']:
 res=read(O/'matches'/(c['id']+'.result.json'))['aggregate']
 row={k:c[k] for k in ('id','setupId','arm','seed','map','gun','lagMs','opponents','seconds')}
 row.update({k:res[k] for k in ('kills','deaths','shots','hits','meters','agentErrors')})
 if c['arm']!='release':
  x=read(O/'matches'/(c['id']+'.random.json'))['traces'][0]
  row.update(offers=x['counts']['offers'],alternatives=x['counts']['executedAlternatives'],completed=x['counts']['completed'],censored=x['counts']['censored'])
 else:row.update(offers=0,alternatives=0,completed=0,censored=0)
 rows.append(row);by.setdefault(c['setupId'],{})[c['arm']]=row
with (O/'TDM-THREE-ARM-54.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,list(rows[0]));w.writeheader();w.writerows(rows)
metrics=('kills','deaths','shots','hits','meters','offers','alternatives')
agg={arm:{m:round(sum(by[s][arm][m] for s in by),4) for m in metrics}for arm in ('release','observe','randomized')}
seeds=list(by);rng=random.Random(35126);bs=[]
for _ in range(5000):
 subset=[by[rng.choice(seeds)]for _ in seeds]
 d={}
 for m in ('kills','deaths','shots','hits'):
  a=sum(x['randomized'][m] for x in subset);b=sum(x['observe'][m] for x in subset)
  d[m]=(a-b,a/b if b else None)
 bs.append(d)
def q(xs,p):
 xs=sorted(x for x in xs if x is not None)
 return round(xs[int(p*(len(xs)-1))],5)if xs else None
ci={m:{'pairedDiff95':[q([b[m][0]for b in bs],.025),q([b[m][0]for b in bs],.975)],
 'ratio95':[q([b[m][1]for b in bs],.025),q([b[m][1]for b in bs],.975)]}for m in ('kills','deaths','shots','hits')}
weapon={gun:{arm:{m:sum(r[m] for r in rows if r['gun']==gun and r['arm']==arm)
 for m in ('kills','deaths','shots','alternatives')}for arm in ('release','observe','randomized')}
 for gun in sorted(set(x['gun']for x in rows))}
summary=dict(schema='fpsarena-c35x-three-arm-matched-v2',setupCount=len(by),matchCount=len(rows),simulationMinutes=sum(x['seconds'] for x in rows)/60,
 aggregate=agg,bootstrap5000BySetup=ci,byWeapon=weapon,
 oneTickITE='Random assignment of locally safety-eligible actions; extrapolation only on empirical eligible subset',
 verdict='NO MOTOR PROMOTION FROM PILOT; verify models out-of-setup, no guaranteed causal Q')
dump(O/'TDM-ANALYSIS.json',summary)
print(json.dumps(summary,indent=2))
