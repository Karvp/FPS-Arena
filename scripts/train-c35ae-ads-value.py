#!/usr/bin/env python3
"""C35AE ADS intent-to-treat factual value, setup-heldout neural training.
No unchosen outcomes, post-step predictors, match outcomes, or proxy shooting labels.
"""
import argparse, collections, hashlib, json, math, pathlib, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import brier_score_loss, log_loss

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'reports/c35ad/matched-72/matches'
OUT=ROOT/'reports/c35ae/offline-ads-value'
GUNS=['aa12','hk_sl8','l115a3','m4a1','mp5sd','uzi']
RAW=['ads','range','angle','age','speed','radial','lateral','spread','forward','backward','left','right']
FEATURES=RAW+['gun_'+w for w in GUNS]
ACTION_EXTRA=['toggle','toggle_ads','toggle_range','toggle_angle','toggle_speed','toggle_spread']

def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def dump(p,obj):
 p=pathlib.Path(p);p.parent.mkdir(exist_ok=True,parents=True);p.write_text(json.dumps(obj,sort_keys=True,indent=2,allow_nan=False)+'\n')

def validated_row(q):
 f=q['publicFeatures'];o=q['outcome'];bc=q['baselineCommand'];first=q['firstCommand'];arm=q['assignedArm']
 assert f['valid'] is True and f['provenance']=='PUBLIC_BEFORE_GAME_STEP_ONLY'
 assert f['targetStatus']=='fresh' and f['aim']==q['baselineADS'] and not f['fireIntent']
 assert q['propensity']==.5 and q['assignmentDistribution']=={'control':.5,'toggle':.5}
 assert q['unselectedOutcome'] is None and arm in ('control','toggle')
 assert not bc['fire'] and not first['fire'] and first['aim']==(not bc['aim'] if arm=='toggle' else bc['aim'])
 assert all(first.get(k)==v for k,v in bc.items() if k!='aim')
 assert o['source']=='FACTUAL_AUTHORITATIVE_AFTER_STEP_ONLY' and not (o['complete'] and o['censored'])
 if not o['complete']:return None
 assert not o['censored'] and o['hitShots']<=o['serverShots'] and o['hitShots']>=0
 assert f['weapon'] in GUNS and q['weapon']==f['weapon']
 m=f['movementInput'];assert all(isinstance(m.get(k),bool) for k in ('forward','backward','left','right'))
 result=[int(q['baselineADS']),float(f['targetRange']),float(f['aimAngleDeg']),float(f['targetAgeMs']),float(f['speed']),float(f['radialSpeed']),float(f['lateralSpeed']),float(f['expectedSpreadDeg']),int(m['forward']),int(m['backward']),int(m['left']),int(m['right'])]
 result += [int(q['weapon']==w) for w in GUNS]
 assert all(math.isfinite(v) for v in result)
 return {'setup':q['setupId'],'weapon':q['weapon'],'index':q['index'],'base':result,'toggle':int(arm=='toggle'),
         'target':int(o['hitShots']>0),'hitShots':o['hitShots'],'shots':o['serverShots'],'kills':o['serverKills'],
         'damageTaken':o['damageTaken'],'propensity':q['propensity']}

def read_rows(directory=SOURCE):
 rows=[];files=sorted(pathlib.Path(directory).glob('*-randomized.prefire.json'))
 if not files:raise RuntimeError('missing real randomized ADS trace')
 for p in files:
  trace=json.loads(p.read_text())['traces'][0]
  for q in trace['rows']:
   x=validated_row(q)
   if x is not None:rows.append(x)
 return rows,files

def assignment(row,extra=True):
 x=row['base'][:]
 if extra:
  t=row['toggle'];x += [t,t*x[0],t*x[1]/100,t*x[2]/14,t*x[4]/10,t*x[7]/4]
 return x

def group_split(rows):
 bygun=collections.defaultdict(set)
 for x in rows:bygun[x['weapon']].add(x['setup'])
 split={'train':[],'validation':[],'holdout':[]}
 for gun in GUNS:
  ids=sorted(bygun[gun]);assert len(ids)==4,(gun,ids)
  split['train']+=ids[:2];split['validation'].append(ids[2]);split['holdout'].append(ids[3])
 assert set(split['train']).isdisjoint(split['validation']) and set(split['train']).isdisjoint(split['holdout']) and set(split['validation']).isdisjoint(split['holdout'])
 return split

def prepare(rows,names,kind):
 ids=set(names);q=[x for x in rows if x['setup'] in ids]
 X=np.array([assignment(x,kind!='state') for x in q],dtype=float)
 y=np.array([x['target'] for x in q],dtype=int)
 assert len(q) and len(np.unique(y))==2,(kind,names,collections.Counter(y))
 return q,X,y

