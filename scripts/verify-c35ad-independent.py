#!/usr/bin/env python3
"""Independent independent C35AD PRNG, source/data hashes, C21 and ballistic audit."""
from pathlib import Path
from collections import defaultdict
import json,hashlib
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ad/matched-72'
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def u32(x):return x&0xffffffff
def mix(x):
 x=u32(x+0x9e3779b9);x=u32((x^(x>>16))*0x85ebca6b);x=u32((x^(x>>13))*0xc2b2ae35);return u32(x^(x>>16))
def assigned(seed,index):return 'control' if mix(u32(seed^u32(index*0x69ba01d3)^0xc35ad734))<0x80000000 else 'toggle'
def c21(seed,index):return ['baseline','micro-left','micro-right'][min(2,int(mix(u32(seed^u32(index*0x517cc1b7)^0xc21f7a39))/4294967296*3))]
def check(v,msg):
 if not v:raise AssertionError(msg)
def main():
 d=read(O/'FROZEN-DESIGN.json');ex=read(O/'EXECUTION-AUDIT.json')
 check(len(d['cases'])==72 and len(ex['cases'])==72,'missing match');check(ex['registrationSHA256']==sha(O/'FROZEN-DESIGN.json'),'registration mismatch')
 for p,h in d['sourceSHA256'].items():check(sha(R/p)==h,'source mismatch '+p)
 allrows=[];byarm=defaultdict(lambda:dict(matches=0,kills=0,deaths=0,shots=0,hitEvents=0));totalc21=0;shotledger=0;pellets=0
 indexed={x['id']:x for x in ex['cases']}
 for case in d['cases']:
  ident=case['id'];rec=indexed[ident];b=O/'matches'/ident
  for suffix,h in rec['sha256'].items():check(sha(str(b)+'.'+suffix+'.json')==h,'dataset tampered '+ident+suffix)
  result=read(str(b)+'.result.json');agg=result['aggregate'];aim=read(str(b)+'.aim.json')['traces'][0]
  check(agg['agentErrors']==0,'agent errors '+ident)
  check(aim['counts']['shots']==agg['shots']==len(aim['rows']),'server shot parity '+ident)
  check(aim['counts']['fireModified']==0 and aim['counts']['serverShotMismatches']==0 and aim['counts']['droppedRows']==0,'aim parity')
  check(aim['counts']['pellets']==sum(q['serverLabelsAfterStep']['pelletCount'] for q in aim['rows']),'pellet parity')
  shotledger+=agg['shots'];pellets+=aim['counts']['pellets']
  x=byarm[case['arm']];x['matches']+=1;x['kills']+=agg['kills'];x['deaths']+=agg['deaths'];x['shots']+=agg['shots'];x['hitEvents']+=agg['hits']
  if case['arm']=='release':continue
  ds=read(str(b)+'.dataset.json')['matches'][0]
  check(ds['metadata']['registrationSHA256']==ex['registrationSHA256'],'registration mismatch '+ident)
  for idx,q in enumerate(ds['offers'],1):check(q['selectedAction']==c21(case['seed'],idx),'C21 assignment '+ident);totalc21+=1
  t=read(str(b)+'.prefire.json')['traces'][0]
  check(t['setupId']==case['setupId'] and t['policy']==case['arm'],'trace identity '+ident)
  n=t['counts'];check(n['fireModified']==0 and n['completed']+n['censored']==n['eligible']==len(t['rows']),'offer count')
  if case['arm']=='observe':check(len(t['rows'])==0,'observe has offers')
  for i,q in enumerate(t['rows'],1):
   check(q['index']==i and q['schema']=='fpsarena-c35ad-prefire-ads-v1' and q['assignedArm']==assigned(case['seed'],i),'ADS assignment '+ident)
   check(q['propensity']==.5 and q['assignmentDistribution']=={'control':.5,'toggle':.5} and q['unselectedOutcome'] is None,'propensity/leak')
   check(q['publicFeatures']['provenance']=='PUBLIC_BEFORE_GAME_STEP_ONLY' and q['publicFeatures']['aimAngleDeg']<=14 and q['publicFeatures']['targetAgeMs']<=275,'public eligibility')
   before=q['baselineCommand'];after=q['firstCommand'];check(not before['fire'] and not after['fire'],'forbidden fire change')
   check(all(after.get(k)==v for k,v in before.items() if k!='aim'),'non-ADS mutated')
   check(after['aim']==(before['aim'] if q['assignedArm']=='control' else not before['aim']),'first dose not applied')
   o=q['outcome'];check(o['confirmedBallisticShots']==o['serverShots'] and o['hitShots']<=o['serverShots'] and o['hitPellets']>=o['hitShots'],'shot truth')
   check((o['complete'] and not o['censored']) or (not o['complete'] and o['censored']),'censor/completion parity')
   allrows.append(dict(setup=case['setupId'],weapon=case['gun'],baselineADS=q['baselineADS'],arm=q['assignedArm'],shots=o['serverShots'],hitShots=o['hitShots'],hitEvents=o['serverHitEvents'],kills=o['serverKills'],damageTaken=o['damageTaken'],changedTicks=q['changedTicks'],complete=o['complete'],t=q['start']))
 check(shotledger>0 and pellets>=shotledger,'no real ballistic data')
 result=dict(schema='fpsarena-c35ad-independent-audit-v1',status='PASS',matches=len(d['cases']),setupCount=24,randomAssignments=len(allrows),c21Assignments=totalc21,
  shotsReconciled=shotledger,pelletsReconciled=pellets,byArm=dict(byarm),rows=allrows,fireMutations=0,sourceSHA256Verified=True,allOutputHashesVerified=True,
  caveat='All decisions pre-step; outcomes only measured after-step for selected arm. No labels for unselected movements or aim decisions. Offers within a match are dependent.')
 (O/'INDEPENDENT-AUDIT.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2))
if __name__=='__main__':main()
