#!/usr/bin/env python3
"""Supplemental same-seed three-arm TDM comparison, with source/data integrity."""
import json,csv,hashlib,random,collections
from pathlib import Path
R=Path(__file__).resolve().parents[1];A=R/'reports/c35v/factual-value-24-v1';B=R/'reports/c35v/release-baseline-12'
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
 a=read(A/'FROZEN-DESIGN.json');b=read(B/'FROZEN-DESIGN.json');e=read(B/'EXECUTION-AUDIT.json');assert e['registrationSHA256']==sha(B/'FROZEN-DESIGN.json')
 assert b['parentRegistration']==sha(A/'FROZEN-DESIGN.json')
 for k,v in b['sourceSHA256'].items():assert sha(R/k)==v,k
 assert len(e['matches'])==12 and len(b['cases'])==12
 stats=collections.defaultdict(collections.Counter);by={};csvrows=[]
 for c in a['cases']+b['cases']:
  p=(B if c['arm']=='release' else A)/'matches'/(c['id']+'.result.json')
  if c['arm']=='release':
   found=next(x for x in e['matches'] if x['id']==c['id']);assert sha(p)==found['sha256']
  v=read(p);z=v['aggregate'];assert z['agentErrors']==0 and v['seed']==c['seed'] and v['traineePrimary']==c['gun'] and v['snapshotLagMs']==c['lagMs']
  row={**c,**{k:z[k] for k in ['kills','deaths','shots','hits','meters','agentErrors']}}
  by.setdefault(c['setupId'],{})[c['arm']]=row
  stats[c['arm']].update({k:row[k] for k in ['kills','deaths','shots','hits','agentErrors']});csvrows.append(row)
 assert len(by)==12 and all(set(v)=={'release','observe','balance'} for v in by.values())
 ci={};rng=random.Random(35210213);samples=list(by.values())
 for arm in ['observe','balance']:
  ci[arm]={}
  for k in ['kills','deaths','shots']:
   vals=[]
   for _ in range(4000):
    pick=rng.choices(samples,k=len(samples));den=sum(z['release'][k] for z in pick)
    if den:vals.append(sum(z[arm][k] for z in pick)/den)
   vals.sort();ci[arm][k]=[vals[int(.025*(len(vals)-1))],vals[int(.975*(len(vals)-1))]]
 out={'schema':'fpsarena-c35v-release-supplemental-analysis-v1','totalMatches':36,'totalSimulatedMinutes':45,
  'sameAgentAndEngine':True,'setups':12,'registrationSHA256':e['registrationSHA256'],
  'totals':{k:dict(v) for k,v in stats.items()},'bootstrap95ResearchOverRelease':ci,
  'note':'Observe/balance are shadow80 research arms, release has NO research flags. C35V observer is passive and cannot explain treatment differences. Paired cluster intervals exploratory.'}
 (B/'C35V-THREE-ARM-ANALYSIS.json').write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
 fields=['setupId','arm','map','gun','lagMs','seed','opponents','seconds','kills','deaths','shots','hits','meters','agentErrors']
 with (B/'C35V-TDM-THREE-ARM.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows({k:r[k] for k in fields} for r in csvrows)
 print(json.dumps(out,indent=2))
if __name__=='__main__':main()
