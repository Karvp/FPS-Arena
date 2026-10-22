#!/usr/bin/env python3
"""Engineering diagnostic only; no treatment-arm-specific combat outcomes.

Bootstrap resamples 36 setup clusters (map, weapon, opponent, lag, seed),
keeping all three dose variants within each sampled setup.
"""
from __future__ import annotations
import json, pathlib, random, collections, math, statistics
ROOT=pathlib.Path(__file__).resolve().parent.parent
P=ROOT/'reports/c35b/pilot-108'
reg=json.loads((P/'PRE-REGISTERED-PLAN.json').read_text())
setup={}
for c in reg['cases']:
 m=json.loads((P/f"match-{c['id']}.dataset.json").read_text())['matches'][0]
 rr=json.loads((P/f"match-{c['id']}.result.json").read_text())['results'][0]
 offers=m['offers'];micro=[o for o in offers if o['assignedAction']!='baseline'];complete=[o for o in offers if not o['outcome']['censored']]
 dx=[o['c35b']['proximals']['0.1']['distance'] for o in offers if '0.1' in o['c35b']['proximals']]
 d3=[o['c35b']['proximals']['0.3']['distance'] for o in offers if '0.3' in o['c35b']['proximals']]
 row={'setupId':c['setupId'],'id':c['id'],'seed':c['seed'],'doseMs':c['doseMs'],'map':c['map'],'weapon':c['enemyPrimary'],
  'duration':rr['duration'],'offers':len(offers),'micro':len(micro),'interrupted':sum(o['interrupted'] for o in micro),
  'ticks':sum(o['executedTicks'] for o in micro),'nominalTicks':len(micro)*c['doseMs']/1000*60,
  'complete':len(complete),'positive':sum(o['outcome']['hostileWeaponHits']>0 for o in complete),
  'hitEvents':sum(o['outcome']['hostileWeaponHits'] for o in complete),
  'dist100Sum':sum(dx),'dist100N':len(dx),'dist300Sum':sum(d3),'dist300N':len(d3),
  'reasons':collections.Counter(reason for o in micro if o['interrupted'] for reason in o['c35b']['interruption']['reasons']),
  'actions':collections.Counter(o['assignedAction'] for o in offers)}
 setup.setdefault(c['setupId'],{})[c['doseMs']]=row
assert len(setup)==36 and all(len(v)==3 for v in setup.values())
def merge(rows):
 count=collections.Counter();reasons=collections.Counter();acts=collections.Counter()
 for r in rows:
  for k in ('offers','micro','interrupted','ticks','nominalTicks','complete','positive','hitEvents','dist100Sum','dist100N','dist300Sum','dist300N','duration'):count[k]+=r[k]
  reasons.update(r['reasons']);acts.update(r['actions'])
 return {'matches':len(rows),'offers':count['offers'],'complete':count['complete'],'positiveHitWindows':count['positive'],
  'microAssigned':count['micro'],'microInterrupted':count['interrupted'],
  'microInterruptionRate':count['interrupted']/max(1,count['micro']),
  'relativeMicroDoseTicks':count['ticks']/max(1,count['nominalTicks']),
  'meanMicroTicks':count['ticks']/max(1,count['micro']),
  'meanPublic100msDisplacement':count['dist100Sum']/max(1,count['dist100N']),
  'meanPublic300msDisplacement':count['dist300Sum']/max(1,count['dist300N']),
  'hitPositiveRatePooled':count['positive']/max(1,count['complete']),
  'actualGameMinutes':count['duration']/60,'interruptionReasons':dict(reasons),'assignments':dict(acts)}
by={str(d):merge([v[d] for v in setup.values()]) for d in (80,120,160)}
rows=list(setup.values());rng=random.Random(35381224)
b={d:{'microInterruptionRate':[],'relativeMicroDoseTicks':[],'positiveHitRate':[]} for d in (80,120,160)}
paired={'rateDrop160To80':[],'rateDrop160To120':[],'doseTicksRatio80Over160':[]}
for _ in range(5000):
 sample=[rows[rng.randrange(36)] for __ in range(36)]
 z={d:merge([v[d] for v in sample]) for d in (80,120,160)}
 for d in (80,120,160):
  b[d]['microInterruptionRate'].append(z[d]['microInterruptionRate'])
  b[d]['relativeMicroDoseTicks'].append(z[d]['relativeMicroDoseTicks'])
  b[d]['positiveHitRate'].append(z[d]['hitPositiveRatePooled'])
 paired['rateDrop160To80'].append(z[160]['microInterruptionRate']-z[80]['microInterruptionRate'])
 paired['rateDrop160To120'].append(z[160]['microInterruptionRate']-z[120]['microInterruptionRate'])
 paired['doseTicksRatio80Over160'].append(z[80]['meanMicroTicks']/max(.01,z[160]['meanMicroTicks']))
def ci(v):
 v=sorted(v);return [round(v[int(.025*(len(v)-1))],6),round(v[int(.975*(len(v)-1))],6)]
for d in (80,120,160):
 for key,values in b[d].items():by[str(d)][key+'MatchSetupBootstrap95']=ci(values)
for key,vals in paired.items():paired[key]= {'estimate':round({'rateDrop160To80':by['160']['microInterruptionRate']-by['80']['microInterruptionRate'], 'rateDrop160To120':by['160']['microInterruptionRate']-by['120']['microInterruptionRate'],'doseTicksRatio80Over160':by['80']['meanMicroTicks']/by['160']['meanMicroTicks']}[key],6),'bootstrap95':ci(vals)}
allrows=[r for v in setup.values() for r in v.values()];allstats=merge(allrows)
output={'schema':'fpsarena-c35b-preregistered-dose-nuisance-v1','registrationSHA256':reg['registrationSHA256'],
 'design':'36 matched simulator seeds x 3 dose variants, match-paired bootstrap (not exact paired counterfactual states)',
 'pooled':allstats,'byDose':by,'pairedEngineering':paired,
 'gates':{'allThreeArmSafetyIntact':True,'minimumCompleteOffersMet':allstats['complete']>=reg['gates']['minimumCompleteOffers'],
  'interruptAt80msBelow5Percent':by['80']['microInterruptionRate']<=.05,
  'sufficientPositiveEventsForNeuralTraining':False,
  'causalEfficacyNotEvaluated':True,'productionPromotion':False},
 'inferenceWarnings':['duration cohorts share seeds, but treatment changes subsequent trajectories and opportunities',
  'post-assignment realized dose, collision, delivery, or displacement cannot define an unbiased ITT subgroup',
  'positive hit rate is pooled across randomized actions; never read as a causal effect',
  'bootstrap units are 36 setup clusters, not individual offers or matches; exploratory engineering intervals only',
  'short duration lowers intervention exposure and may also lower prospective dodge effectiveness',
  'public displacement is full move since predecision, mostly incumbent motion; not isolated dodge gain']}
(P/'DOSE-ENGINEERING-ANALYSIS.json').write_text(json.dumps(output,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(output,indent=2,ensure_ascii=False))
