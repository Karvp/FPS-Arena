#!/usr/bin/env python3
"""C35 technical pilot ONLY: blinded-to-arm-outcome nuisance/engineering stats.

No arm-conditional outcome, no model training, no treatment-effect estimates.
This is intentionally NOT confirmatory causal evaluation.
"""
import collections,hashlib,json,pathlib,random,statistics,math
ROOT=pathlib.Path(__file__).resolve().parent.parent
P=ROOT/'reports/c35/pilot-90'
plan=json.loads((P/'PRE-REGISTERED-PLAN.json').read_text())
rows=[];assign=collections.Counter();override=collections.Counter()
for c in plan['cases']:
 m=json.loads((P/f"match-{c['id']}.dataset.json").read_text())['matches'][0]
 duration=json.loads((P/f"match-{c['id']}.result.json").read_text())['results'][0]['duration']
 offer=m['offers'];complete=[o for o in offer if not o['outcome']['censored']]
 for o in offer:
  assign[o['assignedAction']]+=1
  if o['runtimeOverride']:override[o['assignedAction']]+=1
 rows.append({'durationSeconds':duration,'matchId':m['metadata']['matchId'],'map':c['map'],'weapon':c['enemyPrimary'],'opponentPolicy':c['opponentPolicy'],
   'offers':len(offer),'complete':len(complete),'positive':sum(o['outcome']['hostileWeaponHits']>0 for o in complete),
   'interruptions':sum(o['runtimeOverride'] for o in offer),'microAssigned':sum(o['assignedAction']!='baseline' for o in offer),
   'meanMicroTicks':statistics.mean([o['executedTicks'] for o in offer if o['assignedAction']!='baseline']) if any(o['assignedAction']!='baseline' for o in offer) else 0})
keys=['offers','complete','positive','interruptions','microAssigned']
sumall=lambda k:sum(x[k] for x in rows)
rng=random.Random(350359)
boot={'hitPositiveRate':[],'offersPerMatch':[],'interruptRateAll':[],'interruptRateMicro':[],'hitPositivePerMatch':[]}
for _ in range(5000):
 sample=[rows[rng.randrange(len(rows))] for _ in range(len(rows))]
 counts={k:sum(row[k] for row in sample) for k in keys}
 boot['hitPositiveRate'].append(counts['positive']/max(1,counts['complete']))
 boot['offersPerMatch'].append(counts['offers']/len(sample))
 boot['interruptRateAll'].append(counts['interruptions']/max(1,counts['offers']))
 boot['interruptRateMicro'].append(counts['interruptions']/max(1,counts['microAssigned']))
 boot['hitPositivePerMatch'].append(counts['positive']/len(sample))
def ci(values):
 a=sorted(values);return [round(a[int(.025*(len(a)-1))],6),round(a[int(.975*(len(a)-1))],6)]
count=sumall('offers');micro=sumall('microAssigned');pos=sumall('positive');rate=pos/sumall('complete')
chi=sum((assign[x]-count/3)**2/(count/3) for x in ('baseline','micro-left','micro-right'))
stats={'schema':'fpsarena-c35-technical-pilot-nuisance-v1','registrationSHA256':plan['registrationSHA256'],
 'matches':len(rows),'configuredMaximumSecondsPerMatch':180,'configuredMaximumSimulatedMinutes':round(len(rows)*180/60,3),
 'actualSimulatedMinutes':round(sum(x['durationSeconds'] for x in rows)/60,4),
 'matchesStoppedNaturallyBefore180Seconds':sum(x['durationSeconds']<179.95 for x in rows),
 'completeOffers':sumall('complete'),'censoredOffers':count-sumall('complete'),'offers':count,
 'positiveHostileHitWindows':pos,'positiveWindowRate':round(rate,7),'positiveWindowRateMatchBootstrap95':ci(boot['hitPositiveRate']),
 'offersPerMatch':round(count/len(rows),4),'offersPerMatchMatchBootstrap95':ci(boot['offersPerMatch']),
 'positivePerMatch':round(pos/len(rows),5),'positivePerMatchMatchBootstrap95':ci(boot['hitPositivePerMatch']),
 'assignmentCounts':dict(assign),'assignmentChiSqDf2':round(chi,5),'assignmentChiSqPApprox':round(math.exp(-chi/2),6),
 'interrupted':sumall('interruptions'),'microAssigned':micro,
 'interruptRateAll':round(sumall('interruptions')/count,7),'interruptRateAllMatchBootstrap95':ci(boot['interruptRateAll']),
 'interruptRateMicro':round(sumall('interruptions')/micro,7),'interruptRateMicroMatchBootstrap95':ci(boot['interruptRateMicro']),
 'meanExecutedTicksOnMicro':round(sum(x['meanMicroTicks']*x['microAssigned'] for x in rows)/micro,4),
 'sampleSizeFeasibility':{'proposedFullMatches':750,'proposedCapMatches':975,
  'projectedCompleteOffersAt750':round(sumall('complete')/len(rows)*750),
  'projectedPositiveWindowsAt750':round(pos/len(rows)*750),
  'projectedPositiveWindowsAtCap975':round(pos/len(rows)*975),
  'minimumProposedPositiveWindows':200,'gateAtPilot':False,
  'interpretation':'Nuisance extrapolation, NOT controlled effect; clustering/event scarcity and 33% override make immediate confirmatory expansion unjustified'},
 'leakageBoundary':'No per-arm outcome or treatment-effect statistics computed',
 'limits':['Pilot not independent efficacy test','Match-bootstrap interval on observational nuisance ratios only',
  'Predicted full match rates assume stationary offer process and are uncertain','Server hit event rarity makes causal action-value training premature']}
(P/'PILOT-NUISANCE.json').write_text(json.dumps(stats,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(stats,indent=2,ensure_ascii=False))
