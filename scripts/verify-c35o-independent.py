#!/usr/bin/env python3
"""C35-O independent source, C21 assignment, safety, shot and trace audit."""
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha,join_case,analyze
from c35n_shot_outcome import public_cues
OUT=ROOT/'reports/c35o/paired-latency-48'
def h32(x):
 x=(x+0x9e3779b9)&0xffffffff;x=((x^(x>>16))*0x85ebca6b)&0xffffffff
 x=((x^(x>>13))*0xc2b2ae35)&0xffffffff;return (x^(x>>16))&0xffffffff
def arm(seed,index):
 v=h32((seed^(index*0x517cc1b7)^0xc21f7a39)&0xffffffff)/4294967296
 return ('baseline','micro-left','micro-right')[min(2,int(v*3))]
def audit():
 plan=load(OUT/'FROZEN-DESIGN.json');reg=sha(OUT/'FROZEN-DESIGN.json')
 assert len(plan['cases'])==48 and len({c['setupId'] for c in plan['cases']})==12
 for rel,digest in plan['sourceSHA256'].items():assert sha(ROOT/rel)==digest,rel
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 execution=load(OUT/'EXECUTION-AUDIT.json');assert execution['registrationSHA256']==reg
 byid={m['id']:m for m in execution['matches']};assert len(byid)==48
 offers=shots=pellets=misses=foam=mods=0
 for c in plan['cases']:
  p=OUT/'matches'/c['id'];audititem=byid[c['id']]
  for kind,digest in audititem['SHA256'].items():assert sha(str(p)+'.'+kind+'.json')==digest,(c['id'],kind)
  result=load(str(p)+'.result.json');ds=load(str(p)+'.dataset.json');bt=load(str(p)+'.ballistic.json')['traces'][0]
  assert result['aggregate']['agentErrors']==0 and result['snapshotLagMs']==c['lagMs']
  assert result['traineePrimary']==c['gun'] and result['opponentPolicy']==c['opponents']
  assert ds['registrationSHA256']==reg
  m=ds['matches'][0];assert m['metadata']['seed']==c['seed'] and m['metadata']['map']==c['map']
  assert m['metadata']['policy']=='shadow80' and m['metadata']['registrationSHA256']==reg
  assert len(m['offers'])==len(m['c35c']['offers'])
  assert sum(bool(pf['eligible']) for pf in m['c35c']['preoffers'])==len(m['offers'])
  for idx,o in enumerate(m['offers'],1):
   assert o['assignedAction']==arm(c['seed'],idx),(c['id'],idx)
   assert o['validity']['preActionPublicFeaturesOnly'] and o['validity']['serverLabelsOnlyAfterAssignment']
  rows,stat=join_case(c,OUT/'matches');assert len(rows)==bt['counts']['confirmedShots']==result['aggregate']['shots']
  assert bt['counts']['fireModified']==0 and bt['counts']['storedDropped']==0
  offers+=len(m['offers']);shots+=len(rows);pellets+=stat['pellets'];misses+=sum(not x['hasPlayerHit'] for x in rows)
  foam+=sum(x['dynamicFoamPellets'] for x in rows);mods+=bt['counts']['fireModified']
 analysis=analyze(OUT,write=False)['overall'];assert shots==analysis['shots'] and pellets==analysis['pellets']
 summary={'schema':'fpsarena-c35o-independent-audit-v1','status':'PASS','registrationSHA256':reg,'matches':48,
  'matchedSetups':12,'shots':shots,'pellets':pellets,'shotMissesNotAssignedTargetIdentity':misses,
  'offers':offers,'C21AssignmentMismatches':0,'fireCommandsChanged':mods,'dynamicFoamPelletsInNaturalPilot':foam,
  'originalProductionPageAgentSHA256':sha(ROOT/'page-agent.js'),
  'originalC16SafetyGatesUnmodified':True,'motorPolicyPromoted':False}
 dump(OUT/'INDEPENDENT-AUDIT.json',summary)
 print(json.dumps(summary,indent=2));return summary
if __name__=='__main__':audit()
