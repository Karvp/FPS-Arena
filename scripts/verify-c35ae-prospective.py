#!/usr/bin/env python3
"""Independent evidence audit of preregistered C35AE new-seed Game.step matches.
Returns no false labels for action not assigned; verifies all shot counters.
"""
from pathlib import Path
from collections import Counter,defaultdict
import hashlib,json,sys
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ae/prospective-24'

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def u32(x):return x&0xffffffff
def mix(x):
 x=u32(x+0x9e3779b9);x=u32((x^(x>>16))*0x85ebca6b);x=u32((x^(x>>13))*0xc2b2ae35);return u32(x^(x>>16))
def arm(seed,i):return 'control' if mix(u32(seed^u32(i*0x69ba01d3)^0xc35ad734))<0x80000000 else 'toggle'
def c21(seed,i):return ['baseline','micro-left','micro-right'][min(2,int(mix(u32(seed^u32(i*0x517cc1b7)^0xc21f7a39))/4294967296*3))]
def need(a,msg):
 if not a:raise AssertionError(msg)
def main():
 design=read(O/'FROZEN-DESIGN.json');ex=read(O/'EXECUTION-AUDIT.json');reg=sha(O/'FROZEN-DESIGN.json')
 need(len(design['cases'])==24 and len(ex['cases'])==24 and reg==ex['registrationSHA256'],'registration')
 for p,h in design['sourceSHA256'].items():need(sha(R/p)==h,'source checksum drift '+p)
 need(sha(R/'reports/c35ae/offline-ads-value/FROZEN-ADS-VALUE-MODELS.json')==design['frozenNeuralModelSHA256'],'model refitted after preregistration')
 need(sha(R/'reports/c35ae/offline-ads-value/FROZEN-DESIGN.json')==design['trainingRegistrationSHA256'],'train design refitted')
 rec={q['id']:q for q in ex['cases']};totalShots=0;totalPellets=0;ads=0;micro=0;rows=[];byarm=defaultdict(lambda:dict(kills=0,deaths=0,shots=0,hits=0,agentErrors=0,matches=0))
 for c in design['cases']:
  b=O/'matches'/c['id']
  for suff,h in rec[c['id']]['sha256'].items():need(sha(str(b)+'.'+suff+'.json')==h,'output checksum '+c['id']+suff)
  result=read(str(b)+'.result.json');agg=result['aggregate'];bt=byarm[c['arm']]
  bt['matches']+=1
  for k,s in (('kills','kills'),('deaths','deaths'),('shots','shots'),('hits','hits'),('agentErrors','agentErrors')):bt[k]+=agg[s]
  need(agg['agentErrors']==0,'agent error '+c['id'])
  aim=read(str(b)+'.aim.json')['traces'][0]
  need(agg['shots']==len(aim['rows'])==aim['counts']['shots'] and aim['counts']['fireModified']==0,'aim shot parity')
  need(aim['counts']['serverShotMismatches']==0 and aim['counts']['droppedRows']==0,'aim mismatch')
  totalShots+=agg['shots'];totalPellets+=aim['counts']['pellets'];need(aim['counts']['pellets']==sum(q['serverLabelsAfterStep']['pelletCount'] for q in aim['rows']),'pellet count')
  ds=read(str(b)+'.dataset.json')['matches'][0];need(ds['metadata']['registrationSHA256']==reg,'registration metadata')
  for i,x in enumerate(ds['offers'],1):need(x['selectedAction']==c21(c['seed'],i),'C21 mismatch');micro+=1
  trace=read(str(b)+'.prefire.json')['traces'][0]
  need(trace['setupId']==c['setupId'] and trace['weapon']==c['gun'] and trace['policy']==c['arm'],'identity')
  need(trace['counts']['fireModified']==0,'fire mutation')
  if c['arm']=='observe':need(not trace['rows'],'passive observers must not intervene')
  for i,x in enumerate(trace['rows'],1):
   need(x['index']==i and x['assignedArm']==arm(c['seed'],i),'ADS assignment');ads+=1
   need(x['propensity']==.5 and x['assignmentDistribution']=={'control':.5,'toggle':.5},'invalid propensity')
   need(x['unselectedOutcome'] is None and x['provenance']=='PRE_STEP_PUBLIC_RANDOMIZED_ADS_ONLY','leakage')
   need(x['publicFeatures']['provenance']=='PUBLIC_BEFORE_GAME_STEP_ONLY','data provenance')
   before=x['baselineCommand'];after=x['firstCommand'];need(not before['fire'] and not after['fire'],'fire intent manipulated')
   need(all(after.get(k)==v for k,v in before.items() if k!='aim'),'control not ADS only')
   need(after['aim']==(before['aim'] if x['assignedArm']=='control' else not before['aim']),'ADS assignment mismatch')
   o=x['outcome'];need(o['confirmedBallisticShots']==o['serverShots'] and o['hitShots']<=o['serverShots'],'ballistic parity')
   need(bool(o['complete'])!=bool(o['censored']),'censor consistency');rows.append({'gun':c['gun'],'setup':c['setupId'],'arm':x['assignedArm'],'baselineADS':x['baselineADS'],'complete':o['complete'],'hit':int(o['hitShots']>0)})
 result={'schema':'fpsarena-c35ae-prospective-independent-audit-v1','status':'PASS','matches':24,'randomAssignments':ads,'c21Assignments':micro,'shots':totalShots,'pellets':totalPellets,'byArm':dict(byarm),'completedFactual':sum(x['complete'] for x in rows),'censored':sum(not x['complete'] for x in rows),'sourceChecksumPass':True,'datasetChecksumPass':True,'modelFrozenPass':True,'fireMutations':0,'unselectedOutcomeLabels':0}
 (O/'INDEPENDENT-AUDIT.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
