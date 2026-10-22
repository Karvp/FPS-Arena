#!/usr/bin/env python3
"""C35-Q read-only external evaluation. Source predictions are public BEFORE step;
shots, hit targets and server pellets are JOINED AFTER step, NEVER used to fit a model.
"""
from __future__ import annotations
from pathlib import Path
import sys,math,random,json,collections
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,join_case,sha
from c35p_confidence import fields,predict
MODEL=load(ROOT/'reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json')
SOURCE=ROOT/'reports/c35q/stress-12-v2'
OLDER=ROOT/'reports/c35p/new-seed-holdout-12'
def safe_rate(n,d):return n/d if d else None
def wilson_upper(success,total,z=1.96):
 if not total:return None
 p=success/total;den=1+z*z/total
 return min(1,(p+z*z/(2*total)+z*math.sqrt((p*(1-p)+z*z/(4*total))/total))/den)
def brier(rows,key,mode):
 subset=[r for r in rows if r['label'][key] is not None and r['pred'][key] is not None]
 if not subset:return dict(n=0,brier=None,constant=None,delta=None)
 prior=MODEL['heads'][key]['trainingPositiveRate'];y=[r['label'][key] for r in subset]
 p=[r['pred'][key] for r in subset]
 v=sum((a-b)**2 for a,b in zip(p,y))/len(y)
 c=sum((prior-b)**2 for b in y)/len(y)
 return dict(n=len(y),positives=sum(y),brier=v,constant=c,delta=v-c,
  meanPred=sum(p)/len(p),observedRate=sum(y)/len(y))
def score(rows):
 out={'shots':len(rows),'covered':sum(r['available'] for r in rows),
  'coverage':safe_rate(sum(r['available'] for r in rows),len(rows)),
  'hit':brier(rows,'hit','all'),'identity':brier(rows,'identity','hit')}
 # Score predicted ID confidence only if an authoritative player hit occurs.
 eligible=[r for r in rows if r['label']['identity'] is not None]
 for threshold in (.8,.9,.95):
  admitted=[r for r in eligible if r['pred']['identity']>=threshold]
  errors=sum(r['label']['identity']==0 for r in admitted)
  out[f'idThreshold{int(threshold*100)}']={'n':len(admitted), 'mistakes':errors,
   'coverageOfScorableHits':safe_rate(len(admitted),len(eligible)),
   'observedError':safe_rate(errors,len(admitted)), 'wilson95UpperError':wilson_upper(errors,len(admitted))}
 return out
def bootstrap(rows,key,reps=3000,seed=350017):
 clusters=collections.defaultdict(list)
 for r in rows:clusters[r['setup']].append(r)
 ids=sorted(clusters);rng=random.Random(seed);deltas=[]
 for _ in range(reps):
  sample=[r for k in (rng.choice(ids) for _ in ids) for r in clusters[k]]
  d=brier(sample,key,'bootstrap')['delta']
  if d is not None:deltas.append(d)
 if not deltas:return None
 deltas.sort();return [deltas[int(.025*(len(deltas)-1))],deltas[int(.975*(len(deltas)-1))]]
