#!/usr/bin/env python3
"""Independent C27 provenance checker; checks raw results, not only combined labels."""
import hashlib,json,pathlib,collections
ROOT=pathlib.Path(__file__).resolve().parents[1]
REPORT=ROOT/'reports/c27/study36'
def read(p):return json.loads(pathlib.Path(p).read_text(encoding='utf8'))
def sha(b):return hashlib.sha256(b).hexdigest()
def hashfile(p):return sha(pathlib.Path(p).read_bytes())
def require(x,m):
 if not x:raise AssertionError('C27 provenance: '+m)
def check():
 plan=read(REPORT/'PRE-REGISTERED-PLAN.json');frozen=read(REPORT/'FROZEN-MODELS.json')
 nohash={k:v for k,v in plan.items() if k!='registrationSHA256'}
 require(plan['registrationSHA256']==sha(json.dumps(nohash,ensure_ascii=False,separators=(',',':')).encode('utf8')),'plan registration hash')
 require(hashfile(ROOT/plan['frozenArtifactPath'])==plan['frozenArtifactSHA256'],'frozen artifact changed')
 require(hashfile(ROOT/plan['developmentDataPath'])==frozen['developmentDataSHA256']==plan['developmentDataSHA256'],'development changed')
 require(hashfile(ROOT/plan['developmentPlanPath'])==frozen['developmentPlanFileSHA256'],'development plan changed')
 require(hashfile(ROOT/plan['previousC26DataPath'])==plan['previousC26DataSHA256'],'C26 cohort changed')
 srchash=sha('|'.join(sha((ROOT/p).read_bytes()) for p in plan['sourcePaths']).encode())
 require(srchash==plan['sourceSHA256'],'source changed after preregistration')
 jobs=plan['jobs'];require(len(jobs)==36,'missing preregistered jobs')
 require(frozen['selectedKind']==frozen['candidates'][frozen['selectedIndex']]['kind'],'changed selection')
 valid=read(REPORT/'COMBINED-DATASET.json')
 require(len(valid['matches'])==36,'combined missing matches')
 indexed={(m['metadata']['map'],m['metadata']['loadout'],m['metadata']['seed']):m for m in valid['matches']}
 seeds=set();windows=0;positives=0;policies=collections.Counter()
 for j in jobs:
  require(j['seed'] not in seeds,'duplicate seed');seeds.add(j['seed'])
  rp=REPORT/(j['id']+'.result.json');dp=REPORT/(j['id']+'.dataset.json')
  require(rp.exists() and dp.exists(),'missing matched raw artifacts '+j['id'])
  result=read(rp);data=read(dp)
  require(result['profile']=='release' and result['seconds']==plan['seconds'] and result['opponentPolicy']==j['opponents'] and result['snapshotLagMs']==j['lagMs'],'result configuration mismatch')
  require(result['classicMaps']==[j['map']] and result['traineePrimary']==j['weapon'],'result map/weapon mismatch')
  require(len(result['results'])==1 and result['results'][0]['opponentPolicy']==j['opponents'] and result['results'][0]['errors']==0,'result opponent mismatch/errors')
  require(len(data['matches'])==1,'dataset match missing');m=data['matches'][0]
  require(m==indexed[(j['map'],j['weapon'],j['seed'])],'combined mismatch')
  z=m['metadata'];require(z['seed']==j['seed'] and z['map']==j['map'] and z['loadout']==j['weapon'] and z['seconds']==plan['seconds'] and z['snapshotLagMs']==j['lagMs'] and z['observerOnly'] and not z['productionActuation'],'metadata mismatch')
  policies[j['opponents']]+=1
  for w in m['windows']:
   if w['complete']:
    windows+=1;positives+=int(w['label']['hostileWeaponHitEvents']>0)
 require(dict(policies)=={'stress':12,'mixed':12,'official':12},'opponent imbalance')
 return {'rawResultDatasetPairs':len(jobs),'distinctSeeds':len(seeds),'windows':windows,'positive':positives,'byOpponent':dict(policies),'planSHA256':plan['registrationSHA256'],'frozenSHA256':hashfile(REPORT/'FROZEN-MODELS.json'),'sourceSHA256':srchash}
if __name__=='__main__':print(json.dumps(check(),indent=2))
