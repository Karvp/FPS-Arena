#!/usr/bin/env python3
"""Independent C30 locked-plan audit and cluster-by-seed inference."""
import json,hashlib,random,math,statistics,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'reports/c30/study';M=ROOT/'reports/c30/encounters'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads(p.read_text())
def qtl(xs,p):
 s=sorted(xs);return s[min(len(s)-1,max(0,int((len(s)-1)*p)))]
def boot_mean(x,rep=6000,seed=3027):
 if not x:return None
 rg=random.Random(seed);bs=[statistics.mean(rg.choices(x,k=len(x))) for _ in range(rep)]
 return [qtl(bs,.025),qtl(bs,.975)]
def signflip(x,rep=50000,seed=3097):
 r=random.Random(seed);obs=abs(statistics.mean(x));return sum(abs(statistics.mean([v*(1 if r.getrandbits(1) else -1) for v in x]))>=obs-1e-12 for _ in range(rep))/rep
def audit(plan,r,policy):
 p=D/f"{r['id']}.{policy}.run.json";f=D/f"{r['id']}.{policy}.dataset.json"
 if not(p.exists() and f.exists()):raise RuntimeError(f'Incomplete {r["id"]}/{policy}')
 x=read(p);d=read(f);z=x['results'][0];m=d['matches'][0]
 assert len(x['results'])==len(d['matches'])==1
 assert x['seconds']==r['seconds'] and x['snapshotLagMs']==r['lag'] and x['classicMaps']==[r['map']]
 assert z['seed']==m['metadata']['seed']==r['seed'] and z['opponentPolicy']==r['opponent'] and z['primaryLoadout']==r['weapon']
 assert m['metadata']['map']==r['map'] and z['errors']==0 and z['mode']=='tdm'
 assert z['c30']['policy']==m['metadata']['c30']['policy']==policy
 assert z['c30']['modelSourceSHA256']==m['metadata']['c30']['modelSHA256']==plan['modelSHA256']
 assert m['metadata']['c30']['trainingRegistration']==plan['trainingRegistration']
 assert d['schema']=='fpsarena-c30-full-game-transfer-dataset-v1'
 s=m['diagnostics']['c30'];assert s['eligible']==len(m['offers'])==sum(s['selected'].values())
 if policy!='baseline':assert s['valid']+sum(s['fallbacks'].values())==s['eligible']
 assert s['proposedActs']<=s['valid']
 assert sum(1 for a in m['offers'] if a.get('c30',{}).get('selected') in ['micro-left','micro-right'])==s['proposedActs']
 assert all(a['validity']['serverOnlyFeaturesUsed'] is False and a['validity']['counterfactualOutcomeObserved'] is False for a in m['offers'])
 return {'seed':r['seed'],'id':r['id'],'policy':policy,'map':r['map'],'weapon':r['weapon'],'opponent':r['opponent'],'lag':r['lag'],
  'kills':z['kills'],'deaths':z['deaths'],'killDiff':z['kills']-z['deaths'],'damageTaken':z['damageTaken'],'shots':z['shots'],
  'hits':z['hits'],'distance':z['distance'],'eligible':s['eligible'],'valid':s['valid'],'actuated':s['proposedActs'],
  'fallbacks':s['fallbacks'],'interventionTicks':m['diagnostics']['interventionTicks']}
def main():
 p=read(D/'PRE-REGISTERED-PLAN.json');idx=read(M/'INDEX.json');m=read(M/'FROZEN-POLICY.json')
 assert m['registrationSHA256']==idx['registrationSHA256']==p['trainingRegistration']
 assert sha((M/'FROZEN-POLICY.json').read_bytes())==p['modelSHA256']
 assert m['preselectedPolicy']=='always-left' and p['validationWinner']=='always-left'
 assert len({x['seed'] for x in p['pilot']+p['full']})==len(p['pilot'])+len(p['full'])
 pilot=[audit(p,r,'neural') for r in p['pilot']]
 off=sum(x['eligible'] for x in pilot);covered=sum(x['valid'] for x in pilot);acted=sum(x['actuated'] for x in pilot)
 gate=off>=50 and covered/off>=.8 and acted/off>=.7
 if not gate:raise RuntimeError('C30 preregistered transfer gate not met')
 allrows=[audit(p,r,pol) for r in p['full'] for pol in p['policies']]
 byid={r['id']:{pol:next(x for x in allrows if x['id']==r['id'] and x['policy']==pol) for pol in p['policies']} for r in p['full']}
 sums={pol:{k:sum(x[k] for x in allrows if x['policy']==pol) for k in ['kills','deaths','damageTaken','shots','hits','distance','eligible','actuated','interventionTicks']} for pol in p['policies']}
 comparisons={}
 for first,second in [('neural','simple'),('neural','baseline'),('simple','baseline')]:
  vals=[v[first]['killDiff']-v[second]['killDiff'] for v in byid.values()]
  losses=[v[second]['damageTaken']-v[first]['damageTaken'] for v in byid.values()]
  comparisons[f'{first}_minus_{second}']={'pairedGames':len(vals),'meanKillDiffImprovement':statistics.mean(vals),
   'killDiffBootstrap95':boot_mean(vals), 'pairedSignFlipTwoSidedP':signflip(vals),
   'meanDamageAvoided':statistics.mean(losses),'damageAvoidedBootstrap95':boot_mean(losses,seed=3082),
   'positiveSeeds':sum(y>0 for y in vals),'negativeSeeds':sum(y<0 for y in vals),'ties':sum(y==0 for y in vals)}
 strat=[]
 for weapon in sorted(set(x['weapon'] for x in p['full'])):
  vs=[v['neural']['killDiff']-v['simple']['killDiff'] for v in byid.values() if v['neural']['weapon']==weapon]
  strat.append({'weapon':weapon,'pairs':len(vs),'neuralVsSimpleMeanKillDiff':statistics.mean(vs)})
 output={'schema':'fpsarena-c30-audited-full-match-v1','registrationSHA256':p['registrationSHA256'],
  'independentPilotGames':len(pilot),'pilotEligible':off,'pilotPublicFeatureValid':covered,'pilotNeuralActions':acted,
  'pilotFeatureCoverage':covered/off,'pilotActuationCoverage':acted/off,
  'fullIndependentSeedBlocks':len(byid),'fullEpisodes':len(allrows),'perPolicyTotals':sums,
  'comparison':comparisons,'weaponStrata':strat,'validationWinner':m['preselectedPolicy'],
  'promotion':{'allowed':False,'reason':'neural was not selected over always-left on preregistered development validation; headless study is not browser validation'},
  'studyLimitations':['paired outcomes on one seed can diverge','no real browser FPS timing','C30 target BODY yaw not actual enemy aim','micro-harness has no obstacles or multiplayer tactical choices']}
 (D/'AUDITED-EVALUATION.json').write_text(json.dumps(output,indent=2)+'\n')
 print(json.dumps({'gate':output['pilotFeatureCoverage'],'episodes':len(allrows),'comparison':comparisons},indent=2))
if __name__=='__main__':main()
