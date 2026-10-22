#!/usr/bin/env python3
"""Independent C35-P source/hash, sidecar, leakage and prospective outcome audit."""
import sys,json,math,random
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha,join_case
from c35p_confidence import fields,predict,describe
OUT=ROOT/'reports/c35p/new-seed-holdout-12'
MODEL=load(ROOT/'reports/c35p/confidence-holdout-v1/FROZEN-PUBLIC-CONFIDENCE.json')
def h32(x):
 x=(x+0x9e3779b9)&0xffffffff;x=((x^(x>>16))*0x85ebca6b)&0xffffffff
 x=((x^(x>>13))*0xc2b2ae35)&0xffffffff;return (x^(x>>16))&0xffffffff
def arm(seed,index):
 v=h32((seed^(index*0x517cc1b7)^0xc21f7a39)&0xffffffff)/4294967296
 return ('baseline','micro-left','micro-right')[min(2,int(v*3))]
def cluster_ci(rows,head,key,prior,reps=3000):
 bysetup={s:[r for r in rows if r['setupId']==s and r[head] is not None] for s in sorted({r['setupId'] for r in rows})}
 keys=sorted(bysetup);rng=random.Random(350016);out=[]
 for _ in range(reps):
  sampled=[r for s in (rng.choice(keys) for _ in keys) for r in bysetup[s]]
  if not sampled:continue
  out.append(sum((r[key]-r[head])**2-(prior-r[head])**2 for r in sampled)/len(sampled))
 out.sort();return [out[int(.025*(len(out)-1))],out[int(.975*(len(out)-1))]]

def evaluate():
 design=load(OUT/'FROZEN-DESIGN.json');execution=load(OUT/'EXECUTION-AUDIT.json');reg=sha(OUT/'FROZEN-DESIGN.json')
 assert design['schema']=='fpsarena-c35p-external-prospective-holdout-v1'
 assert len(design['cases'])==12 and execution['registrationSHA256']==reg
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 for p,h in design['sourceSHA256'].items(): assert sha(ROOT/p)==h,p
 byid={x['id']:x for x in execution['matches']};assert len(byid)==12
 allrows=[];totalShots=totalPellets=totalFoam=0;eligible=0;offers=0
 for c in design['cases']:
  base=OUT/'matches'/c['id'];x=byid[c['id']]
  for ext,h in x['SHA256'].items():assert sha(str(base)+f'.{ext}.json')==h,(c['id'],ext)
  result=load(str(base)+'.result.json');conf=load(str(base)+'.confidence.json');tr=conf['traces'][0]
  assert result['aggregate']['agentErrors']==0 and result['snapshotLagMs']==c['lagMs']
  ds=load(str(base)+'.dataset.json');assert ds['registrationSHA256']==reg
  match=ds['matches'][0];assert match['metadata']['seed']==c['seed'] and match['metadata']['policy']=='shadow80'
  assert len(match['offers'])==len(match['c35c']['offers'])
  assert sum(bool(p['eligible']) for p in match['c35c']['preoffers'])==len(match['offers'])
  for ordinal,o in enumerate(match['offers'],1):
   assert o['assignedAction']==arm(c['seed'],ordinal),(c['id'],ordinal)
   assert o['validity']['preActionPublicFeaturesOnly'] and o['validity']['serverLabelsOnlyAfterAssignment']
  offers+=len(match['offers'])
  assert conf['schema']=='fpsarena-c35p-public-confidence-traces-v1'
  assert tr['counts']['fireModified']==0 and tr['counts']['storedDropped']==0
  shots,stat=join_case(c,OUT/'matches');assert len(shots)==tr['counts']['confirmedShots']
  assert len(tr['rows'])==len(load(str(base)+'.track.json')['traces'][0]['rows'])
  idx=0
  for pub,cp in zip(load(str(base)+'.track.json')['traces'][0]['rows'],tr['rows']):
   assert abs(pub['t']-cp['t'])<=.000006
   assert cp['serverLabelsAfterStep']['shots']==pub['serverLabelsAfterStep']['shots']
   pred=cp['publicBeforeStep'];c350=pub['publicBeforeStep']['thresholdsMs']['350'];fs=fields(c350)
   assert pred['eligible']==bool(fs is not None)
   if fs is None:assert pred['pHit'] is None and pred['pIdCorrectGivenHit'] is None
   else:
    assert pred['aimId']==c350['aimId']
    for head,key in [('hit','pHit'),('identity','pIdCorrectGivenHit')]:
     assert abs(pred[key]-round(predict(MODEL['heads'][head],fs),6))<1.1e-6
   assert not any(term in pred for term in ('pellets','hitKind','serverTruth','rewindSeconds'))
   count=pub['serverLabelsAfterStep']['shots']
   for _ in range(count):
    shot=shots[idx];idx+=1;a=shot['agreement']['350']['aim']
    truthID=None if not shot['hasPlayerHit'] or fs is None or a is None or abs(a-.5)<1e-9 else int(a>.5)
    allrows.append({'headFeatures':fs,'features':fs,'hit':int(shot['hasPlayerHit']) if fs is not None else None,'identity':truthID,
                    'lagMs':c['lagMs'],'setupId':c['setupId'],'predHit':pred['pHit'],'predID':pred['pIdCorrectGivenHit']})
   if fs is not None:eligible+=count
  assert idx==len(shots)
  totalShots+=len(shots);totalPellets+=stat['pellets'];totalFoam+=sum(s['dynamicFoamPellets'] for s in shots)
 out={'schema':'fpsarena-c35p-new-seed-external-audit-v1','status':'PASS','registrationSHA256':reg,
      'matches':12,'independentSetups':6,'C21OffersVerified':offers,'shots':totalShots,'pellets':totalPellets,'eligibleShots':eligible,
      'dynamicFoamPelletsInNaturalMatches':totalFoam,'C21AssignmentMismatches':0,'fireCommandsModified':0,
      'sourcePageAgentSHA256':sha(ROOT/'page-agent.js'),'heads':{}}
 for head in ('hit','identity'):
  trainPrev=MODEL['heads'][head]['trainingPositiveRate'];key='predHit' if head=='hit' else 'predID'
  out['heads'][head]={'constantTrainingPrior':describe(allrows,head,lambda r:trainPrev),
                       'frozenModel':describe(allrows,head,lambda r:r[key]),
                       'BrierDeltaModelMinusConstantCI95ClusterSetup':cluster_ci(allrows,head,key,trainPrev),
                       'byLag':{str(lag):{'constantTrainingPrior':describe([r for r in allrows if r['lagMs']==lag],head,lambda r:trainPrev),
                        'frozenModel':describe([r for r in allrows if r['lagMs']==lag],head,lambda r:r[key])} for lag in (85,215)}}
 dump(OUT/'INDEPENDENT-AUDIT.json',out);print(json.dumps(out,indent=2));return out
if __name__=='__main__':evaluate()
