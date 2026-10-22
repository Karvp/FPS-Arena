#!/usr/bin/env python3
"""Paired setup and randomized-offer cluster bootstrap; no causal overclaims."""
from pathlib import Path
from collections import defaultdict
import json,random,statistics,csv
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ab/matched-72'
def read(p):return json.loads(Path(p).read_text())
def q(v):return sorted(v)
def ci(v):
 x=q(v);return [round(x[int(.025*(len(x)-1))],6),round(x[int(.975*(len(x)-1))],6)]
def main():
 d=read(O/'FROZEN-DESIGN.json');audit=read(O/'INDEPENDENT-AUDIT.json');rand=random.Random(350211)
 data={};guns={}
 for c in d['cases']:
  a=read(O/'matches'/(c['id']+'.result.json'))['aggregate'];data[(c['setupId'],c['arm'])]=a;guns[c['setupId']]=c['gun']
 keys=sorted(guns);rows=[]
 for s in keys:
  row=dict(setup=s,gun=guns[s]);row.update({f'{arm}_{k}':data[(s,arm)][k] for arm in ['release','observe','randomized'] for k in ['kills','deaths','shots','hits']});rows.append(row)
 with (O/'MATCHED-RESULTS.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
 def ratio(sample,k='kills'):
  ob=sum(data[(s,'observe')][k] for s in sample);tr=sum(data[(s,'randomized')][k] for s in sample);return tr/ob if ob else None
 draws=[ratio([rand.choice(keys) for _ in keys]) for i in range(6000)];draws=[v for v in draws if v is not None]
 samples=audit['offers'];byaxis={a:[v for v in samples if v['axis']==a] for a in ['ads','hold']}
 offers={};boot={}
 for axis,x in byaxis.items():
  arms={arm:[r for r in x if r['arm']==arm] for arm in ['control','treatment']}
  offers[axis]={arm:dict(offers=len(a),confirmedShots=sum(z['shot'] for z in a),hitPerOfferedTick=(sum(z['hit'] for z in a)/len(a) if a else None),hits=sum(z['hit'] for z in a)) for arm,a in arms.items()}
  setups=sorted({v['setupId'] for v in x});differences=[]
  for i in range(6000):
   cluster=[v for s in (rand.choice(setups) for _ in setups) for v in x if v['setupId']==s]
   treat=[z for z in cluster if z['arm']=='treatment'];ctrl=[z for z in cluster if z['arm']=='control']
   if treat and ctrl:differences.append(sum(z['hit'] for z in treat)/len(treat)-sum(z['hit'] for z in ctrl)/len(ctrl))
  boot[axis]=dict(setupCount=len(setups),nBoot=len(differences),ITT_hitPerOfferedTickDifference=(offers[axis]['treatment']['hitPerOfferedTick']-offers[axis]['control']['hitPerOfferedTick'] if arms['control'] and arms['treatment'] else None),clusterBootstrapCI95=ci(differences) if differences else None)
 bygun=defaultdict(lambda:dict(setups=set(),control=0,treated=0,offers=0))
 for v in samples:
  x=bygun[v['weapon']];x['setups'].add(v['setupId']);x['offers']+=1;x['treated']+=+(v['arm']=='treatment');x['control']+=+(v['arm']=='control')
 bygun={g:{**{k:v for k,v in x.items() if k!='setups'},'setups':len(x['setups'])} for g,x in bygun.items()}
 result=dict(schema='fpsarena-c35ab-analysis-v1',status='COMPLETE',setupCount=len(keys),gameMinutes=72*90/60,
  byArm=audit['byArm'],killsRandomVsObserve=dict(ratio=ratio(keys),pairedSetupBootstrapCI95=ci(draws)),
  offerCount=len(samples),offersByAxis=offers,axisITT=boot,byWeapon=bygun,
  caveat='One-tick ADS-on vs control and motor-hold vs control assignments are randomized only within eligible fire-intent offers; possible sequential effects; report shot incidence, not conditional-on-fired causal accuracy; pellets clustered within shots, setups clustered across samples; no Q model or production promotion.')
 (O/'ANALYSIS.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
