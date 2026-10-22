#!/usr/bin/env python3
"""C35-AA descriptive-only shot/ADS/motion study, bootstrap clustered by setup."""
import csv,json,random,math,collections
from pathlib import Path
R=Path(__file__).resolve().parents[1];O=R/'reports/c35aa/matched-36'
def get(p):return json.loads(p.read_text())
def save(p,d):p.write_text(json.dumps(d,sort_keys=True,indent=2)+'\n')
def pct(a,b):return round(a/b*100,3) if b else None
D=get(O/'FROZEN-DESIGN.json');audit=get(O/'INDEPENDENT-AUDIT.json')
assert audit['status']=='PASS';rows=[];shots=[]
for c in D['cases']:
 base=O/'matches'/c['id'];res=get(Path(str(base)+'.result.json'))['results'][0];aim=get(Path(str(base)+'.aim.json'))['traces'][0]
 rows.append({**{k:c[k] for k in ['id','setupId','arm','gun','map','lagMs','seed']},'kills':res['kills'],'deaths':res['deaths'],
  'shots':res['shots'],'hits':res['hits'],'hitEventsPerShot':round(res['hits']/max(res['shots'],1),5),
  'pellets':aim['counts']['pellets'],'playerHitPellets':aim['counts']['playerHitPellets'],
  'adsShots':aim['counts']['adsShots'],'movingShots':aim['counts']['movingShots'],'errors':res['errors']})
 for idx,s in enumerate(aim['rows']):
  f=s['publicBeforeStep'];y=s['serverLabelsAfterStep'];a=f['aimAngleDeg']
  angle='unknown' if a is None else '<=1' if a<=1 else '1-3' if a<=3 else '3-10' if a<=10 else '>10'
  shots.append(dict(id=c['id'],setup=c['setupId'],arm=c['arm'],gun=c['gun'],lagMs=c['lagMs'],
    shotIndex=idx,ads=bool(y['ads']),aim=bool(f['aim']),speed=f['speed'],movementClass=f['movementClass'],
    targetStatus=f['targetStatus'],angleClass=angle,aimAngleDeg=a,ageMs=f['targetAgeMs'],
    hit=int(y['playerHit']),pelletCount=y['pelletCount'],playerHitPellets=y['playerHitPellets'],
    expectedSpread=f['expectedSpreadDeg'],serverSpread=y['spreadDegrees']))
assert len(shots)==audit['shotsReconciled']
with (O/'TDM-THREE-ARM-12.csv').open('w',newline='') as fp:
 w=csv.DictWriter(fp,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
by_setup=collections.defaultdict(dict)
for x in rows:by_setup[x['setupId']][x['arm']]=x
assert len(by_setup)==12 and all(len(v)==3 for v in by_setup.values())
def bootstrap(armA,armB,field,seed=354131):
 rr=random.Random(seed);names=sorted(by_setup);r=[]
 for _ in range(6000):
  pick=rr.choices(names,k=len(names));a=sum(by_setup[n][armA][field] for n in pick);b=sum(by_setup[n][armB][field] for n in pick)
  if b:r.append(a/b)
 r.sort();return {'ratio':sum(v[armA][field] for v in by_setup.values())/max(1,sum(v[armB][field] for v in by_setup.values())),
  'CI95':[round(r[int(.025*(len(r)-1))],5),round(r[int(.975*(len(r)-1))],5)]} if r else {'ratio':None,'CI95':None}
summary={arm:{k:sum(x[k] for x in rows if x['arm']==arm) for k in ['kills','deaths','shots','hits','pellets','playerHitPellets','adsShots','movingShots']} for arm in D['arms']}
association={}
for key,fx in [('ads',lambda q:'ADS' if q['ads'] else 'HIP'),('movement',lambda q:q['movementClass']),('angle',lambda q:q['angleClass']),('target',lambda q:q['targetStatus']),('weapon',lambda q:q['gun'])]:
 d=collections.defaultdict(lambda:{'shots':0,'hitShots':0,'pellets':0,'playerHitPellets':0,'setups':set()})
 for q in shots:
  v=d[fx(q)];v['shots']+=1;v['hitShots']+=q['hit'];v['pellets']+=q['pelletCount'];v['playerHitPellets']+=q['playerHitPellets'];v['setups'].add(q['setup'])
 association[key]={k:{'shots':v['shots'],'hitShots':v['hitShots'],'shotHitPct':pct(v['hitShots'],v['shots']),
  'pellets':v['pellets'],'playerHitPellets':v['playerHitPellets'],'setups':len(v['setups'])} for k,v in sorted(d.items())}
# Precision firing metadata spread agreement diagnostic, not a test of causal aim benefit.
spreadDeltas=[abs(q['expectedSpread']-q['serverSpread']) for q in shots if q['expectedSpread'] is not None]
aimDisagreements=sum(q['ads']!=q['aim'] for q in shots)
byGunArm=collections.defaultdict(lambda:{'shots':0,'hitShots':0,'adsShots':0,'movingShots':0})
for q in shots:
 v=byGunArm[(q['gun'],q['arm'])];v['shots']+=1;v['hitShots']+=q['hit'];v['adsShots']+=int(q['ads']);v['movingShots']+=int(q['speed']>=.5)
byGun={g:{a:{**byGunArm[(g,a)],'shotHitPct':pct(byGunArm[(g,a)]['hitShots'],byGunArm[(g,a)]['shots'])} for a in D['arms']} for g in sorted(set(c['gun'] for c in D['cases']))}
out=dict(schema='fpsarena-c35aa-shot-aim-movement-analysis-v1',designSHA256=audit['registrationSHA256'],
  units={'comparison':'12 independent paired match setups','descriptiveAim':'shot','pelletOutcomes':'dependent within shot'},
  matches=len(rows),setups=len(by_setup),shots=len(shots),matchTotals=summary,
  randomizedVsObserve={field:bootstrap('randomized','observe',field) for field in ['kills','deaths','shots','hits']},
  observations=association,byGunArm=byGun,aimDisagreements=aimDisagreements,
  spreadDifference={'n':len(spreadDeltas),'maxAbsDeg':round(max(spreadDeltas),6) if spreadDeltas else None,
    'meanAbsDeg':round(sum(spreadDeltas)/len(spreadDeltas),6) if spreadDeltas else None},
  limitations=['No randomized ADS assignment: ADS vs HIP observational and heavily confounded by gun/distance.',
   'No randomized movement speed: movement vs still observational; aim errors reflect dynamic snapshots and selection.',
   'A shot has multiple dependent pellets for shotguns; shot is the descriptive unit.',
   'Aims include stale/absent public candidates; missing target ID is not proof of a miss.',
   'Source weapon spread formula depends on aim and onGround but not speed; attachments can alter effective spread.',
   'Randomized one-tick motion may affect match trajectories, not necessarily immediate aim. No Q(s,a) promotion.'])
save(O/'ANALYSIS.json',out)
print(json.dumps({'summary':summary,'randomizedVsObserve':out['randomizedVsObserve'],'aimDisagreements':aimDisagreements,
 'spreadDifference':out['spreadDifference'],'byMotion':association['movement'],'byAim':association['ads'],'byAngle':association['angle']},indent=2))