def scaler_fit(X):
 mean=X.mean(axis=0);std=X.std(axis=0);std=np.where(std<1e-8,1,std)
 return mean,std

def metrics(y,p):
 p=np.clip(p,1e-6,1-1e-6)
 return {'n':len(y),'positive':int(sum(y)), 'brier':round(float(brier_score_loss(y,p)),8), 'logloss':round(float(log_loss(y,p,labels=[0,1])),8)}

def export_model(name,kind,clf,mean,std):
 obj={'name':name,'encoder':'c35ae-public-prestep-v1','baseFeatures':FEATURES,'actionFeatures':ACTION_EXTRA if kind!='state' else [],
      'mean':mean.tolist(),'scale':std.tolist(),'kind':kind,'target':'at-least-one-authoritative-hit-shot-in-0.7s-factual-window','trainingOnly':True}
 if isinstance(clf,LogisticRegression):obj['layers']=[{'weights':clf.coef_[0].tolist(),'bias':float(clf.intercept_[0]),'activation':'sigmoid'}]
 else:
  obj['layers']=[{'weights':a.T.tolist(),'bias':b.tolist(),'activation':'sigmoid' if i==len(clf.coefs_)-1 else 'relu'} for i,(a,b) in enumerate(zip(clf.coefs_,clf.intercepts_))]
 return obj

def compare_policies(rows,model,models,predictor,bootstrap_seed=3500,replicates=3000):
 """IPS policy value for binary factual outcome; setup-cluster bootstrap."""
 if not rows:return None
 # Policies: always-control, always-toggle, baseline-ADS retention policy, learned greedy.
 arrays=[]
 for row in rows:
  x0=assignment({**row,'toggle':0},True);x1=assignment({**row,'toggle':1},True)
  p0=float(predictor(model,np.array([x0]))[0]);p1=float(predictor(model,np.array([x1]))[0]);pred=int(p1>p0)
  arrays.append({'setup':row['setup'],'y':row['target'],'a':row['toggle'],'predict':pred,'retention':int(row['base'][0]==0)})
 def estimate(s,policy):
  selected=[2*r['y']*(r['a']==(r[policy] if policy in ('predict','retention') else (0 if policy=='control' else 1))) for r in s]
  return float(np.mean(selected)) if selected else float('nan')
 values={p:estimate(arrays,p) for p in ('control','toggle','retention','predict')}
 rng=np.random.default_rng(bootstrap_seed);clusters=sorted({r['setup'] for r in arrays});by={c:[r for r in arrays if r['setup']==c] for c in clusters};diff=[]
 for _ in range(replicates):
  draw=[r for c in rng.choice(clusters,size=len(clusters),replace=True) for r in by[c]]
  diff.append(estimate(draw,'predict')-estimate(draw,'control'))
 ess={p:(lambda w:round(float(sum(w)**2/sum(v*v for v in w)),2) if sum(v*v for v in w) else 0)([2*int(r['a']==(r[p] if p in ('predict','retention') else (0 if p=='control' else 1))) for r in arrays]) for p in values}
 return {'ips':{k:round(v,6) for k,v in values.items()},'ipsLearnedMinusControlCI95':[round(float(v),6) for v in np.quantile(diff,[.025,.975])],
         'matchingEffectiveSampleSize':ess,'setupCount':len(clusters),'n':len(rows),'caveat':'IPS assumes registered 50/50 valid assignment; eligible-only factual windows; same-match interference and cluster dependence; not all-match combat value.'}

