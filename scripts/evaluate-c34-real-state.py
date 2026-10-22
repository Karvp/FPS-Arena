#!/usr/bin/env python3
"""C34: match-clustered factual hit prediction, with a sealed-test two-phase protocol.
Fit MUST NOT open test cases. Test loads only frozen candidates, NEVER re-selects a winner.
"""
import argparse, collections, hashlib, json, math, pathlib
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
ROOT=pathlib.Path(__file__).resolve().parent.parent
A=ROOT/'reports/c34/real-matches-54';B=ROOT/'reports/c34/extra-train-18'
FROZEN=A/'FROZEN-DEVELOPMENT-MODELS.json';OUTPUT=A/'SEALED-EVALUATION.json'
W=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'];M=['arena','foundry','neon'];EPS=1e-10
FEATURES=['distance/100','relativeX/100','relativeZ/100','ownVx/12','ownVz/12','enemySinYaw','enemyCosYaw','health/100','armor/100','snapshotAge/.25','boxesNearby/15','gateEligible','incumbentFire','incumbentAim',*('map='+x for x in M),*('weapon='+x for x in W)]
def sh(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def get_plan():
 p=json.loads((A/'PRE-REGISTERED-PLAN.json').read_text());extra=json.loads((B/'ADAPTIVE-TRAIN-ADDENDUM.json').read_text())
 for rel,v in p['fileSHA256'].items():
  if sh(ROOT/rel)!=v:raise ValueError('source changed '+rel)
 if extra['parentRegistrationSHA256']!=sh(A/'PRE-REGISTERED-PLAN.json') or extra['fileSHA256']!=p['fileSHA256']:raise ValueError('adaptive plan mismatch')
 return p,extra
def feature(w):
 p=w['public']; a=p['own'];e=p['enemy'];s=e['position'];v=p['ownVelocity'];yaw=e['bodyYaw']
 if any(x is None or not math.isfinite(x) for x in [a['x'],a['z'],s['x'],s['z'],v['vx'],v['vz'],yaw,e['snapshotAge']]):raise ValueError('invalid public features')
 d=math.hypot(a['x']-s['x'],a['z']-s['z']);mapname=p['staticMap']['map'];weapon=e['weapon']
 return [d/100,(a['x']-s['x'])/100,(a['z']-s['z'])/100,v['vx']/12,v['vz']/12,
  math.sin(yaw),math.cos(yaw),max(0,p['health'] or 0)/100,max(0,p['armor'] or 0)/100,e['snapshotAge']/.25,
  p['staticMap']['count']/15,float(bool(p['eligibility']['eligible'])),float(p['incumbent']['fire']),float(p['incumbent']['aim']),
  *[float(mapname==q) for q in M],*[float(weapon==q) for q in W]]
def load_rows(cases,pathbase):
 out=[];diagnostics=[]
 for c in cases:
  base=pathbase/f"match-{c['id']}"; dp=base.with_suffix('.dataset.json');rp=base.with_suffix('.result.json')
  ds=json.loads(dp.read_text());r=json.loads(rp.read_text());match=ds['matches'][0]
  if not (len(ds['matches'])==1 and match['metadata']['seed']==c['seed'] and r['seed']==c['seed'] and r['snapshotLagMs']==c['lagMs'] and r['opponentPolicy']==c['opponents'] and ds['controlledEnemyPrimary']==c['weapon'] and match['metadata']['map']==c['map'] and r['aggregate']['rounds']==1):raise ValueError('provenance mismatch: '+c['id'])
  if len(match['windows'])>52:raise ValueError('impossible 90s grid')
  before=-math.inf;hit=eligible=censored=weaponmatch=visibleweapon=0;drifts=[];box=0
  for w in match['windows']:
   if not (w['start']>before and w['end']-w['start']>=1.79 and w['public']['now']==w['start'] and w['serverAfterDecision'] and w['actualCommand'] and w['public']['enemy']['snapshotTime']<=w['start']+.01):raise ValueError('window order / leakage: '+c['id'])
   if before!=-math.inf and w['start']<before+1.79:raise ValueError('overlap')
   before=w['start'];censored+=int(w['censored']);eligible+=int(w['public']['eligibility']['eligible']);box+=int(w['public']['staticMap']['count']>0)
   truth=w['serverAfterDecision']['enemy'];visibleweapon+=int(bool(w['public']['enemy']['weapon']))
   if truth and truth['alive']:
    weaponmatch+=int(truth['weapon']==w['public']['enemy']['weapon'])
    drifts.append(math.hypot(truth['position']['x']-w['public']['enemy']['position']['x'],truth['position']['z']-w['public']['enemy']['position']['z']))
   if w['complete']:
    if w['censored'] or w['end']>c['seconds']+.15:raise ValueError('bad complete window')
    label=int(w['outcome']['hostileWeaponHits']>0);hit+=label
    out.append({'seed':c['seed'],'x':feature(w),'y':label,'map':c['map'],'weapon':c['weapon'], 'enemyMismatch':not (truth and truth['weapon']==w['public']['enemy']['weapon'])})
   elif not w['censored']:raise ValueError('bad censor flag')
  diagnostics.append({'seed':c['seed'],'windows':len(match['windows']),'complete':sum(w['complete'] for w in match['windows']),
   'positive':hit,'eligible':eligible,'censored':censored,'withNearbyBox':box,
   'publicWeaponNonempty':visibleweapon,'weaponTruthMatch':weaponmatch,'driftMean':float(np.mean(drifts)) if drifts else None,
   'driftP95':float(np.quantile(drifts,.95)) if drifts else None,'agentErrors':r['aggregate']['agentErrors']})
 return out,diagnostics
def xy(rows):return np.asarray([r['x'] for r in rows],dtype=float),np.asarray([r['y'] for r in rows],dtype=int)
def clip(x):return np.clip(np.asarray(x,dtype=float),1e-5,1-1e-5)
def brier(p,y):return float(np.mean((clip(p)-y)**2))
def loss(p,y):
 p=clip(p);return float(np.mean(-(y*np.log(p)+(1-y)*np.log(1-p))))
def pred(model,x):
 if model['type']=='constant':return np.full(x.shape[0],model['p'])
 z=(x-np.asarray(model['mean']))/np.asarray(model['scale'])
 if model['type']=='logistic':return clip(1/(1+np.exp(-np.clip(z@np.asarray(model['coef'])+model['intercept'],-50,50))))
 h=z
 for i,(matrix,bias) in enumerate(zip(model['weights'],model['biases'])):
  h=h@np.asarray(matrix)+np.asarray(bias)
  if i<len(model['weights'])-1:h=np.maximum(0,h)
 return clip(1/(1+np.exp(-np.clip(h.reshape(-1),-50,50))))
def as_model(k,obj,scaler,hyper):
 d={'id':k,'type':'mlp' if isinstance(obj,MLPClassifier) else 'logistic','mean':scaler.mean_.tolist(),'scale':scaler.scale_.tolist(),'hyper':hyper}
 if isinstance(obj,MLPClassifier):d.update(weights=[a.tolist() for a in obj.coefs_],biases=[a.tolist() for a in obj.intercepts_])
 else:d.update(coef=obj.coef_[0].tolist(),intercept=float(obj.intercept_[0]))
 return d
def fit():
 plan,extra=get_plan();tr1=[c for c in plan['cases'] if c['split']=='train'];v=[c for c in plan['cases'] if c['split']=='validation']
 train,diag1=load_rows(tr1,A);trainmore,diag2=load_rows(extra['cases'],B);valid,diagv=load_rows(v,A)
 train+=trainmore
 X,y=xy(train);VX,vy=xy(valid)
 gates=plan['promotionGate'];enough=len(X)>=500 and y.sum()>=gates['minimumTrainPositiveWindows'] and vy.sum()>=gates['minimumValidationPositiveWindows']
 frozen={'schema':'fpsarena-c34-frozen-factual-hit-models-v1', 'preregistrationSHA256':sh(A/'PRE-REGISTERED-PLAN.json'),
  'adaptiveAddendumSHA256':sh(B/'ADAPTIVE-TRAIN-ADDENDUM.json'),'featureNames':FEATURES,
  'train':{'games':len(tr1)+len(extra['cases']),'windows':len(y),'positive':int(y.sum())},
  'validation':{'games':len(v),'windows':len(vy),'positive':int(vy.sum())},
  'minimumPositiveGatePassed':bool(enough),'models':[],'selection':None,
  'trainingDataSummary':{'byGame':diag1+diag2},'validationDataSummary':{'byGame':diagv},
  'testSeal':'No TEST outcome file read by --fit; --test cannot select or refit',
  'claimBoundary':'factual future enemy hit prediction only, NOT action-value or dodge improvement'}
 if not enough:
  frozen['selection']={'selected':'constant','reason':'minimum positive windows gate failed'}
  frozen['models']=[{'id':'constant','type':'constant','p':float(np.mean(y))}]
 else:
  scaler=StandardScaler().fit(X)
  models=[{'id':'constant','type':'constant','p':float(np.mean(y))}]
  for C in [.03,.3,3.]:
   obj=LogisticRegression(C=C,max_iter=500,random_state=777).fit(scaler.transform(X),y)
   models.append(as_model(f'logistic-C{C}',obj,scaler,{'C':C}))
  for seed in [11,29,47]:
   obj=MLPClassifier(hidden_layer_sizes=(12,),activation='relu',solver='adam',alpha=.1,
    learning_rate_init=.004,max_iter=170,random_state=seed,early_stopping=False)
   obj.fit(scaler.transform(X),y)
   models.append(as_model(f'neural-12-seed{seed}',obj,scaler,{'seed':seed,'hidden':[12],'epochs':obj.n_iter_}))
  scores=[{'id':m['id'],'type':m['type'],'brier':brier(pred(m,VX),vy),'logLoss':loss(pred(m,VX),vy)} for m in models]
  chosen=min(scores,key=lambda m:(m['brier'],0 if m['type']=='constant' else 1,m['id']))
  base=next(x for x in scores if x['id']=='constant')
  frozen['models']=models;frozen['validationMetrics']=scores
  frozen['selection']={'selected':chosen['id'],'validationBrier':chosen['brier'],'constantBrier':base['brier'],
     'beatsConstantValidation':chosen['id']!='constant' and chosen['brier']<base['brier']-1e-9,
     'rule':'minimum validation Brier; constant tie preference; no TEST results'}
 if FROZEN.exists():
  if json.loads(FROZEN.read_text())!=frozen:raise ValueError('Frozen model already exists and differs. Do not reselect.')
 else:FROZEN.write_text(json.dumps(frozen,indent=2)+'\n')
 print(json.dumps({'train':frozen['train'],'validation':frozen['validation'],'selection':frozen['selection'],
 'validationMetrics':frozen.get('validationMetrics',[])},indent=2))
def cluster_ci(rows,pa,pb,seed=34):
 groups=collections.defaultdict(list)
 for i,row in enumerate(rows):groups[row['seed']].append(i)
 rng=np.random.default_rng(seed);keys=list(groups);diff=[]
 for _ in range(2400):
  idx=np.concatenate([np.asarray(groups[k]) for k in rng.choice(keys,len(keys),replace=True)])
  diff.append(float(np.mean((pb[idx]-np.asarray([rows[i]['y'] for i in idx]))**2-(pa[idx]-np.asarray([rows[i]['y'] for i in idx]))**2)))
 return [float(np.quantile(diff,.025)),float(np.quantile(diff,.975))]
def test_eval():
 plan,extra=get_plan();ifnot=FROZEN.exists()
 if not ifnot:raise ValueError('Frozen development model missing; cannot access sealed TEST data')
 frozen=json.loads(FROZEN.read_text())
 if frozen['preregistrationSHA256']!=sh(A/'PRE-REGISTERED-PLAN.json') or frozen['adaptiveAddendumSHA256']!=sh(B/'ADAPTIVE-TRAIN-ADDENDUM.json'):raise ValueError('frozen registration mismatch')
 # Holdout is opened ONLY after the frozen model exists, and cannot affect model selection.
 cases=[c for c in plan['cases'] if c['split']=='test'];rows,diagnostics=load_rows(cases,A)
 X,y=xy(rows);constant=frozen['models'][0];chosen=next(m for m in frozen['models'] if m['id']==frozen['selection']['selected'])
 p0=pred(constant,X);p=pred(chosen,X)
 gate=plan['promotionGate'];enough=len(y)>=1 and y.sum()>=gate['minimumTestPositiveWindows']
 ci=cluster_ci(rows,p,p0)
 valGate=bool(frozen['minimumPositiveGatePassed'] and frozen['selection'].get('beatsConstantValidation'))
 testGain=float(brier(p0,y)-brier(p,y))
 out={'schema':'fpsarena-c34-sealed-real-match-factual-hit-evaluation-v1','test':{'games':len(cases),'windows':len(y),'positive':int(y.sum()),'selectedModel':chosen['id'],
   'baselineBrier':brier(p0,y),'selectedBrier':brier(p,y),'baselineLogLoss':loss(p0,y),'selectedLogLoss':loss(p,y),
   'brierImprovement':testGain,'gameClusterBootstrap95BrierImprovement':ci},
   'gates':{'trainValidationGate':valGate,'testMinimumPositive':bool(enough),
     'testImprovement':testGain>0,'factualPredictorEligibleForFurtherResearch':bool(valGate and enough and testGain>0),
     'actionPolicyPromotion':False},
   'holdoutByGame':diagnostics,'frozenSHA256':sh(FROZEN),
   'important':'No action-value or causal treatment effect identified by passive observations; no production promotion'}
 if OUTPUT.exists() and json.loads(OUTPUT.read_text())!=out:raise ValueError('sealed result differs; cannot rewrite')
 if not OUTPUT.exists():OUTPUT.write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps(out['test'],indent=2))
 print('GATES',json.dumps(out['gates']))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('step',choices=['fit','test']);args=a.parse_args()
 if args.step=='fit':fit()
 else:test_eval()
