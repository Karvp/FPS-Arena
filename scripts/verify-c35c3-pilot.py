#!/usr/bin/env python3
"""Independent C35-C3 integrity/assignment verification for real Game.step datasets."""
from __future__ import annotations
import hashlib,json,sys
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1];DIR=ROOT/'reports'/'c35c3'/'exploratory-18-pair'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def u32(x):return x&0xffffffff
def h32(x):
 x=u32(x+0x9e3779b9);x=u32((x^(x>>16))*0x85ebca6b)
 x=u32((x^(x>>13))*0xc2b2ae35);return u32(x^(x>>16))
def arm(seed,n):
 v=h32(u32(seed ^u32(n*0x517cc1b7)^0xc21f7a39))/4294967296
 return ('baseline','micro-left','micro-right')[min(2,int(v*3))]
if __name__=='__main__':
 plan=json.loads((DIR/'PRE-REGISTERED-PLAN.json').read_text());h=sha(DIR/'PRE-REGISTERED-PLAN.json')
 for rel,locked in plan['sourceSHA256'].items():
  assert sha(ROOT/rel)==locked, 'locked source changed: '+rel
 assert sha(ROOT/'page-agent.js')=='6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed'
 att=json.loads((DIR/'EXECUTION-ATTESTATION.json').read_text());assert att['registrationSHA256']==h
 assert len(att['matches'])==len(plan['cases'])==36
 from collections import defaultdict
 policy=defaultdict(Counter);pre=[];off=[]
 for case in plan['cases']:
  prefix=case['setupId']+'-'+case['policy'];folder=DIR/'matches'
  ds=folder/(prefix+'.dataset.json');rs=folder/(prefix+'.result.json')
  assert (ds.exists() and rs.exists() and sha(ds)==next(x['dataSHA256'] for x in att['matches'] if x['case']==prefix)),prefix
  doc=json.loads(ds.read_text());rec=doc['matches'][0];result=json.loads(rs.read_text())
  assert len(doc['matches'])==1 and doc['schema']=='fpsarena-c35c-prospective-arbitration-dataset-v1'
  assert doc['registrationSHA256']==h and doc['controlledEnemyPrimary']==case['enemyPrimary']
  assert rec['metadata']['policy']==case['policy'] and rec['metadata']['registrationSHA256']==h
  assert rec['metadata']['seed']==case['seed'] and rec['metadata']['map']==case['map']
  assert result['aggregate']['agentErrors']==0 and result['seconds']==90
  assert result['opponentPolicy']==case['opponents'] and result['snapshotLagMs']==case['lagMs']
  rows=rec['offers'];cw=rec['c35c'];assert len(rows)==len(cw['offers'])
  assert len(cw['preoffers'])==cw['diagnostics']['attempts']
  assert sum(x['eligible'] for x in cw['preoffers'])==len(rows)
  assert all(x['policy']==case['policy'] and x['riskBin']=='unknown' for x in cw['preoffers'])
  assert all(x['predecisionOnly'] is True for x in cw['preoffers'])
  attemptmap={x['attemptId']:x for x in cw['preoffers']}
  for i,(row,ledger) in enumerate(zip(rows,cw['offers']),1):
   assert row['assignedAction']==arm(case['seed'],i)==ledger['assignment'],prefix
   assert row['candidateSet']==['baseline','micro-left','micro-right']
   assert row['eligibilityBeforeAssignment'] is True and row['validity']['serverLabelsOnlyAfterAssignment'] is True
   assert row['public']['source'].startswith('headless client public snapshot')
   assert not row['interrupted'] or row['assignedAction']!='baseline'
   assert row['serverAudit']['neverInput'] is True
   assert ledger['attemptId']==row['c35c']['attemptId'] and ledger['attemptId'] in attemptmap
   assert attemptmap[ledger['attemptId']]['eligible'] is True
   assert ledger['propensity']=={'baseline':1/3,'micro-left':1/3,'micro-right':1/3}
   assert ledger['executedTicks']==(0 if ledger['assignment']=='baseline' else row['executedTicks'])
   assert ledger['complete']==(not row['outcome']['censored'])
   assert ledger['outcome']['hostileHits']==(row['outcome']['hostileWeaponHits'] if ledger['complete'] else None)
   assert ledger['outcome']['shotsLost'] is None
   assert row['validity']['preActionPublicFeaturesOnly'] is True
  pp=case['policy'];policy[pp]['matches']+=1;policy[pp]['offers']+=len(rows)
  policy[pp]['micro']+=sum(x['assignedAction']!='baseline' for x in rows)
  policy[pp]['interruptions']+=sum(x['assignedAction']!='baseline' and x['interrupted'] for x in rows)
  policy[pp]['complete']+=sum(not x['outcome']['censored'] for x in rows)
  policy[pp]['hitPositive']+=sum(not x['outcome']['censored'] and x['outcome']['hostileWeaponHits']>0 for x in rows)
  policy[pp]['attempts']+=len(cw['preoffers'])
  policy[pp]['kills']+=result['aggregate']['kills'];policy[pp]['shots']+=result['aggregate']['shots']
  policy[pp]['hits']+=result['aggregate']['hits'];policy[pp]['deaths']+=result['aggregate']['deaths']
  pre+=cw['preoffers'];off+=cw['offers']
 (DIR/'C35C3-PREOFFERS.jsonl').write_text(''.join(json.dumps(x,separators=(',',':'))+'\n' for x in pre))
 (DIR/'C35C3-OFFERS.jsonl').write_text(''.join(json.dumps(x,separators=(',',':'))+'\n' for x in off))
 payload={'schema':'fpsarena-c35c3-independent-audit-v1','status':'PASS','registrationSHA256':h,
          'matchedSetups':18,'matches':36,'totalPreoffers':len(pre),'totalOffers':len(off),
          'sourceIntegrity':'PASS','productionAgentUnchanged':True,'C21AssignmentMismatch':0,
          'C16SafetyEnforcedByOriginalImplementation':True,'riskCalibration':'NOT_AVAILABLE',
          'byPolicy':{k:dict(v) for k,v in policy.items()},
          'trainingPromotion':'BLOCKED'}
 (DIR/'C35C3-INDEPENDENT-AUDIT.json').write_text(json.dumps(payload,indent=2)+'\n')
 print(json.dumps(payload,indent=2))
