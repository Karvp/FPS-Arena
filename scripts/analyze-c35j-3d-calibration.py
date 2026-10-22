#!/usr/bin/env python3
"""Independent C35-J log validation and descriptive calibration analysis."""
import hashlib,json,random,importlib.util
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35j/pilot-18-fresh-3d-v2'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def audit():
 frozen=load(OUT/'FROZEN-DESIGN.json');executed=load(OUT/'EXECUTION-AUDIT.json');reg=sha(OUT/'FROZEN-DESIGN.json')
 assert executed['registrationSHA256']==reg
 for source,digest in frozen['sourceSHA256'].items():assert sha(ROOT/source)==digest,source
 assert len(executed['matches'])==len(frozen['cases'])==36
 indexed={m['id']:m for m in executed['matches']}
 results=defaultdict(lambda:Counter());groups=defaultdict(Counter)
 # Independently rerun the original C35-H ledger checker (C21 hash, C16 arms,
 # fire invariants), not just compare counts logged by our new observer.
 spec=importlib.util.spec_from_file_location('c35h_verify',ROOT/'scripts/analyze-c35h-macro-pilot.py')
 c35h=importlib.util.module_from_spec(spec);spec.loader.exec_module(c35h);c35h.OUT=OUT
 pairs=defaultdict(dict)
 for c in frozen['cases']:
  rec=indexed[c['id']];pre=OUT/'matches'/c['id']
  c35h.load(c,reg)  # exact C21 integer assignment + C16 original safe ledger
  files={kind:Path(f'{pre}.{kind}.json') for kind in ['result','dataset','fire','macro','lane','calibration']}
  for kind,p in files.items():assert sha(p)==rec['sha256'][kind],(c['id'],kind)
  calib=load(files['calibration'])['traces'][0]
  lane=load(files['lane'])['traces'][0]
  fire=load(files['fire'])['traces'][0]
  result=load(files['result'])['aggregate']
  ct=calib['counts'];li=lane['counts'];fi=fire['counts']
  assert ct['fireTicks']==li['sampledFire']==fi['incumbentFireTicks']==len(calib['rows']),c['id']
  assert ct['validPublic']+ct['invalidPublic']==ct['fireTicks'],c['id']
  assert ct['storedDropped']==ct['fireModified']==0,c['id']
  assert ct['serverShots']==li['sampledServerShots']==result['shots'],c['id']
  # Server hits can also come from non-firing ticks/skills; compare sampled fire ticks only.
  assert ct['serverHits']==li['sampledServerHits'],c['id']
  assert result['agentErrors']==0
  for a,b in zip(calib['rows'],lane['rows']):
   assert a['t']==b['time'] and a['public']['legacy2D']==b['staticFootprintClear'],c['id']
   assert a['serverLabelsAfterStep']==b['serverLabelsAfterStep'],c['id']
   assert a['postStepOracle']['phase']=='POST_GAME_STEP_DIAGNOSTIC_ONLY'
  for k,v in ct.items():
   if isinstance(v,int):results[c['policy']][k]+=v;groups[c['gun']][k]+=v
  pairs[c['setupId']][c['policy']]={'shots':result['shots'],'micro':result['shots'], 'calib':ct}
 assert len(pairs)==18 and all(set(v)=={'observe','lateral'} for v in pairs.values())
 data={p:dict(v) for p,v in results.items()}
 # cluster bootstrap of paired mismatch rate, descriptive only
 chunks=[]
 for pair in pairs.values():
  a=pair['observe']['calib'];b=pair['lateral']['calib']
  chunks.append((a['public2DBlocked3DClear'],a['validPublic'],b['public2DBlocked3DClear'],b['validPublic']))
 rng=random.Random(3500102);bs=[]
 for _ in range(4000):
  sampled=[chunks[rng.randrange(len(chunks))] for j in chunks]
  x0=sum(i[0] for i in sampled);d0=sum(i[1] for i in sampled)
  x1=sum(i[2] for i in sampled);d1=sum(i[3] for i in sampled)
  if d0 and d1:bs.append((x1/d1)-(x0/d0))
 bs.sort()
 output={'schema':'fpsarena-c35j-observational-calibration-analysis-v1','registrationSHA256':reg,
  'matches':36,'setups':18,'simulatedMinutes':36,'c21AndC16Rehash':'PASS','policies':data,
  'perWeapon':{k:dict(v) for k,v in groups.items()},
  'descriptiveBlocked2DClear3DRate':{p:(v['public2DBlocked3DClear']/v['validPublic'] if v['validPublic'] else None) for p,v in data.items()},
  'pairedSetupBootstrapDifferenceLateralMinusObserve':{'estimate':(data['lateral']['public2DBlocked3DClear']/data['lateral']['validPublic']-data['observe']['public2DBlocked3DClear']/data['observe']['validPublic']) if data['lateral']['validPublic'] and data['observe']['validPublic'] else None,
   'interval95':[bs[int(.025*len(bs))],bs[int(.975*len(bs))]] if bs else None,'iterations':len(bs)},
  'disclaimer':'Descriptive geometry quality only: post-step labels are not actual shot-ray or counterfactual hit labels; no policy promotion.'}
 (OUT/'ANALYSIS.json').write_text(json.dumps(output,indent=2,sort_keys=True)+'\n')
 print('C35J 36/36 audited',json.dumps(data,sort_keys=True),flush=True)
 return output
if __name__=='__main__':audit()
