#!/usr/bin/env python3
"""C31 independently audited matched-seed whole-game inference (not action-level causal claims)."""
import collections,hashlib,json,math,random,statistics
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'reports/c31/study'
def read(p):return json.loads(p.read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def quantile(xs,p):
 x=sorted(xs);return x[min(len(x)-1,max(0,int((len(x)-1)*p)))]
def stratboot(rows,metric,seed=313,rep=6000):
 rg=random.Random(seed);blocks=collections.defaultdict(list)
 for x in rows:blocks[x['enemyWeapon']].append(metric(x))
 vals=[]
 for _ in range(rep):
  sample=[v for xs in blocks.values() for v in rg.choices(xs,k=len(xs))]
  vals.append(statistics.mean(sample))
 return [quantile(vals,.025),quantile(vals,.975)]
def pairedsign(x,rep=40000,seed=319):
 rg=random.Random(seed);observed=abs(statistics.mean(x));n=0
 for _ in range(rep):
  if abs(sum(v*(1 if rg.getrandbits(1) else -1) for v in x)/len(x))>=observed-1e-12:n+=1
 return n/rep
def audit_record(plan,row,policy):
 fp=D/f'{row["id"]}.{policy}.run.json';dp=D/f'{row["id"]}.{policy}.dataset.json'
 if not(fp.is_file() and dp.is_file()):raise RuntimeError(f'missing {row["id"]} {policy}')
 rr=read(fp);dd=read(dp);x=rr['results'][0];m=dd['matches'][0];d=m['diagnostics']['c31']
 assert len(rr['results'])==len(dd['matches'])==1
 assert rr['seconds']==row['seconds'] and rr['snapshotLagMs']==row['lag'] and rr['classicMaps']==[row['map']]
 assert x['seed']==m['metadata']['seed']==row['seed'] and x['mode']=='tdm'
 assert x['opponentPolicy']==row['opponent'] and x['primaryLoadout']==row['traineeWeapon']
 assert m['metadata']['map']==row['map'] and dd['schema']=='fpsarena-c31-controlled-enemy-weapon-dataset-v1'
 assert x['c31']['policy']==m['metadata']['c31']['policy']==policy and x['errors']==0
 assert x['c31']['modelSourceSHA256']==m['metadata']['c31']['modelSHA256']==plan['frozenC30ModelSHA256']
 assert m['metadata']['c31']['controlledEnemyPrimary']==row['enemyWeapon']
 assert len(m['offers'])==d['offers']==sum(d['bySelectedAction'].values())
 assert all(o['c31']['truthMatchesPublic']==(o['c31']['serverWeaponAfterDecision']==o['c31']['publicWeapon']) for o in m['offers'] if o['c31']['serverWeaponAfterDecision'])
 assert sum(d['seenPublicWeapons'].values())==d['offers']
 return dict(id=row['id'],seed=row['seed'],policy=policy,enemyWeapon=row['enemyWeapon'],
  kills=x['kills'],deaths=x['deaths'],killDiff=x['kills']-x['deaths'],damageTaken=x['damageTaken'],shots=x['shots'],hits=x['hits'],
  distance=x['distance'],eligible=d['offers'],valid=d['validFeatures'],action=d['bySelectedAction'],truthKnown=d['weaponTruthKnown'],
  truthMismatch=d['weaponTruthMismatch'],interventionTicks=m['diagnostics']['interventionTicks'],
  seen=d['seenPublicWeapons'],actionByWeapon=d['selectedByPublicWeapon'])
def run():
 p=read(D/'PRE-REGISTERED-PLAN.json');
 assert sha((R/'reports/c30/encounters/FROZEN-POLICY.json').read_bytes())==p['frozenC30ModelSHA256']
 assert len(p['pilot'])==len(p['efficacy'])==36
 assert len({x['seed'] for x in p['pilot']+p['efficacy']})==72
 pilot=[audit_record(p,r,'neural') for r in p['pilot']]
 bygun=collections.Counter(w for x in pilot for w,n in x['seen'].items() for _ in range(n))
 offers=sum(x['eligible'] for x in pilot)
 actions=collections.Counter({a:sum(x['action'].get(a,0) for x in pilot) for a in ('baseline','micro-left','micro-right')})
 truthKnown=sum(x['truthKnown'] for x in pilot);truthBad=sum(x['truthMismatch'] for x in pilot)
 reasons=[];th=p['thresholds']
 if offers<th['minEligibleOffers']:reasons.append('few-offers')
 if min(bygun[w] for w in sorted(set(x['enemyWeapon'] for x in pilot)))<th['minOffersPerGun']:reasons.append('few-offers-gun')
 if len(bygun)<th['minTotalSeenWeapons']:reasons.append('few-guns')
 if (actions['baseline']+actions['micro-right'])/max(1,offers)<th['minNonLeftNeuralRate']:reasons.append('action-collapse')
 if sum(any(x['enemyWeapon']==w and x['action'].get(a,0)>0 for x in pilot for a in ('micro-right','baseline')) for w in bygun)<th['minWeaponsWithNonLeft']:reasons.append('few-nonleft-guns')
 if sum(x['valid'] for x in pilot)/max(1,offers)<th['minFeatureCoverage']:reasons.append('feature-invalid')
 if 1-truthBad/max(1,truthKnown)<th['minPublicTruthAgreement']:reasons.append('truth-mismatch')
 if reasons:raise RuntimeError('Pilot did not pass gate: '+str(reasons))
 allrows=[audit_record(p,r,pol) for r in p['efficacy'] for pol in p['policies']]
 byid={r['id']:{pol:next(x for x in allrows if x['id']==r['id'] and x['policy']==pol) for pol in p['policies']} for r in p['efficacy']}
 paired=[dict(id=r['id'],seed=r['seed'],enemyWeapon=r['enemyWeapon'],**{pol:byid[r['id']][pol] for pol in p['policies']}) for r in p['efficacy']]
 totals={pol:{k:sum(x[k] for x in allrows if x['policy']==pol) for k in ['kills','deaths','damageTaken','shots','hits','eligible','truthMismatch','interventionTicks']} for pol in p['policies']}
 comparisons={}
 for a,b in [('neural','simple'),('neural','baseline'),('simple','baseline')]:
  diffs=[x[a]['killDiff']-x[b]['killDiff'] for x in paired]
  avoided=[x[b]['damageTaken']-x[a]['damageTaken'] for x in paired]
  comparisons[f'{a}_minus_{b}']=dict(meanKillDiff=statistics.mean(diffs),
   stratifiedBootstrap95=stratboot(paired,lambda x:x[a]['killDiff']-x[b]['killDiff']),
   pairedSignFlipP=pairedsign(diffs),meanDamageAvoided=statistics.mean(avoided),
   damageBootstrap95=stratboot(paired,lambda x:x[b]['damageTaken']-x[a]['damageTaken'],seed=316),
   wins=sum(z>0 for z in diffs),losses=sum(z<0 for z in diffs),ties=sum(z==0 for z in diffs))
 byweapon=[]
 for w in sorted(bygun):
  pairs=[x for x in paired if x['enemyWeapon']==w]
  byweapon.append(dict(enemyWeapon=w,pairs=len(pairs),pilotOffers=bygun[w],
   pilotActions={a:sum(x['action'].get(a,0) for x in pilot if x['enemyWeapon']==w) for a in ('baseline','micro-left','micro-right')},
   neuralVsSimpleKillDiff=statistics.mean([x['neural']['killDiff']-x['simple']['killDiff'] for x in pairs]),
   neuralVsSimpleDamageAvoided=statistics.mean([x['simple']['damageTaken']-x['neural']['damageTaken'] for x in pairs]),
   fullNeuralActions={a:sum(x['neural']['action'].get(a,0) for x in pairs) for a in ('baseline','micro-left','micro-right')}))
 out=dict(schema='fpsarena-c31-audited-controlled-gun-game-comparison-v1',registrationSHA256=p['registrationSHA256'],
  pilot=dict(matches=len(pilot),offers=offers,actions=actions,byGun=dict(bygun),truthKnown=truthKnown,truthMismatch=truthBad,
   featureCoverage=sum(x['valid'] for x in pilot)/offers,status='PASS'),
  fullGames=len(allrows),pairedIndependentSeeds=len(paired),perPolicyTotals=totals,comparisons=comparisons,
  byWeapon=byweapon,productRelease=False,
  caveats=['engine still uses scripted BotBrain enemies, not humans','changing opponent loadout is research intervention',
   'observed enemy weapon comes from delayed client packet, server truth postselected for audit only',
   '36 seed blocks; match-paired ITT-like outcomes, not isolated action causal labels',
   'neural C30 lost prior micro-validation vs always-left; no post-hoc model re-selection',
   'no GPU/real browser FPS measured'])
 (D/'AUDITED-EVALUATION.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps(dict(pilot=out['pilot'],fullGames=len(allrows),comparisons=comparisons,byWeapon=byweapon),indent=2))
if __name__=='__main__':run()
