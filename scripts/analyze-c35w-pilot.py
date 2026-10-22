#!/usr/bin/env python3
"""Registered setup-cluster analysis. No pellet/window pseudo-independent CI."""
from pathlib import Path
import csv,json,random,statistics
R=Path(__file__).resolve().parents[1];O=R/'reports/c35w/randomized-motor-36-v1'
read=lambda p:json.loads(Path(p).read_text())
def dump(p,x):Path(p).write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
d=read(O/'FROZEN-DESIGN.json');aud=read(O/'INDEPENDENT-AUDIT.json')
assert aud['status'].startswith('PASS')
by={};rows=[]
for c in d['cases']:
 r=read(O/'matches'/(c['id']+'.result.json'))['aggregate']
 count={k:r[k] for k in ['kills','deaths','shots','hits','meters','agentErrors']}
 if c['arm']!='release':
  w=read(O/'matches'/(c['id']+'.random.json'))['traces'][0]
  count['randomizedOffers']=w['counts']['offers'];count['modifiedTicks']=w['counts']['modifiedTicks']
  count['completedFactual']=w['counts']['completed'];count['censored']=w['counts']['censored']
 else:count.update(randomizedOffers=0,modifiedTicks=0,completedFactual=0,censored=0)
 row={k:c[k] for k in ['id','setupId','arm','seed','map','gun','lagMs','opponents','seconds']}|count
 rows.append(row);by.setdefault(c['setupId'],{})[c['arm']]=row
cols=list(rows[0]);
with (O/'TDM-THREE-ARM-36.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,cols);w.writeheader();w.writerows(rows)
metric=['kills','deaths','shots','hits','meters','agentErrors','randomizedOffers','modifiedTicks']
agg={arm:{m:round(sum(by[k][arm][m] for k in by),4) for m in metric} for arm in ['release','observe','randomized']}
clusters=list(by);RNG=random.Random(35023)
bs=[]
for _ in range(5000):
 pool=[by[RNG.choice(clusters)] for _ in clusters];x={}
 for m in ['kills','deaths','shots','hits']:
  a=sum(p['randomized'][m] for p in pool);b=sum(p['observe'][m] for p in pool)
  x[m]={'diff':a-b,'ratio':a/b if b else None}
 bs.append(x)
def percentile(xs,p):
 xs=sorted(x for x in xs if x is not None)
 if not xs:return None
 return round(xs[int((len(xs)-1)*p)],4)
intervals={m:{'pairedDiff95':[percentile([b[m]['diff'] for b in bs],.025),percentile([b[m]['diff'] for b in bs],.975)],
 'ratio95':[percentile([b[m]['ratio'] for b in bs],.025),percentile([b[m]['ratio'] for b in bs],.975)]} for m in ['kills','deaths','shots','hits']}
# ITT experimental windows; no unconditional Q(s,a) claim.
windows=[]
for c in d['cases']:
 if c['arm']!='randomized':continue
 data=read(O/'matches'/(c['id']+'.random.json'))['traces'][0]
 for e in data['rows']:
  windows.append({'setup':c['setupId'],'arm':e['assignedArm'],'propensity':e['propensity'],
   'hitWindow':e['outcome']['hitWindow'] if e['outcome'] else None,'censored':e['censored']})
armStats={}
for arm in ['control','alternative-a','alternative-b']:
 pool=[x for x in windows if x['arm']==arm];done=[x for x in pool if x['hitWindow'] is not None]
 armStats[arm]={'assigned':len(pool),'completed':len(done),'censored':len(pool)-len(done),
  'hitWindows':sum(x['hitWindow'] for x in done),'rate':round(sum(x['hitWindow'] for x in done)/len(done),5) if done else None,
  'assignmentPropensity':{'control':.8,'alternative-a':.1,'alternative-b':.1}[arm]}
# Bootstrap difference in observed randomized-window hit rate, by setup.
bysetup={s:[x for x in windows if x['setup']==s] for s in clusters}
B=[]
for _ in range(5000):
 pool=[x for s in [RNG.choice(clusters) for _ in clusters] for x in bysetup[s] if x['hitWindow'] is not None]
 ctl=[x['hitWindow'] for x in pool if x['arm']=='control']
 trt=[x['hitWindow'] for x in pool if x['arm']!='control']
 if ctl and trt:B.append(sum(trt)/len(trt)-sum(ctl)/len(ctl))
summary={'schema':'fpsarena-c35w-analysis-v1','matchCount':len(rows),'setupCount':len(by),
 'minutesSimulated':sum(x['seconds'] for x in rows)/60,'aggregate':agg,'pairedClusterBootstrap5000':intervals,
 'windowArmStats':armStats,'alternativeMinusControlHitWindowRate95':[
 percentile(B,.025),percentile(B,.975)],'analysisUnit':'12 setup-clusters',
 'interpretation':'short randomized one-tick ITT motor experiment only; gameplay correlated and trial can affect subsequent trials; not Q(s,a)',
 'promotion':'REJECT PENDING LARGER INDEPENDENT COHORT AND SAFETY ANALYSIS'}
dump(O/'ANALYSIS.json',summary);print(json.dumps(summary,indent=2))
