#!/usr/bin/env python3
"""Independent C35-G tick-ledger reconciliation + paired cluster bootstrap."""
import hashlib,json,random,math,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/c35g/heldout-12-pairs'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def mean(xs):return sum(xs)/len(xs) if xs else None
def pct(xs,p):
 xs=sorted(xs);return xs[int((len(xs)-1)*p)] if xs else None
def hash32(x):
 x=(x+0x9e3779b9)&0xffffffff
 x=((x^(x>>16))*0x85ebca6b)&0xffffffff
 x=((x^(x>>13))*0xc2b2ae35)&0xffffffff
 return (x^(x>>16))&0xffffffff
def assignment(seed,n):
 h=hash32((seed^((n*0x517cc1b7)&0xffffffff)^0xc21f7a39)&0xffffffff)
 return ['baseline','micro-left','micro-right'][min(2,h*3//4294967296)]
def load(c):
 name=OUT/'matches'/c['id'];paths={k:Path(str(name)+'.'+k+'.json') for k in ['trace','result','dataset']}
 t=json.loads(paths['trace'].read_text())['traces'][0];g=json.loads(paths['result'].read_text())
 raw=json.loads(paths['dataset'].read_text());d=raw['matches'][0];rows=t['rows'];s=t['counts']
 if raw['registrationSHA256']!=sha(OUT/'FROZEN-DESIGN.json'):raise ValueError('bad registration')
 if len(d['offers'])!=len(d['c35c']['offers']):raise ValueError('offer ledger mismatch')
 linked={r['attemptId'] for r in d['c35c']['preoffers'] if r['eligible']}
 for i,o in enumerate(d['offers'],1):
  if o['assignedAction']!=assignment(c['seed'],i) or o['propensity']!=1/3:
   raise ValueError('C21 assignment mismatch '+c['id'])
  if o['candidateSet']!=['baseline','micro-left','micro-right'] or not o['c35c']['predecisionOnly']:
   raise ValueError('C16 eligibility mismatch '+c['id'])
  if o['c35c']['attemptId'] not in linked:raise ValueError('unlinked assignment '+c['id'])
 if d['diagnostics']['interventionTicks']!=sum(o['executedTicks'] for o in d['offers'] if o['assignedAction']!='baseline'):
  raise ValueError('delivered tick count mismatch')
 if len(rows)!=s['totalTicks'] or s['totalTicks']<=0:raise ValueError('bad rows '+c['id'])
 if s['serverShots']!=sum(r['shots'] for r in rows) or s['serverShots']!=g['aggregate']['shots']:
  raise ValueError('bad shots '+c['id'])
 for name,field in [('incumbentFireTicks','of'),('appliedFireTicks','af'),
  ('incumbentMotionTicks','om'),('appliedMotionTicks','am'),('motorActiveTicks','m'),
  ('readyProxyTicks','ready'),('movementModifiedTicks','dm')]:
  if s[name]!=sum(r[field] for r in rows):raise ValueError('tick field corruption '+c['id']+name)
 if s['fireSuppressionTicks']!=sum(r['of'] and not r['af'] for r in rows):raise ValueError('suppression mismatch')
 if s['fireInjectionTicks']!=sum(r['af'] and not r['of'] for r in rows):raise ValueError('injection mismatch')
 if (s['fireSuppressionTicks'] or s['fireInjectionTicks'] or g['aggregate']['agentErrors']):
  raise ValueError('C16 fire preservation failure')
 if d['metadata']['policy']!=c['policy'] or g['aggregate']['rounds']!=1:raise ValueError('policy mismatch')
 return {**c,'counts':s,'shots':s['serverShots'],'kills':g['aggregate']['kills'],
  'microTicks':d['diagnostics']['interventionTicks'],'attempts':d['c35c']['diagnostics']['attempts']}
def pooled(rows,k):return sum(r['counts'][k] for r in rows)/sum(r['counts']['totalTicks'] for r in rows)*3600
if __name__=='__main__':
 registered=json.loads((OUT/'FROZEN-DESIGN.json').read_text());audit=json.loads((OUT/'EXECUTION-AUDIT.json').read_text())
 if sha(OUT/'FROZEN-DESIGN.json')!=audit['registrationSHA256']:raise ValueError('registration hash changed')
 for p,h in registered['sourceSHA256'].items():
  if sha(ROOT/p)!=h:raise ValueError('source hash drift '+p)
 cases=registered['cases'];rows={}
 for c in cases:
  match=load(c);key=(c['setupId'],c['policy']);rows[key]=match
  item=next(x for x in audit['results'] if x['id']==c['id'])
  for k in ['trace','result','dataset']:
   if sha(OUT/'matches'/(c['id']+'.'+k+'.json'))!=item[k+'SHA256']:raise ValueError('dataset SHA mismatch '+c['id'])
 ids=sorted(set(c['setupId'] for c in cases))
 for i in ids:
  if (i,'shadow80') not in rows or (i,'stagger80') not in rows:raise ValueError('missing pair '+i)
 arms={k:[rows[(i,k)] for i in ids] for k in ['shadow80','stagger80']}
 metrics=['serverShots','incumbentFireTicks','appliedFireTicks','fireAndMotionTicks','readyProxyTicks','readyWithoutAppliedFireTicks','motorActiveTicks','motorWithAppliedFireTicks','movementModifiedTicks','fireSuppressionTicks']
 output={'schema':'fpsarena-c35g-fire-motor-observational-results-v1','registrationSHA256':audit['registrationSHA256'],
  'matches':len(cases),'matchedSetups':len(ids),'minutesSimulated':sum(c['seconds'] for c in cases)/60,
  'status':'PASSIVE_MEASUREMENT_ONLY_NO_PROMOTION','C21C16Audit':'PASS',
  'ratesPerMinute':{k:{m:pooled(v,m) for m in metrics} for k,v in arms.items()},
  'totals':{k:{m:sum(r['counts'][m] for r in v) for m in metrics} | {'kills':sum(r['kills'] for r in v),'attempts':sum(r['attempts'] for r in v),'microTicks':sum(r['microTicks'] for r in v)} for k,v in arms.items()},
  'setupRows':[{p:{'setupId':i,'shots':rows[(i,p)]['shots'],'fireTicks':rows[(i,p)]['counts']['incumbentFireTicks'],
      'readyProxyTicks':rows[(i,p)]['counts']['readyProxyTicks'],'microTicks':rows[(i,p)]['microTicks']} for p in arms} for i in ids],
  'limitations':['weapon readiness proxy excludes target geometry / enemy visibility / counterfactual shot','stagger changes future game trajectories; differences do not identify direct motor opportunity cost','sequential interference, 12 match clusters and weak hostile-hit density']}
 rng=random.Random(35610001)
 def ratio(sample,field):
  x=sum(rows[(i,'stagger80')]['counts'][field] for i in sample)
  y=sum(rows[(i,'shadow80')]['counts'][field] for i in sample)
  return x/y if y>0 else None
 for m in ['serverShots','incumbentFireTicks','readyProxyTicks','fireAndMotionTicks']:
  draws=[ratio([rng.choice(ids) for _ in ids],m) for _ in range(5000)]
  draws=[v for v in draws if v is not None]
  output.setdefault('setupClusterBootstrap5000',{})[m]={'ratio':ratio(ids,m),
   'percentile95':[pct(draws,.025),pct(draws,.975)],'oneSided5th':pct(draws,.05)}
 (OUT/'RESULTS.json').write_text(json.dumps(output,indent=2,sort_keys=True)+'\n')
 print('C35G VERIFIED',len(cases),'matches',len(ids),'pairs')
 print('Shots/min',output['ratesPerMinute']['shadow80']['serverShots'],output['ratesPerMinute']['stagger80']['serverShots'])
 print('Original fire inputs/min',output['ratesPerMinute']['shadow80']['incumbentFireTicks'],output['ratesPerMinute']['stagger80']['incumbentFireTicks'])
 print('Original fire suppression',output['totals']['shadow80']['fireSuppressionTicks'],output['totals']['stagger80']['fireSuppressionTicks'])
