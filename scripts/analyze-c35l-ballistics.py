#!/usr/bin/env python3
"""Independent C35-L per-pellet ledger audit; observational, cluster-aware."""
from pathlib import Path
from collections import Counter,defaultdict
import json,hashlib,random
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'reports/c35l/pilot-18-fresh'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def audit():
 design=read(OUT/'FROZEN-DESIGN.json'); reg=sha(OUT/'FROZEN-DESIGN.json')
 for name,h in design['sourceSHA256'].items():
  assert sha(ROOT/name)==h, f'FROZEN SOURCE CHANGED: {name}'
 totals=Counter();per=[];weapons=defaultdict(Counter);by_proxy=defaultdict(Counter)
 for c in design['cases']:
  prefix=OUT/'matches'/c['id']
  b=read(Path(str(prefix)+'.ballistic.json'))['traces'][0]
  k=read(Path(str(prefix)+'.identity.json'))['traces'][0]
  cnt=b['counts'];rows=b['rows']
  assert cnt['fireModified']==cnt['storedDropped']==0
  assert cnt['serverShotEvents']==cnt['confirmedShots']==sum(len(r['authoritativeFiringTimeShots']) for r in rows)
  assert cnt['confirmedShots']==k['counts']['shots']
  assert cnt['fireIntentTicks']==k['counts']['fireTicks']
  assert cnt['confirmedPellets']==sum(sum(len(s['pellets']) for s in r['authoritativeFiringTimeShots']) for r in rows)
  assert cnt['worldPellets']==cnt['staticBlockedPellets']+cnt['dynamicFoamBlockedPellets']
  assert cnt['confirmedPellets']==sum(cnt[x] for x in ['hitPlayerPellets','hitZombiePellets','hitAbilityPellets','hitEntityPellets','worldPellets','rangePellets'])
  assert len(rows)==len(k['rows'])
  for row,krow in zip(rows,k['rows']):
   shot_batch=row['authoritativeFiringTimeShots']
   if shot_batch and row['publicBeforeStep']['geometryValid']:
    stratum='static_nearest_proxy_clear' if row['publicBeforeStep']['nearest3DClear'] else 'static_nearest_proxy_blocked'
    by_proxy[stratum]['shots']+=len(shot_batch)
    by_proxy[stratum]['pellets']+=sum(len(sh['pellets']) for sh in shot_batch)
    by_proxy[stratum]['playerHitPellets']+=sum(pel['hitKind']=='player' for sh in shot_batch for pel in sh['pellets'])
    by_proxy[stratum]['actualWorldStoppedPellets']+=sum(pel['hitKind']=='world' for sh in shot_batch for pel in sh['pellets'])
   assert abs(row['t']-krow['t'])<=0.00001 and row['publicBeforeStep']['targetId']==krow['publicBeforeStep']['targetId']
   for shot in row['authoritativeFiringTimeShots']:
    assert shot['weapon']==c['gun'] and 0<=shot['rewindSeconds']<=.3
    for pellet in shot['pellets']:
     assert pellet['hitKind'] in ('player','zombie','ability-body','streak-entity','world','range')
     assert pellet['worldKind'] in ('none','static','dynamic-foam')
  totals.update(cnt);weapons[c['gun']].update(cnt)
  per.append({'id':c['id'],'map':c['map'],'gun':c['gun'],'shots':cnt['confirmedShots'],
   'pellets':cnt['confirmedPellets'],'playerPellets':cnt['hitPlayerPellets'],
   'staticBlocked':cnt['staticBlockedPellets'],'dynamicBlocked':cnt['dynamicFoamBlockedPellets'],
   'public3DClearFireTicks':k['counts']['clear3D'],'public3DBlockedFireTicks':k['counts']['blocked3D']})
 assert len(per)==18 and totals['ticks']==18*60*60
 rng=random.Random(20261013);boot=[]
 for _ in range(2000):
  samp=[per[rng.randrange(len(per))] for _ in per];den=sum(v['pellets'] for v in samp)
  if den:boot.append(sum(v['playerPellets'] for v in samp)/den)
 boot.sort();interval=[boot[int(.025*len(boot))],boot[int(.975*len(boot))-1]] if boot else None
 result={'schema':'fpsarena-c35l-measurement-analysis-v1','preregistrationSHA256':reg,
  'matches':18,'simulatedSeconds':1080,'totals':dict(totals),
  'byWeapon':{w:dict(c) for w,c in sorted(weapons.items())},'byPublicLOSProxy':{k:dict(v) for k,v in sorted(by_proxy.items())},'perMatch':per,
  'playerHitPelletFractionClusterBootstrap95':interval,
  'interpretation':'pellet first collision at firing time after deterministic spread and target rewind; not separate server hit events or causal motor improvement',
  'limitations':['player pellet outcomes correlated within shot and match',
   'public nearest hostile may differ from actual intended target',
   'standard hitscan only; melee and laser special attacks excluded']}
 (OUT/'ANALYSIS.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
 print('C35L PASS',len(per),'matches',totals['confirmedShots'],'shots',totals['confirmedPellets'],'pellets',flush=True)
 return result
if __name__=='__main__':audit()
