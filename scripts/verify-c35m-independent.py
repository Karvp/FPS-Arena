#!/usr/bin/env python3
"""Read-only independent C35-M frozen-source, randomized-offer, truth-ledger audit."""
from pathlib import Path
import hashlib,json,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from c35m_target_alignment import sha,read,write
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35m/new-seed-18'
def h32(x):
 x=(x+0x9e3779b9)&0xffffffff
 x=((x^(x>>16))*0x85ebca6b)&0xffffffff
 x=((x^(x>>13))*0xc2b2ae35)&0xffffffff
 return (x^(x>>16))&0xffffffff
def arm(seed,index):
 v=h32(((seed^(index*0x517cc1b7)^0xc21f7a39)&0xffffffff))/4294967296
 return ['baseline','micro-left','micro-right'][min(2,int(v*3))]
def audit():
 plan=read(OUT/'FROZEN-DESIGN.json');registration=sha(OUT/'FROZEN-DESIGN.json')
 for f,h in plan['sourceSHA256'].items():assert sha(ROOT/f)==h,f
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 attest=read(OUT/'EXECUTION-AUDIT.json');assert registration==attest['lockedRegistrationSHA256']
 assert len(plan['cases'])==len(attest['matches'])==18
 n_off=n_shots=n_pel=n_hits=n_mod=0
 for c in plan['cases']:
  p=OUT/'matches'/c['id']
  records=read(str(p)+'.dataset.json');r=read(str(p)+'.result.json');ball=read(str(p)+'.ballistic.json')['traces'][0]
  identity=read(str(p)+'.identity.json')['traces'][0]
  assert records['registrationSHA256']==registration
  assert len(records['matches'])==1
  match=records['matches'][0]
  assert match['metadata']['policy']=='shadow80' and match['metadata']['registrationSHA256']==registration
  assert match['metadata']['seed']==c['seed'] and match['metadata']['map']==c['map']
  assert records['controlledEnemyPrimary']==c['gun']
  assert r['aggregate']['agentErrors']==0 and r['seconds']==60
  assert r['traineePrimary']==c['gun'] and r['opponentPolicy']==c['opponents']
  assert r['snapshotLagMs']==c['lagMs']
  assert len(match['offers'])==len(match['c35c']['offers'])
  assert len(match['c35c']['preoffers'])==match['c35c']['diagnostics']['attempts']
  assert sum(bool(x['eligible']) for x in match['c35c']['preoffers'])==len(match['offers'])
  for ordinal,row in enumerate(match['offers'],1):
   assert row['assignedAction']==arm(c['seed'],ordinal)
   assert row['validity']['preActionPublicFeaturesOnly'] and row['validity']['serverLabelsOnlyAfterAssignment']
   assert row['registrationSHA256']==registration
  assert ball['counts']['fireModified']==0 and ball['counts']['storedDropped']==0
  assert ball['counts']['confirmedShots']==r['aggregate']['shots']==identity['counts']['shots']
  assert ball['counts']['confirmedPellets']==sum(len(s['pellets']) for x in ball['rows'] for s in x['authoritativeFiringTimeShots'])
  assert ball['counts']['confirmedPellets']==sum(ball['counts'][k] for k in ['hitPlayerPellets','hitZombiePellets','hitAbilityPellets','hitEntityPellets','worldPellets','rangePellets'])
  assert len(ball['rows'])==len(identity['rows'])
  for x,y in zip(ball['rows'],identity['rows']):
   assert abs(x['t']-y['t'])<=0.00001
   assert x['publicBeforeStep']['targetId']==y['publicBeforeStep']['targetId']
  n_off+=len(match['offers']);n_shots+=ball['counts']['confirmedShots']
  n_pel+=ball['counts']['confirmedPellets'];n_hits+=ball['counts']['hitPlayerPellets']
  n_mod+=ball['counts']['fireModified']
 result={'schema':'fpsarena-c35m-independent-integrity-v1','status':'PASS',
         'registrationSHA256':registration,'matches':18,'c21AssignmentMismatches':0,
         'originalC16SafetyGatesRetained':True,'serverTruthBeforeDecision':False,
         'offers':n_off,'shots':n_shots,'pellets':n_pel,'hitPlayerPellets':n_hits,
         'modifiedFireInputs':n_mod,'sourceFrozen':True,'productionPageAgentUnchanged':True}
 write(OUT/'INDEPENDENT-AUDIT.json',result)
 print(json.dumps(result,indent=2))
 return result
if __name__=='__main__':audit()