def align(case,path):
 shots,stats=join_case(case,path)
 base=path/case['id'];track=load(str(base)+'.track.json')['traces'][0]
 confidence=load(str(base)+'.confidence.json')['traces'][0]
 assert len(track['rows'])==len(confidence['rows'])
 result=[];idx=0
 for pre,cp in zip(track['rows'],confidence['rows']):
  assert abs(pre['t']-cp['t'])<.0000061
  assert pre['serverLabelsAfterStep']['shots']==cp['serverLabelsAfterStep']['shots']
  cand=pre['publicBeforeStep']['thresholdsMs']['350']
  x=fields(cand);p=cp['publicBeforeStep'];assert p['eligible']==(x is not None)
  assert not any(k in p for k in ('authoritative','serverTruth','hit','targetHit','pellets'))
  if x is not None:
   for head,property_name in (('hit','pHit'),('identity','pIdCorrectGivenHit')):
    assert abs(p[property_name]-round(predict(MODEL['heads'][head],x),6))<1.01e-6
  for _ in range(cp['serverLabelsAfterStep']['shots']):
   s=shots[idx];idx+=1;a=s['agreement']['350']['aim']
   identity=None if x is None or not s['hasPlayerHit'] or a is None or abs(a-.5)<1e-9 else int(a>.5)
   result.append({'setup':case['setupId'],'lag':case['lagMs'],'map':case['map'],'gun':case['gun'],
    'available':bool(x is not None),'pred':{'hit':p['pHit'],'identity':p['pIdCorrectGivenHit']},
    'label':{'hit':int(s['hasPlayerHit']) if x is not None else None,'identity':identity},
    'pellets':s['pellets'],'foam':s['dynamicFoamPellets']})
 assert idx==len(shots)==confidence['counts']['confirmedShots']
 assert confidence['counts']['fireModified']==0 and not confidence['counts']['storedDropped']
 return result

def evaluate_set(root,verify_hash=True):
 d=load(root/'FROZEN-DESIGN.json');audit=load(root/'EXECUTION-AUDIT.json');
 assert sha(root/'FROZEN-DESIGN.json')==audit['registrationSHA256']
 checks={x['id']:x for x in audit['matches']};assert len(checks)==len(d['cases'])
 if verify_hash:
  for p,v in d['sourceSHA256'].items():assert sha(ROOT/p)==v,p
 rows=[]
 for case in d['cases']:
  ck=checks[case['id']];base=root/'matches'/case['id']
  for tag,v in ck['SHA256'].items():assert sha(str(base)+f'.{tag}.json')==v,(case['id'],tag)
  res=load(str(base)+'.result.json');assert res['aggregate']['agentErrors']==0
  rows.extend(align(case,root/'matches'))
 return rows,d

def run(write=True):
 new,reg=evaluate_set(SOURCE); old,_=evaluate_set(OLDER,verify_hash=False)
 assert len(reg['cases'])==12 and len({c['setupId'] for c in reg['cases']})==6
 assert {c['lagMs'] for c in reg['cases']}=={85,240}
 for r in new+old:
  assert not (r['label']['identity'] is not None and r['label']['hit']!=1)
 o={'schema':'fpsarena-c35q-frozen-external-robustness-v1',
  'decision':'RESEARCH_ONLY_NO_PROMOTION','modelSha256':sha(ROOT/'reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json'),
  'frozenDesignSHA256':sha(SOURCE/'FROZEN-DESIGN.json'),
  'datasets':{},'caveats':['Shot misses cannot be assigned a true target ID',
  'Shot/pellet labels belong to the offline evaluator only',
  '6 independent setup clusters per cohort, no source model fitting or selection',
  'A good conditional Brier does NOT approve live aim/motor policy']}
 for name,rows in [('c35p_external_unseen_guns',old),('c35q_new_seed_lag_stress',new)]:
  key=collections.defaultdict(list)
  for r in rows:key[str(r['lag'])].append(r)
  o['datasets'][name]={'overall':score(rows),'byLag':{lag:score(vals) for lag,vals in sorted(key.items())},
   'setupCount':len({r['setup'] for r in rows}), 'pellets':sum(r['pellets'] for r in rows),
   'foamPellets':sum(r['foam'] for r in rows),
   'BrierDeltaModelMinusConstantCI95BySetup':{k:bootstrap(rows,k) for k in ('hit','identity')}}
 # Conservative: fail closed if ANY audited external cohort worsens Brier on either head.
 o['gates']={'hit':all(o['datasets'][n]['overall']['hit']['delta']<0 for n in o['datasets']),
             'identity':all(o['datasets'][n]['overall']['identity']['delta']<0 for n in o['datasets']),
             'liveControl':False}
 if write:dump(SOURCE/'ROBUSTNESS-AUDIT.json',o)
 return o
if __name__=='__main__':print(json.dumps(run(),indent=2))