def train_and_export():
 rows,files=read_rows();design=ROOT/'reports/c35ad/matched-72/FROZEN-DESIGN.json'
 split=group_split(rows);spec={'schema':'fpsarena-c35ae-preregistered-offline-v1','sourceC35ADRegistrationSHA256':sha(design),
   'inputFilesSHA256':{str(f.relative_to(ROOT)):sha(f) for f in files},'split':split,
   'target':'at least one server-confirmed hit shot in factual 0.7s after offer; not a kill reward',
   'modelCandidates':['constant','state-logistic','action-logistic','action-mlp'],
   'selectBy':'validation Brier among action-logistic and action-mlp; state-only is independent benchmark',
   'prespecifiedMLP':'hidden=(16,8), alpha=1.0, max_iter=450, seed=35052026',
   'safety':'offline only; no game control; no unchosen labels; evaluate holdout and separate prospective batch once'}
 registration=OUT/'FROZEN-DESIGN.json'
 if registration.exists():assert json.loads(registration.read_text())==spec,'C35AE registration drift'
 else:dump(registration,spec)
 models={};trainsets={};evaluation={};clfmap={}
 for name,kind in [('state-logistic','state'),('action-logistic','action'),('action-mlp','action')]:
  tr,X,y=prepare(rows,split['train'],kind);mean,std=scaler_fit(X);trainsets[name]=(kind,mean,std)
  XX=(X-mean)/std
  if name=='action-mlp':
   clf=MLPClassifier(hidden_layer_sizes=(16,8),alpha=1.0,max_iter=450,random_state=35052026,learning_rate_init=.01,n_iter_no_change=45)
  else:clf=LogisticRegression(C=.2,max_iter=800,random_state=35052026)
  clf.fit(XX,y);clfmap[name]=clf;models[name]=export_model(name,kind,clf,mean,std)
 def predictor(mod,X):
  x=(X-np.array(mod['mean']))/np.array(mod['scale']);v=x
  for layer in mod['layers']:
   w=np.array(layer['weights']);b=np.array(layer['bias']);v=v@w.T+b if w.ndim==2 else v@w+b
   v=np.maximum(v,0) if layer['activation']=='relu' else 1/(1+np.exp(-np.clip(v,-50,50)))
  return np.array(v).reshape(-1)
 train_rate=float(np.mean([r['target'] for r in rows if r['setup'] in split['train']]))
 for phase in ('validation','holdout'):
  metrics_by={'constant':metrics(np.array([r['target'] for r in rows if r['setup'] in split[phase]]),np.array([train_rate for r in rows if r['setup'] in split[phase]]))}
  for name,model in models.items():
   kind=trainsets[name][0];r,X,y=prepare(rows,split[phase],kind);p=predictor(model,X)
   metrics_by[name]=metrics(y,p)
  evaluation[phase]=metrics_by
 preferred=min(('action-logistic','action-mlp'),key=lambda n:evaluation['validation'][n]['brier'])
 onhold=[r for r in rows if r['setup'] in split['holdout']]
 ope=compare_policies(onhold,models[preferred],models,predictor)
 # Compare factual randomized treatment by baseline ADS, no policy trained on holdout.
 factual={}
 for s in (0,1):
  by={a:[r for r in onhold if r['base'][0]==s and r['toggle']==a] for a in (0,1)}
  factual[str(s)]={str(a):{'n':len(v),'observedHitRate':round(sum(q['target'] for q in v)/len(v),6) if v else None} for a,v in by.items()}
 validation_better=evaluation['validation'][preferred]['brier']<evaluation['validation']['state-logistic']['brier']
 holdout_better=evaluation['holdout'][preferred]['brier']<evaluation['holdout']['state-logistic']['brier']
 lower_above_zero=ope['ipsLearnedMinusControlCI95'][0]>0
 gate=bool(validation_better and holdout_better and lower_above_zero)
 report={'schema':'fpsarena-c35ae-neural-ads-evaluation-v1','registrationSHA256':sha(registration),
   'rowsTotal':len(rows),'completeOffersBySplit':{s:sum(x['setup'] in set(ids) for x in rows) for s,ids in split.items()},
   'split':split,'modelMetrics':evaluation,'bestActionCandidateOnValidation':preferred,'holdoutOPE':ope,
   'holdoutFactualByBaselineADS':factual,'promotePolicy':False,'readinessGatePassed':gate,
   'strictLimitations':['Trained on factual result of assigned action only.','No causal labels for unselected action.','Randomized short ADS impulse only, not full policy value.','6 setup clusters in retrospective holdout; cluster intervals exploratory.','Overlap among within-match 0.7s windows; no claim of independent observations.','Model not connected to the production bot.']}
 OUT.mkdir(parents=True,exist_ok=True);dump(OUT/'FROZEN-ADS-VALUE-MODELS.json',models);dump(OUT/'RETROSPECTIVE-EVALUATION.json',report)
 # Export holdout predictions for independent inference parity.
 checks=[]
 for r in onhold:
  checks.append({'setup':r['setup'],'index':r['index'],'y':r['target'],'arm':r['toggle'],
    'rawState':r['base'],'predictions':{name:float(predictor(mod,np.array([assignment(r,name!='state-logistic')]))[0]) for name,mod in models.items()}})
 dump(OUT/'HOLDOUT-PREDICTIONS.json',checks)
 print(json.dumps({'inputRows':len(rows),'metrics':evaluation,'preferred':preferred,'ope':ope,'gate':gate},indent=2))
 return report

if __name__=='__main__':
 train_and_export()
