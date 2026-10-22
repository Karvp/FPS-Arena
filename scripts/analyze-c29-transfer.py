#!/usr/bin/env python3
"""C29 preregistered model-transfer audit. Match is independent bootstrap unit.
No claim about neural combat efficacy if compatibility gate fails.
"""
from collections import Counter,defaultdict
from pathlib import Path
import hashlib,json,random,statistics,sys
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'reports/c29/long-study'
def sha(data):return hashlib.sha256(data).hexdigest()
def read(p):return json.loads(p.read_text())
def audit(base=BASE):
 plan=read(base/'PRE-REGISTERED-PLAN.json')
 assert plan['schema']=='fpsarena-c29-long-gated-protocol-v1'
 copy={k:v for k,v in plan.items() if k!='registrationSHA256'}
 assert sha(json.dumps(copy,sort_keys=True,separators=(',',':')).encode())==plan['registrationSHA256']
 rows=[]
 seen=set()
 for spec in plan['pilot']:
  p=base/(spec['id']+'.neural.run.json');q=base/(spec['id']+'.neural.dataset.json')
  if not p.exists() or not q.exists():raise ValueError('pilot missing result/dataset: '+spec['id'])
  run=read(p);ds=read(q)
  if len(run['results'])!=1 or len(ds['matches'])!=1:raise ValueError('incomplete episode: '+spec['id'])
  r=run['results'][0];m=ds['matches'][0];meta=m['metadata']
  if spec['seed'] in seen:raise ValueError('duplicate seed')
  seen.add(spec['seed'])
  expected=spec
  if r['seed']!=expected['seed'] or meta['seed']!=expected['seed'] or r['mode']!='tdm' or meta['map']!=spec['map'] or \
   r['primaryLoadout']!=spec['weapon'] or r['opponentPolicy']!=spec['opponent'] or \
   run['snapshotLagMs']!=spec['lag'] or run['seconds']!=spec['seconds'] or \
   r['c29']['policy']!='neural' or meta['c29']['policy']!='neural' or r['errors']!=0:
   raise ValueError('mismatched result/dataset metadata: '+spec['id'])
  c=r['c29']['diagnostics'];offers=m['diagnostics']['eligibleOffers'];inferences=c['inferenceCalls']
  selections=c['selectedCounts'];covered=selections['micro-left']+selections['micro-right']
  fallback=sum(c['fallbacks'].values())
  if inferences!=offers or covered+selections['baseline']!=offers or fallback>offers or \
   fallback+covered>offers or m['diagnostics']['interventionTicks']<covered:
   raise ValueError('intervention ledger mismatch: '+spec['id'])
  if r['c29']['modelSourceSHA256']!=meta['c29']['c28FrozenSourceSHA256']:
   raise ValueError('frozen model provenance mismatch')
  raw=(ROOT/'reports/c28/micro-v1/FROZEN-POLICY.json').read_bytes()
  if sha(raw)!=r['c29']['modelSourceSHA256']:
   raise ValueError('C28 freeze changed')
  rows.append(dict(id=spec['id'],seed=spec['seed'],map=spec['map'],weapon=spec['weapon'],opponent=spec['opponent'],lag=spec['lag'],
   offers=offers,covered=covered,selected=selections,fallbacks=c['fallbacks'],errors=r['errors'],
   kills=r['kills'],deaths=r['deaths'],damageTaken=r['damageTaken'],shots=r['shots']))
 totals=Counter();fallbacks=Counter();selected=Counter();
 for x in rows:
  totals['offers']+=x['offers'];totals['covered']+=x['covered'];totals['errors']+=x['errors']
  fallbacks.update(x['fallbacks']);selected.update(x['selected'])
 if totals['offers']==0:raise ValueError('no opportunities')
 rng=random.Random(29002929);ratios=[];n=len(rows)
 for _ in range(6000):
  draw=[rows[rng.randrange(n)] for _ in range(n)];o=sum(x['offers'] for x in draw)
  if o:ratios.append(sum(x['covered'] for x in draw)/o)
 ratios.sort()
 ci=[round(ratios[int((len(ratios)-1)*q)],6) for q in [.025,.975]]
 def slices(field):
  out=[]
  for k in sorted({r[field] for r in rows}):
   sub=[r for r in rows if r[field]==k];o=sum(r['offers'] for r in sub);c=sum(r['covered'] for r in sub)
   out.append({'name':k,'matches':len(sub),'offers':o,'covered':c,'coverage':round(c/o,6) if o else None})
  return out
 gate=plan['thresholds'];pass_=(n>=gate['pilotMinimumMatchedSeeds'] and totals['offers']>=gate['pilotMinimumOffers'] and
                   totals['covered']/totals['offers']>=gate['minimumNeuralCoverage'] and not totals['errors'])
 report=dict(schema='fpsarena-c29-transfer-gate-analysis-v1',registrationSHA256=plan['registrationSHA256'],
  frozenSourceSHA256=sha((ROOT/'reports/c28/micro-v1/FROZEN-POLICY.json').read_bytes()),
  cohort={'matches':n,'secondsPerMatch':105,'simulatedMinutes':round(n*105/60,2),'seedsIndependent':len({r['seed'] for r in rows})},
  offers=totals['offers'],neuralActuatedOffers=totals['covered'],coverage=round(totals['covered']/totals['offers'],6),
  matchClusterBootstrap95=ci,bootstrapReplicates=6000,priorThreshold=gate['minimumNeuralCoverage'],
  fallbackReasons=dict(fallbacks),selectionCounts=dict(selected),matchesWithoutOffers=sum(x['offers']==0 for x in rows),
  matchesWithActualInterventions=sum(x['covered']>0 for x in rows),
  groupSummaries={key:slices(key) for key in ['map','weapon','opponent','lag']},
  transferGate='PASS' if pass_ else 'FAIL',
  efficacyFullMatchClaim='NOT EVALUATED: transfer gate must pass before full three-arm study',
  causalEvidence=False,neuralProductionPromoted=False,
  limitation='C28 scripted motion and offset input supports differ from real delayed multiplayer snapshots; proxy yaw is not instantaneous aim',
  nextResearch='Redefine target relative geometry and OOD-safe feature support using client snapshots, regenerate micro-training corpus with wall/latency conditions; test new seeds, never tune on C28 holdout')
 dest=base/'TRANSFER-AUDIT.json';dest.write_text(json.dumps(report,indent=2)+'\n')
 return report
if __name__=='__main__':
 print(json.dumps(audit(),indent=2))
