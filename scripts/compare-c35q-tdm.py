#!/usr/bin/env python3
"""Compare C35-P research shadow80 with same-initial-condition original v2.9.11 Release."""
from pathlib import Path
import csv,random,sys,json
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha
SRC=ROOT/'reports/c35q/stress-12-v2';BASE=ROOT/'reports/c35q/release-paired-12-v2'
fields=('kills','deaths','shots','hits','meters','agentErrors')
def main():
 design=load(BASE/'FROZEN-DESIGN.json');exec=load(BASE/'EXECUTION-AUDIT.json');assert exec['registrationSHA256']==sha(BASE/'FROZEN-DESIGN.json')
 for s,h in design['sourceSHA256'].items():assert sha(ROOT/s)==h,s
 cases=load(SRC/'FROZEN-DESIGN.json')['cases'];byid={r['case']:r for r in exec['matches']};assert len(cases)==len(byid)==12
 rows=[];setup={}
 for c in cases:
  p=BASE/'matches'/f'{c["id"]}.release.json';assert sha(p)==byid[c['id']]['sha256']
  b=load(p);q=load(SRC/'matches'/f'{c["id"]}.result.json')
  assert b['seed']==q['seed']==c['seed'] and b['snapshotLagMs']==q['snapshotLagMs']==c['lagMs']
  assert b['classicMaps']==q['classicMaps']==[c['map']] and b['traineePrimary']==q['traineePrimary']==c['gun']
  assert b['aggregate']['agentErrors']==q['aggregate']['agentErrors']==0
  r={'setup':c['setupId'],'map':c['map'],'gun':c['gun'],'seed':c['seed'],'lagMs':c['lagMs']}
  for label,src in [('release',b),('shadow80',q)]:
   for k in fields:r[label+'_'+k]=src['aggregate'][k]
  rows.append(r);setup.setdefault(c['setupId'],[]).append(r)
 sums={label:{k:sum(r[label+'_'+k] for r in rows) for k in fields} for label in ('release','shadow80')}
 rng=random.Random(350017);samples={k:[] for k in ('kills','shots','hits','meters')};keys=sorted(setup)
 for _ in range(4000):
  sample=[r for s in (rng.choice(keys) for __ in keys) for r in setup[s]]
  for k in samples:
   den=sum(r['release_'+k] for r in sample)
   if den:samples[k].append(sum(r['shadow80_'+k] for r in sample)/den)
 ci={}
 for k,v in samples.items():
  v.sort();ci[k]=[v[int(.025*(len(v)-1))],v[int(.975*(len(v)-1))]]
 out={'schema':'fpsarena-c35q-tdm-original-vs-research-comparison-v1','matchedCases':12,'matchedSetups':6,'minutesPerArm':12,
  'baselineLabel':'original v2.9.11 Release / no C35 micro','researchLabel':'same page-agent.js, shadow80 C21/C16 research micro + passive C35Q',
  'designSHA256':sha(BASE/'FROZEN-DESIGN.json'),'sums':sums,'pairedSetupBootstrapRatioCI95':ci,
  'caveat':'This isolates two research configurations under matched initial conditions, not different trained production agents. Matches diverge after actions; 6 setup clusters only.'}
 dump(BASE/'TDM-COMPARISON.json',out)
 csvp=BASE/'FPS-Arena-v2.9.11-C35Q-TDM-Original-vs-Research-12.csv'
 with csvp.open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
 print(json.dumps(out,indent=2));return out
if __name__=='__main__':main()
