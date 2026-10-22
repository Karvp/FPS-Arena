#!/usr/bin/env python3
"""Independent C35AG assignment, trajectory, authoritative counters and cluster bootstrap audit.
Treatment: randomized initial ADS impulse only; post-treatment sequence not causal Q.
"""
from pathlib import Path
from collections import defaultdict
import hashlib,json,csv,math,random,statistics
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ag/frozen-72';M=O/'matches'
def get(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def assignment(seed,i):
 x=(seed ^ ((i*0x69ba01d3)&0xffffffff) ^ 0xc35ad734)&0xffffffff
 x=(x+0x9e3779b9)&0xffffffff;x=((x^(x>>16))*0x85ebca6b)&0xffffffff;x=((x^(x>>13))*0xc2b2ae35)&0xffffffff
 return 'control' if ((x^(x>>16))&0xffffffff)<0x80000000 else 'toggle'
def safe(x):assert isinstance(x,(int,float)) and math.isfinite(x) and x>=0
D=get(O/'FROZEN-DESIGN.json');E=get(O/'EXECUTION-AUDIT.json');reg=sha(O/'FROZEN-DESIGN.json')
assert len(D['cases'])==len(E['cases'])==72 and E['registrationSHA256']==reg
for k,v in D['sourceSHA256'].items():assert sha(R/k)==v,('SOURCE',k)
assert {r['id'] for r in E['cases']}=={r['id'] for r in D['cases']}
for c in E['cases']:
 for k,v in c['sha256'].items(): assert sha(Path(str(M/c['id'])+'.'+k+'.json'))==v,('file',c['id'],k)
matches=[];samples=[];censored=[];offerCount=0;completeCount=0;changed=0;shots=0;pellets=0;adCount=0;c21=0
for c in D['cases']:
 base=M/c['id'];res=get(Path(str(base)+'.result.json'))
 assert res['aggregate']['agentErrors']==0
 m=res['results'][0];matches.append({k:({ 'hits':'hits','kills':'kills','deaths':'deaths','shots':'shots','damageDealt':'damageDealt','damageTaken':'damageTaken','errors':'errors'}.get(k) and m[k]) if k not in ('setupId','gun','arm','seed','map') else c.get(k) for k in ['setupId','gun','arm','seed','map','kills','deaths','shots','hits','damageDealt','damageTaken','errors']})
 if c['arm']=='release':continue
 aim=get(Path(str(base)+'.aim.json'))['traces'][0];ad=get(Path(str(base)+'.prefire.json'))['traces'][0];cc=get(Path(str(base)+'.dataset.json'))
 assert cc['registrationSHA256']==reg and aim['counts']['shots']==m['shots'] and ad['counts']['fireModified']==0
 shots+=aim['counts']['shots'];pellets+=aim['counts']['pellets'];c21+=len(cc['matches'][0]['offers'])
 if c['arm']=='observe':assert ad['rows']==[];continue
 seq=get(Path(str(base)+'.sequence.json'))['traces'][0]
 assert seq['counts']['overlap']==0 and len(seq['rows'])==len(ad['rows'])==seq['counts']['assignments']
 assert seq['counts']['completed']+seq['counts']['censored']==len(seq['rows'])
 offerCount+=len(seq['rows']);completeCount+=seq['counts']['completed'];changed+=seq['counts']['changedADS'];adCount+=ad['counts']['changedTicks']
 prev=-10**8
 for i,(q,a) in enumerate(zip(seq['rows'],ad['rows'])):
  assert q['index']==a['index']==i+1 and q['assignedArm']==a['assignedArm']==assignment(c['seed'],i+1)
  assert q['propensity']==a['propensity']==.5 and q['unselectedOutcome'] is None and a['unselectedOutcome'] is None
  assert q['start']>=prev+6-1e-3 and q['start']==a['start'];prev=q['start']
  assert q['baselineADS']==a['baselineADS'] and q['initialPublicFeatures']==a['publicFeatures']
  assert q['initialPublicFeatures']['provenance']=='PUBLIC_BEFORE_GAME_STEP_ONLY'
  trajectory=q['sequence'];segs=trajectory['segments']
  assert trajectory['provenance'].startswith('POST_ASSIGNMENT')
  assert sum(s['ticks'] for s in segs)==trajectory['ticks']
  assert sum(s['shots'] for s in segs)==sum(trajectory['shotsByPhase'])
  assert sum(s['hits'] for s in segs)==sum(trajectory['hitsByPhase'])
  assert sum(s['ticks'] for s in segs if s['flags']['aim'])==trajectory['adsTicks']
  assert sum(s['ticks'] for s in segs if s['flags']['fire'])==trajectory['fireInputTicks']
  assert sum(s['ticks'] for s in segs if any(s['flags'][v] for v in ('forward','backward','left','right')))==trajectory['movementTicks']
  assert all(s['key']==''.join('1' if s['flags'][k] else '0' for k in ('aim','fire','forward','backward','left','right','jump','crouch','reload')) for s in segs)
  assert all(segs[j]['key']!=segs[j-1]['key'] for j in range(1,len(segs)))
  assert len(segs)>0 and all(s['ticks']>0 for s in segs)
  if not q['factual']['complete']:
   assert q['factual']['censored'] and q['factual'].get('deathCount') is None;censored.append(q);continue
  y=q['factual'];assert y['source']=='SERVER_CUMULATIVE_AFTER_GAME_STEP' and y['horizonSeconds']==6
  for f in ('shots','hits','damageDealt','damageTaken','ownKills','deathCount'):safe(y[f])
  assert sum(s['shots'] for s in segs)==y['shots'] and sum(s['hits'] for s in segs)==y['hits']
  assert y['netDamage']==y['damageDealt']-y['damageTaken']
  assert y['survived']==(y['deathCount']==0)
  completeCount-=1
  row={k:c[k] for k in ('setupId','gun','map','seed')}
  row.update(index=q['index'],arm=q['assignedArm'],propensity=q['propensity'],baselineADS=int(q['baselineADS']),
   initialRange=q['initialPublicFeatures'].get('targetRange'),initialAimAngle=q['initialPublicFeatures'].get('aimAngleDeg'),
   sequenceSegments=len(segs),sequenceTicks=trajectory['ticks'],adsTicks=trajectory['adsTicks'],fireInputTicks=trajectory['fireInputTicks'],
   movementTicks=trajectory['movementTicks'],changedADSTicks=trajectory['changedADSTicks'],
   earlyShots=trajectory['shotsByPhase'][0],middleShots=trajectory['shotsByPhase'][1],lateShots=trajectory['shotsByPhase'][2],
   shots=y['shots'],hits=y['hits'],damageDealt=y['damageDealt'],damageTaken=y['damageTaken'],kills=y['ownKills'],deaths=y['deathCount'],survived=int(y['survived']),
   reward=(min(y['damageDealt'],300)-min(y['damageTaken'],300)+100*(y['ownKills']-y['deathCount']))/100)
  samples.append(row)
assert completeCount==0
assert len(samples)+len(censored)==offerCount
# Intent-to-treat / initial ADS impulse. All subsequent sequence features are mediators.
def ht(rows,key):return sum((2 if r['arm']=='toggle' else -2)*r[key] for r in rows)/len(rows) if rows else None
bysetup=defaultdict(list)
for r in samples:bysetup[r['setupId']].append(r)
keys=sorted(bysetup);rand=random.Random(350035);boots=[]
for i in range(5000):
 b=[q for _ in keys for q in bysetup[rand.choice(keys)]]
 boots.append({k:ht(b,k) for k in ('reward','kills','deaths','survived','hits')})
def ci(k):
 a=sorted(x[k] for x in boots);return [round(a[int(.025*len(a))],5),round(a[min(len(a)-1,int(.975*len(a)))],5)]
bs={a:{k:sum(r[k] for r in matches if r['arm']==a) for k in ('kills','deaths','shots','hits','errors')} for a in ('release','observe','randomized')}
byarm={a:{'n':sum(r['arm']==a for r in samples),'rewardMean':round(statistics.mean(r['reward'] for r in samples if r['arm']==a),5) if any(r['arm']==a for r in samples) else None} for a in ('control','toggle')}
trajectory={'nSequences':len(samples),'meanSegments':round(statistics.mean(r['sequenceSegments'] for r in samples),3),'meanADSFraction':round(statistics.mean(r['adsTicks']/r['sequenceTicks'] for r in samples),4),
 'meanMovementFraction':round(statistics.mean(r['movementTicks']/r['sequenceTicks'] for r in samples),4),
 'meanFireInputFraction':round(statistics.mean(r['fireInputTicks']/r['sequenceTicks'] for r in samples),4),
 'meanShotsEarly':round(statistics.mean(r['earlyShots'] for r in samples),4),
 'meanShotsMiddle':round(statistics.mean(r['middleShots'] for r in samples),4),
 'meanShotsLate':round(statistics.mean(r['lateShots'] for r in samples),4)}
sumry={'schema':'fpsarena-c35ag-independent-sequence-analysis-v1','registrationSHA256':reg,'matches':len(matches),'setups':len(keys),'simulatedMinutes':108,
 'byMatchArm':bs,'sequence':{'assigned':offerCount,'completed':len(samples),'censored':len(censored),'changedADSTicks':changed,'c35adChangedTicks':adCount,'trajectory':trajectory,'byAssignedArm':byarm,'ipsToggleMinusControl':{k:round(ht(samples,k),5) for k in ('reward','kills','deaths','survived','hits')},'setupBootstrap95':{k:ci(k) for k in ('reward','kills','deaths','survived','hits')}},
 'serverBallisticLedger':{'shots':shots,'pellets':pellets},'c21Offers':c21,
 'guardrails':{'noUnselectedLabels':True,'noOverlappingSixSecondSequences':True,'allAssignmentsRecomputed':True,'postTreatmentSequenceIsNotCausalActionValue':True,'productionUnchanged':True},
 'limitations':['Original ADS impulse only randomized, subsequent realized trajectory is a mediator','Nonoverlapping windows within a match can have treatment carryover','Finite 24 setup clusters, split by setup for inference','Six-second cumulative server rewards can contain sparse kills and sniper long-tailed damage','Complete-case selection can censor end-of-match assignments']}
for name,rows in [('TDM-THREE-ARM.csv',matches),('SEQUENCE-FACTUAL.csv',samples)]:
 with (O/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
(O/'INDEPENDENT-ANALYSIS.json').write_text(json.dumps(sumry,indent=2,sort_keys=True)+'\n')
print(json.dumps(sumry,indent=2))
