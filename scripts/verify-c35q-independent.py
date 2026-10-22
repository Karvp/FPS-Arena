#!/usr/bin/env python3
"""Independent C35-Q TDM, C16/C21, shot/pellet and model source audit.
No reference to mutable in-game state is passed to the predictor.
"""
from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha,join_case
from c35q_robustness import run,SOURCE
def hash32(x):
 x=(x+0x9e3779b9)&0xffffffff
 x=((x^(x>>16))*0x85ebca6b)&0xffffffff
 x=((x^(x>>13))*0xc2b2ae35)&0xffffffff
 return (x^(x>>16))&0xffffffff
def arm(seed,index):
 a=hash32((seed^(index*0x517cc1b7)^0xc21f7a39)&0xffffffff)/4294967296
 return ('baseline','micro-left','micro-right')[min(2,int(a*3))]
def verify():
 d=load(SOURCE/'FROZEN-DESIGN.json');audit=load(SOURCE/'EXECUTION-AUDIT.json')
 assert d['schema']=='fpsarena-c35q-cross-lag-new-seeds-prereg-v1'
 assert audit['registrationSHA256']==sha(SOURCE/'FROZEN-DESIGN.json')
 for src,digest in d['sourceSHA256'].items():assert sha(ROOT/src)==digest,src
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 byid={a['id']:a for a in audit['matches']}
 assert len(byid)==len(d['cases'])==12
 total_shots=total_pellets=offers=0
 for c in d['cases']:
  base=SOURCE/'matches'/c['id'];rec=byid[c['id']]
  for kind,digest in rec['SHA256'].items():assert sha(str(base)+f'.{kind}.json')==digest,(c['id'],kind)
  result=load(str(base)+'.result.json');assert result['snapshotLagMs']==c['lagMs']
  assert result['aggregate']['agentErrors']==0
  ds=load(str(base)+'.dataset.json');assert ds['registrationSHA256']==audit['registrationSHA256']
  m=ds['matches'][0];assert m['metadata']['seed']==c['seed']
  assert m['metadata']['policy']=='shadow80'
  assert len(m['offers'])==len(m['c35c']['offers'])
  assert sum(bool(x['eligible']) for x in m['c35c']['preoffers'])==len(m['offers'])
  for i,o in enumerate(m['offers'],1):
   assert o['assignedAction']==arm(c['seed'],i)
   assert o['validity']['preActionPublicFeaturesOnly']
   assert o['validity']['serverLabelsOnlyAfterAssignment']
  offers+=len(m['offers'])
  shots,stat=join_case(c,SOURCE/'matches')
  conf=load(str(base)+'.confidence.json')['traces'][0]
  assert conf['counts']['fireModified']==0 and conf['counts']['storedDropped']==0
  assert len(shots)==conf['counts']['confirmedShots']
  assert stat['pellets']==sum(x['pellets'] for x in shots)
  total_shots+=len(shots);total_pellets+=stat['pellets']
 stats=run(write=False)
 assert stats['gates']['liveControl'] is False
 out={'schema':'fpsarena-c35q-independent-audit-v1','status':'PASS','matches':12,
 'setups':6,'C21VerifiedOffers':offers,'C21Mismatches':0,'fireModified':0,
 'shotsReconciled':total_shots,'pelletsReconciled':total_pellets,
 'researchOnly':True,'productionSHA256':sha(ROOT/'page-agent.js'),
 'modelSHA256':stats['modelSha256']}
 dump(SOURCE/'INDEPENDENT-AUDIT.json',out)
 print(json.dumps(out,indent=2));return out
if __name__=='__main__':verify()
