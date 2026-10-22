#!/usr/bin/env python3
"""Independent prospective C35-I audit. Reuses independent C35-H C21 audit.
Rows conditioned on firing are observational, not a randomized causal subgroup.
"""
import sys,random,hashlib,json,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35i/pilot-18-weapon-pairs'
spec=importlib.util.spec_from_file_location('c35h_independent',ROOT/'scripts/analyze-c35h-macro-pilot.py')
c35h=importlib.util.module_from_spec(spec);spec.loader.exec_module(c35h);c35h.OUT=OUT
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def verify():
 design=json.loads((OUT/'FROZEN-DESIGN.json').read_text());audit=json.loads((OUT/'EXECUTION-AUDIT.json').read_text());reg=sha(OUT/'FROZEN-DESIGN.json')
 if audit['registrationSHA256']!=reg:raise ValueError('registration changed')
 for path,h in design['sourceSHA256'].items():
  if sha(ROOT/path)!=h:raise ValueError('source drift '+path)
 lookup={v['id']:v for v in audit['files']}
 if len(lookup)!=len(design['cases']):raise ValueError('missing audited matches')
 rows={};weapons={}
 for c in design['cases']:
  pre=OUT/'matches'/c['id']
  for kind,h in lookup[c['id']]['sha'].items():
   if sha(Path(str(pre)+f'.{kind}.json'))!=h:raise ValueError('corrupt stored file '+c['id']+' '+kind)
  base=c35h.load(c,reg)
  lane=json.loads(Path(str(pre)+'.lane.json').read_text())['traces'][0]
  fire=json.loads(Path(str(pre)+'.fire.json').read_text())['traces'][0]
  result=json.loads(Path(str(pre)+'.result.json').read_text())
  stats=lane['counts'];rows_ = lane['rows']
  if lane['policy']!=c['policy'] or lane['matchId']!=f'c35i-{c["map"]}-{c["seed"]}':raise ValueError('wrong lane provenance')
  if (stats['suppressed'] or stats['injected'] or stats['sampledFire']!=stats['incumbentFire'] or
   stats['sampledFire']!=len(rows_)+stats['storedDropped'] or stats['sampledServerShots']!=base['shots'] or
   stats['sampledServerHits']>result['aggregate']['hits'] or
   stats['incumbentFire']!=fire['counts']['incumbentFireTicks'] or
   stats['appliedFire']!=fire['counts']['appliedFireTicks']):raise ValueError('lane ledger corruption '+c['id'])
  if stats['storedDropped'] or stats['unsampledFire']:raise ValueError('C35I unexpected under-sampling '+c['id'])
  if any(x['weaponId']!=c['gun'] for x in rows_ if x['valid']):raise ValueError('weapon substitution without declaration '+c['id'])
  if any(x['laneScore'] is not None and not 0<=x['laneScore']<=1 for x in rows_):raise ValueError('quality outside [0,1]')
  if any(not 0<=x['time']<=c['seconds']+1e-4 for x in rows_):raise ValueError('future or negative clock')
  for s in rows_:
   if s['serverLabelsAfterStep']['shots'] not in (0,1):raise ValueError('invalid post-step shot count')
  base.update({'weapon':c['gun'],'map':c['map'],'laneCounts':stats,'laneRows':rows_});rows[(c['setupId'],c['policy'])]=base
  w=weapons.setdefault(c['gun'],{'observe':[],'lateral':[]});w[c['policy']].append(base)
 setups=sorted(set(c['setupId'] for c in design['cases']))
 if len(setups)!=design['nSetups'] or any((x,p) not in rows for x in setups for p in ('observe','lateral')):raise ValueError('unpaired setup')
 fields=['shots','originalFire','microTicks','hits','kills','damageTaken','macroModified']
 totals={arm:{key:sum(rows[(s,arm)][key] for s in setups) for key in fields} for arm in ('observe','lateral')}
 laneTotals={arm:{key:sum(rows[(s,arm)]['laneCounts'][key] for s in setups) for key in ['sampledFire','validSamples','staticClearSamples','bilateralClearSamples','macroModifiedSamples','incumbentFireMove']} for arm in ('observe','lateral')}
 byGun={g:{p:{'shots':sum(x['shots'] for x in v[p]),'hits':sum(x['hits'] for x in v[p]),
       'macroModifiedTicks':sum(x['macroModified'] for x in v[p]),
       'validLaneSamples':sum(x['laneCounts']['validSamples'] for x in v[p]),
       'lanesSampled':sum(x['laneCounts']['sampledFire'] for x in v[p]),
       'laneQualityMean':(sum(s['laneScore'] for x in v[p] for s in x['laneRows'] if s['laneScore'] is not None)/max(1,sum(1 for x in v[p] for s in x['laneRows'] if s['laneScore'] is not None)))} for p in ('observe','lateral')} for g,v in weapons.items()}
 rng=random.Random(35990011);bootstrap={}
 for field in ['shots','microTicks','hits']:
  def ratio(ids):
   denominator=sum(rows[(i,'observe')][field] for i in ids)
   return sum(rows[(i,'lateral')][field] for i in ids)/denominator if denominator else None
  draws=[ratio([rng.choice(setups) for _ in setups]) for _ in range(4000)];draws=sorted(v for v in draws if v is not None)
  bootstrap[field]={'ratio':ratio(setups),'CI95':[draws[int(.025*(len(draws)-1))],draws[int(.975*(len(draws)-1))]],'lower5':draws[int(.05*(len(draws)-1))]}
 status='NO_POLICY_PROMOTION_OBSERVATION_ONLY'
 output={'schema':'fpsarena-c35i-weapon-corridors-audit-v1','registrationSHA256':reg,'status':status,
  'matches':len(design['cases']),'setups':len(setups),'simulatedMinutes':sum(c['seconds'] for c in design['cases'])/60,
  'totals':totals,'laneTotals':laneTotals,'byIncumbentWeapon':byGun,'clusterBootstrap4000':bootstrap,
  'safety':'C21 assignment+preoffers PASS; C16 micro unchanged; predecision public snapshots; postdecision server labels; 0 fire mutation',
  'statisticalLimitations':['per-gun cohorts are only three map setups per arm','conditioning on fire opportunity is post-treatment selection',
  'paired runs diverge due to motor intervention','static 2D ray footprint may label legitimate elevated sightlines blocked',
  'nearest observed hostile may differ from actual intended target','no causal motor-policy improvement inferred']}
 (OUT/'RESULTS.json').write_text(json.dumps(output,sort_keys=True,indent=2)+'\n')
 print('C35I audited',output['matches'],'matches',output['simulatedMinutes'],'simulated minutes')
 print('C35I shots',totals['observe']['shots'],totals['lateral']['shots'],'bootstrap',bootstrap['shots'])
 print('C35I quality',laneTotals,'weapons',byGun.keys())
 return output
if __name__=='__main__':verify()
