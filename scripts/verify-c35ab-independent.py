#!/usr/bin/env python3
"""Independent C35-AB source/file hashes, assignment PRNG, per-shot and C21 audit."""
from pathlib import Path
from collections import defaultdict
import json,hashlib
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ab/matched-72'
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def u32(x):return x&0xffffffff
def imul(a,b):return u32(a*b)
def mix32(x):
 x=u32(x+0x9e3779b9);x=imul(x^(x>>16),0x85ebca6b);x=imul(x^(x>>13),0xc2b2ae35);return u32(x^(x>>16))
def assign(seed,index):return 'control' if mix32(u32(seed^imul(index,0x7f4a7c15)^0xab351731))<0x80000000 else 'treatment'
def c21_assign(seed,index):
 u=mix32(u32(seed^imul(index,0x517cc1b7)^0xc21f7a39))/4294967296
 return ['baseline','micro-left','micro-right'][min(2,int(u*3))]
def check(condition,label):
 if not condition:raise AssertionError(label)
def main():
 d=read(O/'FROZEN-DESIGN.json');r=read(O/'EXECUTION-AUDIT.json')
 check(len(d['cases'])==72 and len(r['cases'])==72,'missing match results');check(r['registrationSHA256']==sha(O/'FROZEN-DESIGN.json'),'registration hash')
 for p,h in d['sourceSHA256'].items():check(sha(R/p)==h,'source hash '+p)
 byarm=defaultdict(lambda:dict(matches=0,kills=0,deaths=0,shots=0,hitEvents=0,pellets=0,playerHitPellets=0));bygun=defaultdict(lambda:dict(offers=0,ads=0,hold=0,treated=0))
 offers=[];c21=0;shots=0;pellets=0;trials=0;errors=0
 for c in d['cases']:
  rec=next((x for x in r['cases'] if x['id']==c['id']),None);check(rec is not None,'missing record '+c['id'])
  base=O/'matches'/c['id']
  for k,h in rec['sha256'].items():check(sha(str(base)+'.'+k+'.json')==h,'file SHA mismatch '+c['id']+' '+k)
  result=read(str(base)+'.result.json');aim=read(str(base)+'.aim.json')['traces'][0];a=result['aggregate']
  check(result['results'][0]['seed']==c['seed'] and result['results'][0]['map']==c['map'],'match identity')
  check(a['agentErrors']==0,'agent error');errors+=a['agentErrors']
  check(aim['counts']['shots']==a['shots']==len(aim['rows']) and aim['counts']['fireModified']==0,'shot parity')
  check(aim['counts']['serverShotMismatches']==0 and aim['counts']['droppedRows']==0,'ledger integrity')
  check(sum(z['serverLabelsAfterStep']['pelletCount'] for z in aim['rows'])==aim['counts']['pellets'],'pellet parity')
  shotat={z['t']:z for z in aim['rows']}
  b=byarm[c['arm']];b['matches']+=1;b['kills']+=a['kills'];b['deaths']+=a['deaths'];b['shots']+=a['shots'];b['hitEvents']+=a['hits'];b['pellets']+=aim['counts']['pellets'];b['playerHitPellets']+=aim['counts']['playerHitPellets']
  shots+=a['shots'];pellets+=aim['counts']['pellets']
  if c['arm']!='release':
   import re
   ds=read(str(base)+'.dataset.json')['matches'][0]
   check(ds['metadata']['registrationSHA256']==r['registrationSHA256'],'C21 prereg')
   for idx,offer in enumerate(ds['offers'],1):
    check(offer['selectedAction']==c21_assign(c['seed'],idx),'C21 independent assignment '+c['id'])
    c21+=1
   exp=read(str(base)+'.random.json')['traces'][0]
   check(exp['setupId']==c['setupId'] and exp['counts']['fireChanged']==0,'C35AB setup/boundary')
   if c['arm']=='observe':check(not exp['rows'] and not exp['counts']['interventions'],'observe changed actions')
   else:
    count=exp['counts'];rows=exp['rows']
    check(len(rows)==count['assignments']==count['eligible']==count['control']+count['treatment'],'offer count')
    check(count['confirmedShots']+count['zeroShotOffers']==len(rows),'confirmed shots denominator')
    for i,z in enumerate(rows,1):
     check(z['schema']=='fpsarena-c35ab-aim-motion-randomized-v1','schema')
     check(z['offerIndex']==i and z['assignedArm']==assign(c['seed'],i),'random assignment')
     check(z['propensity']==.5 and z['assignmentDistribution']=={'control':.5,'treatment':.5},'propensities')
     check(z['unselectedOutcome'] is None and z['outcome']['source']=='AUTHORITATIVE_AFTER_GAME_STEP_FACTUAL_ONLY','causal leakage')
     check(z['publicFeatures']['provenance']=='PUBLIC_BEFORE_GAME_STEP_ONLY' and z['publicFeatures']['targetAgeMs']<=225 and z['publicFeatures']['aimAngleDeg']<=4,'invalid public eligibility')
     check(z['baselineCommand']['fire'] and z['executedCommand']['fire'],'forbidden fire rewrite')
     before=z['baselineCommand'];after=z['executedCommand']
     if z['assignedArm']=='control':check(before==after,'control rewritten')
     elif z['axis']=='ads':check(not before['aim'] and after['aim'] and before['motor']==after['motor'],'ADS altered motor')
     elif z['axis']=='hold':check(before['aim'] and after['aim'] and not any(after['motor'].values()),'hold altered aim')
     else:raise AssertionError('bad action axis')
     truth=z['factualShot'];out=z['outcome'];check(out['serverConfirmedShot'] in (0,1),'shot marker')
     check(bool(truth)==bool(out['serverConfirmedShot']),'truth presence')
     ref=shotat.get(z['at'])
     if truth:
      check(ref is not None,'shot missing from C35AA trace')
      y=ref['serverLabelsAfterStep']
      check(y['ads']==truth['ads']==after['aim'] and y['pelletCount']==truth['pelletCount'] and y['playerHit']==truth['playerHit'] and y['playerHitPellets']==truth['playerHitPellets'],'shot truth disagreement')
     else:check(ref is None,'unmarked confirmed shot')
     offers.append(dict(setupId=c['setupId'],weapon=c['gun'],axis=z['axis'],arm=z['assignedArm'],shot=out['serverConfirmedShot'],hit=int(bool(out['serverConfirmedShot'] and out['playerHit'])),pellets=(truth or {}).get('pelletCount',0)))
     bg=bygun[c['gun']];bg['offers']+=1;bg[z['axis']]+=1;bg['treated']+=+(z['assignedArm']=='treatment');trials+=1
 check(shots>0 and pellets>=shots and len(byarm)==3,'overall match parity')
 output=dict(schema='fpsarena-c35ab-independent-audit-v1',status='PASS',designSHA256=r['registrationSHA256'],matchCount=len(d['cases']),setupCount=24,
  sourceSHA256Verified=True,outputSHA256Verified=True,shotsReconciled=shots,pelletsReconciled=pellets,randomizationAssignmentsRecomputed=trials,
  c21AssignmentsRecomputed=c21,agentErrors=errors,fireChanges=0,byArm=dict(byarm),byWeapon=dict(bygun),offers=offers,
  caveat='Outcome only for chosen action; intent-to-treat denominator includes zero-shot offers; historical C21 source algorithm unchanged')
 (O/'INDEPENDENT-AUDIT.json').write_text(json.dumps(output,indent=2,sort_keys=True)+'\n')
 print(json.dumps({k:v for k,v in output.items() if k!='offers'},indent=2))
if __name__=='__main__':main()
