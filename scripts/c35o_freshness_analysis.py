#!/usr/bin/env python3
"""C35-O post-hoc, READ-ONLY join of predecision public candidates to firing-time server pellets.
Authoritative target IDs NEVER leave this analysis and are never policy inputs.
"""
import hashlib,json,random,statistics
from collections import defaultdict
from pathlib import Path
THRESHOLDS=('150','200','275','350')

def load(p): return json.loads(Path(p).read_text())
def dump(p,obj):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(obj,indent=2,sort_keys=True,ensure_ascii=False)+'\n')
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def required(ok,why):
 if not ok:raise ValueError(why)

def join_case(case,folder):
 p=Path(folder)/case['id']
 a=load(str(p)+'.track.json'); b=load(str(p)+'.ballistic.json')
 required(a.get('schema')=='fpsarena-c35o-public-track-traces-v1','invalid public trace schema')
 required(b.get('schema')=='fpsarena-c35l-shot-truth-traces-v1','invalid server ledger schema')
 required(len(a.get('traces',[]))==len(b.get('traces',[]))==1,'unexpected episodes')
 a=a['traces'][0];b=b['traces'][0]
 required(a['counts']['fireModified']==0 and not a['counts']['storedDropped'],'public ledger tampering/truncation')
 required(b['counts']['fireModified']==0 and not b['counts']['storedDropped'],'ballistic ledger tampering/truncation')
 required(len(a['rows'])==len(b['rows']),'misaligned firing intent denominator')
 shots=[];intent=0
 for pub,truth in zip(a['rows'],b['rows']):
  required(abs(pub['t']-truth['t'])<=.000006,'pre-step timestamp mismatch')
  required(pub['publicBeforeStep']['provenance']=='PUBLIC_BEFORE_STEP_ONLY','public provenance missing')
  required(pub['serverLabelsAfterStep']['shots']==truth['serverLabelsAfterStep']['shots'],'shot event count mismatch')
  required(pub['serverLabelsAfterStep']['shots']==len(truth['authoritativeFiringTimeShots']),'unmatched shot list')
  candidates=pub['publicBeforeStep']['thresholdsMs']
  required(set(candidates)==set(THRESHOLDS),'threshold set mismatch')
  for t in THRESHOLDS:
   required(candidates[t]['confidence'] in ('unknown','nominal','stale','very-stale'),'unknown confidence')
   required(not candidates[t]['eligible'] or candidates[t]['aimId'] is not None,'empty eligible identity')
  for low,high in zip(THRESHOLDS,THRESHOLDS[1:]):
   required(not candidates[low]['eligible'] or candidates[high]['eligible'],'coverage must be monotone')
  intent+=1
  for shot in truth['authoritativeFiringTimeShots']:
   required(shot['pelletCount']==len(shot['pellets']) and shot['pelletCount']>0,'missing pellets')
   hit=[v for v in shot['pellets'] if v['hitKind']=='player']
   shots.append({'setupId':case['setupId'],'lagMs':case['lagMs'],'map':case['map'],'gun':case['gun'],
     'hasPlayerHit':bool(hit),'pellets':len(shot['pellets']),'playerPellets':len(hit),
     'dynamicFoamPellets':sum(v['hitKind']=='world' and v.get('worldKind')=='dynamic-foam' for v in shot['pellets']),
     'dynamicCoverBoxes':shot['dynamicCoverBoxes'],'candidates':candidates,
     'agreement':{t:{'aim':sum(str(v['targetId'])==str(candidates[t]['aimId']) for v in hit)/len(hit) if hit and candidates[t]['eligible'] else None,
      'projected':sum(str(v['targetId'])==str(candidates[t]['projectedAimId']) for v in hit)/len(hit) if hit and candidates[t]['projectedAimId'] else None} for t in THRESHOLDS}})
 required(len(shots)==a['counts']['confirmedShots']==b['counts']['confirmedShots'],'shot counts mismatch')
 required(sum(x['pellets'] for x in shots)==b['counts']['confirmedPellets'],'pellet counts mismatch')
 return shots,{'fireIntentTicks':intent,'shots':len(shots),'pellets':sum(x['pellets'] for x in shots)}

def describe(shots):
 result={'shots':len(shots),'shotsWithPlayerHit':sum(s['hasPlayerHit'] for s in shots),
  'pellets':sum(s['pellets'] for s in shots),'dynamicFoamPellets':sum(s['dynamicFoamPellets'] for s in shots),
  'shotsWithDynamicCover':sum(s['dynamicCoverBoxes']>0 for s in shots),'thresholds':{}}
 for t in THRESHOLDS:
  subset=[s for s in shots if s['candidates'][t]['eligible']]
  hit=[s for s in subset if s['hasPlayerHit']]
  a=[s['agreement'][t]['aim'] for s in hit if s['agreement'][t]['aim'] is not None]
  b=[s['agreement'][t]['projected'] for s in hit if s['agreement'][t]['projected'] is not None]
  result['thresholds'][t]={'eligibleShots':len(subset),'shotCoverage':len(subset)/len(shots) if shots else None,
   'hitShotsWithValidCandidate':len(hit),'aimAgreementHitConditional':statistics.mean(a) if a else None,
   'projectedAgreementHitConditional':statistics.mean(b) if b else None,
   'projectedScoredHitShots':len(b),'freshnessAmongEligible':{c:sum(s['candidates'][t]['confidence']==c for s in subset)
    for c in ('nominal','stale','very-stale')}}
 return result

def analyze(root,write=True):
 root=Path(root);design=load(root/'FROZEN-DESIGN.json');cases=design['cases'];allrows=[];audits=[]
 required(design['schema']=='fpsarena-c35o-paired-latency-factorial-v1','design schema mismatch')
 for case in cases:
  rows,audit=join_case(case,root/'matches');allrows.extend(rows);audits.append({'id':case['id'],**audit})
 bylag={str(lag):describe([s for s in allrows if s['lagMs']==lag]) for lag in sorted(set(c['lagMs'] for c in cases))}
 bysetup=defaultdict(list)
 for r in allrows:bysetup[r['setupId']].append(r)
 # Cluster bootstrap keeps a complete four-lag set of matches per sampled setup.
 rng=random.Random(350015);keys=sorted(bysetup);samples=[]
 for _ in range(2000):
  resampled=[r for k in (rng.choice(keys) for __ in keys) for r in bysetup[k] if r['lagMs']==215]
  d=describe(resampled)['thresholds'];p=d['350']['shotCoverage'];q=d['200']['shotCoverage']
  if p is not None and q is not None:samples.append(p-q)
 samples.sort();ci=[samples[int(.025*(len(samples)-1))],samples[int(.975*(len(samples)-1))]] if samples else None
 out={'schema':'fpsarena-c35o-freshness-analysis-v1','designSha256':sha(root/'FROZEN-DESIGN.json'),
  'matches':len(cases),'setups':len(keys),'byLag':bylag,'overall':describe(allrows),'matchingAudits':audits,
  'primary':'shot-level public aim-candidate coverage @215ms, 350ms minus 200ms threshold',
  'primaryCoverageDifferenceCI95ClusterSetup':ci,
  'caveats':['Matched initial setup does not imply identical later trajectory under different lag',
   'No true target ID for misses; identity agreement is hit-and-coverage conditional',
   'Widening maximum snapshot age is not a motor/aim control approval',
   'Velocity projection is capped at 125ms, not a calibrated trajectory model']}
 if write:dump(root/'ANALYSIS.json',out)
 return out
