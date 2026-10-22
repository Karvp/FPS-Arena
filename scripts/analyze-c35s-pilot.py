#!/usr/bin/env python3
"""Independent C35-S audit: frozen file hashes, matched setups, policy dose and TDM aggregates."""
from pathlib import Path
import hashlib,json,csv,random,statistics,collections
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'reports/c35s'; OUT=BASE/'shotgun-gap-close-36-v2'
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def read(p):return json.loads(Path(p).read_text())
def audit(cohort):
 d=read(cohort/'FROZEN-DESIGN.json');exe=read(cohort/'EXECUTION-AUDIT.json')
 assert exe['registrationSHA256']==sha(cohort/'FROZEN-DESIGN.json')
 # Only enforce current source freeze for v2; v1 source is historical.
 if cohort==OUT:
  for rel,h in d['sourceSHA256'].items():assert sha(ROOT/rel)==h,rel
 by={x['id']:x for x in exe['matches']};assert len(d['cases'])==len(by)
 metrics=collections.defaultdict(lambda:collections.Counter());rows={};rawids=set()
 for case in d['cases']:
  mid=case['id'];e=by[mid];assert e['id']==mid
  for k,h in e['sha256'].items():assert sha(cohort/'matches'/f'{mid}.{k}.json')==h,(mid,k)
  res=read(cohort/'matches'/f'{mid}.result.json')
  assert res['aggregate']['rounds']==1 and res['aggregate']['agentErrors']==0
  assert res['seed']==case['seed'] and res['traineePrimary']==case['gun']
  arm=case['arm'];r=res['aggregate'];rows[mid]=r
  for k in ('kills','deaths','shots','hits','meters','agentErrors'):metrics[arm][k]+=r[k]
  if arm!='release':
   a=read(cohort/'matches'/f'{mid}.approach.json')['traces'][0]
   g=read(cohort/'matches'/f'{mid}.fire.json')['traces'][0]
   c=a['counts'];cg=g['counts'];metrics[arm].update({k:c.get(k,0) for k in ('fireTicks','eligible','modifiedTicks','modifiedNonFireTicks','episodes')})
   assert c['modifiedTicks']==sum(v['ticks'] for v in a['events'])
   assert c['fireChanged']==c['priorityChanged']==0
   assert cg['fireSuppressionTicks']==cg['fireInjectionTicks']==0
   assert cg['serverShots']==r['shots']
   assert g['counts']['incumbentFireTicks']==c['fireTicks']
   ds=read(cohort/'matches'/f'{mid}.dataset.json')
   assert ds and 'records' in ds or ds
 for s in range(12):
  ids=[f'c35s-{s:02d}-{a}' for a in ('release','observe','approach')]
  assert all(mid in rows for mid in ids)
  # Treatment has zero delivered forward ticks: all recorded outcome metrics must match.
  if metrics['approach']['modifiedTicks']==0:
   assert rows[ids[1]]==rows[ids[2]],ids
 return d,metrics,rows
old_d,old_m,old_rows=audit(BASE/'shotgun-approach-36-v1')
d,m,rows=audit(OUT)
assert old_m['approach']['modifiedTicks']==m['approach']['modifiedTicks']==0
assert all(m['observe'][k]==m['approach'][k] for k in ('shots','hits','kills','deaths','meters'))
# Cluster bootstrap by paired setup rather than shots/pellets.
rng=random.Random(35019025)
pairs=[]
for i in range(12):
 sid=f'c35s-{i:02d}'
 pairs.append({a:rows[f'{sid}-{a}']['kills'] for a in ('release','observe','approach')})
samples=[]
for _ in range(5000):
 sub=[pairs[rng.randrange(12)] for __ in range(12)]
 b=sum(x['release'] for x in sub);a=sum(x['observe'] for x in sub)
 if b>0:samples.append(a/b)
samples.sort()
ci=[samples[int(.025*(len(samples)-1))],samples[int(.975*(len(samples)-1))]]
csvfile=OUT/'C35S-TDM-PAIRED.csv'
with csvfile.open('w',newline='') as f:
 wr=csv.writer(f);wr.writerow(['setup','map','seed','lagMs','opponents','arm','kills','deaths','shots','hits','meters','c35sModifiedTicks','c35sEligible'])
 for c in d['cases']:
  mid=c['id'];a=c['arm'];z=read(OUT/'matches'/f'{mid}.approach.json')['traces'][0]['counts'] if a!='release' else None
  row=rows[mid];wr.writerow([c['setupId'],c['map'],c['seed'],c['lagMs'],c['opponents'],a,row['kills'],row['deaths'],row['shots'],row['hits'],row['meters'],z['modifiedTicks'] if z else '',z['eligible'] if z else ''])
report=dict(schema='fpsarena-c35s-audit-v1',preregistrationSHA256=sha(OUT/'FROZEN-DESIGN.json'),
 v1={'matchedGames':len(old_d['cases']),'modifiedTicks':old_m['approach']['modifiedTicks'],
     'allMatchedObserveAndApproachEqual':True},
 v2={'matchedGames':len(d['cases']),'gameplayMinutes':sum(c['seconds'] for c in d['cases'])/60,
 'metrics':{k:dict(v) for k,v in m.items()},'noExposure':m['approach']['modifiedTicks']==0,
 'causalEstimate':'NOT IDENTIFIABLE: 0 actually modified inputs',
 'shadowToReleaseKillsRatio':m['observe']['kills']/m['release']['kills'],
 'pairedSetupBootstrap95':ci,'zeroModifiedInputsNoDifferenceExpected':True},
 productionAgentSHA256=sha(ROOT/'page-agent.js'),
 verdict='REJECT C35S rollout; v1/v2 have zero natural motor exposure; no effect estimate. Existing macro moves during shooting.',
 invariant='shot ledger reconciliation; zero fire suppression/injection; source prereg frozen')
(OUT/'C35S-VALIDATION.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
print(json.dumps(report,indent=2))
