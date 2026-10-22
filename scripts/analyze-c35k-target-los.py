#!/usr/bin/env python3
"""Independent identity/LOS observer audit, rehashing original C21 assignments."""
from pathlib import Path
import hashlib,json,importlib.util,collections,random
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35k/pilot-18-fresh'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def audit():
 design=read(OUT/'FROZEN-DESIGN.json');execution=read(OUT/'EXECUTION-AUDIT.json');reg=sha(OUT/'FROZEN-DESIGN.json')
 assert reg==execution['registrationSHA256']
 for file,digest in design['sourceSHA256'].items():assert sha(ROOT/file)==digest,file
 assert len(design['cases'])==len(execution['matches'])==18
 index={x['id']:x for x in execution['matches']}
 spec=importlib.util.spec_from_file_location('c35h_audit',ROOT/'scripts/analyze-c35h-macro-pilot.py')
 h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);h.OUT=OUT
 totals=collections.Counter();weapons=collections.defaultdict(collections.Counter)
 byMatch=[];denominators=[]
 for c in design['cases']:
  files={kind:Path(str(OUT/'matches'/c['id'])+f'.{kind}.json') for kind in ['result','dataset','fire','macro','lane','calibration','identity']}
  for kind,f in files.items():assert sha(f)==index[c['id']]['sha256'][kind],(c['id'],kind)
  h.load(c,reg)  # independently reproduces integer C21 hash + C16 safe offer identity
  identity=read(files['identity'])['traces'][0];j=read(files['calibration'])['traces'][0]
  legacy=read(files['lane'])['traces'][0];result=read(files['result'])['aggregate']
  x=identity['counts'];y=j['counts'];z=legacy['counts']
  assert x['fireTicks']==y['fireTicks']==z['sampledFire']==len(identity['rows'])==len(j['rows'])==len(legacy['rows'])
  assert x['shots']==y['serverShots']==z['sampledServerShots']==result['shots']
  assert x['hits']==y['serverHits']==z['sampledServerHits']
  assert x['fireModified']==0 and result['agentErrors']==0
  assert x['validGeometry']==x['clear3D']+x['blocked3D']
  assert x['eligible']>=x['validGeometry'] and x['identityMismatch']<=x['eligible']
  for a,b,d in zip(identity['rows'],j['rows'],legacy['rows']):
   assert a['t']==b['t']==d['time']
   assert a['serverLabelsAfterStep']==b['serverLabelsAfterStep']==d['serverLabelsAfterStep']
   p=a['publicBeforeStep']
   assert 'postStepOracle' not in p and 'serverLabelsAfterStep' not in p
   if p['geometryValid']:
    assert p['nearest3DClear'] in (True,False)
    assert p['legacyC12TargetId']==d['targetId']
  totals.update(x);weapons[c['gun']].update(x)
  byMatch.append({'id':c['id'],'gun':c['gun'],'map':c['map'],**x})
  denominators.append((x['identityMismatch'],x['eligible']))
 # Cluster bootstrap across whole independently seeded matches: descriptive only.
 rng=random.Random(350011);v=[]
 for _ in range(3000):
  sampled=[denominators[rng.randrange(len(denominators))] for _ in denominators]
  n=sum(i for i,j in sampled);d=sum(j for i,j in sampled)
  if d:v.append(n/d)
 v.sort()
 output={'schema':'fpsarena-c35k-public-identity-calibration-v1','sourceSHA256':reg,
  'matches':len(byMatch),'simulatedMinutes':sum(c['seconds'] for c in design['cases'])/60,
  'totals':dict(totals),'perWeapon':{k:dict(v) for k,v in weapons.items()},'perMatch':byMatch,
  'identityMismatchRate':totals['identityMismatch']/totals['eligible'] if totals['eligible'] else None,
  'bootstrap95AcrossMatchSeeds':[v[int(.025*len(v))],v[int(.975*len(v))]] if v else None,
  'c21C16OriginalLedger':'PASS','status':'MEASUREMENT_ONLY_C36_BLOCKED',
  'warnings':['Old C12/C35I target mismatch combines ally and absent/stale targets; not all mismatches are confirmed teammates',
    '3D eye/body-center static ray is NOT actual bullet ray; spread/rewind/dynamic cover excluded',
    '18 matches are only 18 independent clusters; no motor efficacy or action-value established']}
 p=OUT/'ANALYSIS.json';p.write_text(json.dumps(output,indent=2,sort_keys=True)+'\n')
 print('C35K AUDIT PASS 18 matches',json.dumps({k:totals[k] for k in ['fireTicks','eligible','identityMismatch','validGeometry','clear3D','blocked3D','belowRay','intersectsRayHeight','shots']},sort_keys=True),flush=True)
 return output
if __name__=='__main__':audit()
