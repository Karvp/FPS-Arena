#!/usr/bin/env python3
"""Independently verify frozen source, match config, C21 and shot truth."""
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35n_shot_outcome import sha,load,dump,parse_match
OUT=ROOT/'reports/c35n/new-seed-18'
def h32(x):
 x=(x+0x9e3779b9)&0xffffffff;x=((x^(x>>16))*0x85ebca6b)&0xffffffff
 x=((x^(x>>13))*0xc2b2ae35)&0xffffffff;return (x^(x>>16))&0xffffffff
def arm(seed,index):
 v=h32((seed^(index*0x517cc1b7)^0xc21f7a39)&0xffffffff)/4294967296
 return ['baseline','micro-left','micro-right'][min(2,int(v*3))]
def audit():
 plan=load(OUT/'FROZEN-DESIGN.json');reg=sha(OUT/'FROZEN-DESIGN.json')
 assert len(plan['cases'])==18
 for name,digest in plan['sourceSHA256'].items():assert sha(ROOT/name)==digest,name
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 execution=load(OUT/'EXECUTION-AUDIT.json');assert execution['registrationSHA256']==reg
 assert len(execution['cases'])==18
 byid={x['match']:x for x in execution['cases']}
 offers=shots=pellets=misses=firemods=0
 for case in plan['cases']:
  p=OUT/'matches'/case['id'];e=byid[case['id']]
  for key,digest in e['hashes'].items():assert sha(Path(str(p)+f'.{key}.json'))==digest,(p,key)
  result=load(str(p)+'.result.json');ds=load(str(p)+'.dataset.json')
  tr=load(str(p)+'.ballistic.json')['traces'][0]
  assert result['aggregate']['agentErrors']==0 and result['seconds']==case['seconds']
  assert result['snapshotLagMs']==case['lagMs'] and result['traineePrimary']==case['gun']
  assert result['opponentPolicy']==case['opponents']
  assert ds['registrationSHA256']==reg
  m=ds['matches'][0];assert m['metadata']['seed']==case['seed'] and m['metadata']['map']==case['map']
  assert m['metadata']['policy']=='shadow80' and m['metadata']['registrationSHA256']==reg
  assert len(m['offers'])==len(m['c35c']['offers'])
  assert sum(bool(x['eligible']) for x in m['c35c']['preoffers'])==len(m['offers'])
  for i,o in enumerate(m['offers'],1):
   assert o['assignedAction']==arm(case['seed'],i),(case['id'],i)
   assert o['validity']['preActionPublicFeaturesOnly'] and o['validity']['serverLabelsOnlyAfterAssignment']
  rs=parse_match(case,Path(str(p)+'.ballistic.json'))
  assert len(rs)==result['aggregate']['shots']==tr['counts']['confirmedShots']
  assert all(x['public']['valid'] in [True,False] for x in rs)
  assert tr['counts']['fireModified']==0 and tr['counts']['storedDropped']==0
  offers+=len(m['offers']);shots+=len(rs);pellets+=sum(x['pellets'] for x in rs)
  misses+=sum(not x['hasPlayerHit'] for x in rs);firemods+=tr['counts']['fireModified']
 summary=load(OUT/'ANALYSIS.json')['overall']
 assert shots==summary['shots'] and pellets==summary['pellets'] and misses==summary['shotsWithNoPlayerHit']
 o={'schema':'fpsarena-c35n-independent-audit-v1','status':'PASS',
    'matches':len(plan['cases']),'frozenRegistrationSHA256':reg,'sourceFrozen':True,
    'originalProductionPageAgentSHA256':sha(ROOT/'page-agent.js'),
    'C21AssignmentMismatches':0,'originalC16SafetyGatesPreserved':True,
    'modifiedFireCommands':firemods,'offers':offers,'shots':shots,'pellets':pellets,
    'unscoredNoPlayerHitShots':misses,'newMotorPolicy':'NONE'}
 dump(OUT/'INDEPENDENT-AUDIT.json',o);print(json.dumps(o,indent=2));return o
if __name__=='__main__':audit()
