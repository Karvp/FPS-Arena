#!/usr/bin/env python3
"""C35-X offline action-conditional factual outcome predictor, NOT deployed policy.
Data source: C35-W independently randomized one-tick trials with known propensities.
Nonassigned outcomes remain unknown. Split by setup; no future/server data in inputs.
"""
from pathlib import Path
import json,csv,math,random,statistics,hashlib
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import brier_score_loss,log_loss
R=Path(__file__).resolve().parents[1]
OLD=R/'reports/c35w/randomized-motor-36-v1';NEW=R/'reports/c35x/expansion-54-v2';OUT=R/'reports/c35x/action-value-v1'
ARMS=('control','alternative-a','alternative-b')
ATTR=('distance','ageMs','angleDeg','hp','enemyCount','fire','aim','incumbentRadial','near','far','incumbentHeuristic')
GUNS=('aa12','mp5sd','m4a1','hk_sl8','uzi','l115a3')
KEYS=('forward','backward','left','right')
def load(p):return json.loads(Path(p).read_text())
def dump(p,d):p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,indent=2,sort_keys=True,allow_nan=False)+'\n')
def split(setup):
 # Predefined groups independent of outcomes; 20 train, 5 validation, 5 holdout.
 idx=int(setup.rsplit('-',1)[-1]);return 'validation' if idx%5==3 else 'holdout' if idx%5==4 else 'train'
def encode(row,action=True):
 f=row['features'];arm=row['assignedArm'];keys=row['executedAction'];slot=ARMS.index(arm)
 if row['weapon'] not in GUNS or not all(isinstance(f.get(x),(int,float)) and math.isfinite(f[x]) for x in ATTR):raise ValueError('invalid public feature')
 s=[float(f[k]) for k in ATTR]+[float(row['weapon']==g) for g in GUNS]
 if action:
  sel=row['actionSet'][slot];v=sel.get('heuristicValue')
  if v is None or not math.isfinite(v):raise ValueError('missing pre-step heuristic')
  s += [float(bool(keys[k])) for k in KEYS]+[float(arm==a) for a in ARMS]+[float(v),float(v-f['incumbentHeuristic'])]
 return s
FEATURES=list(ATTR)+[f'weapon_{g}' for g in GUNS]+[f'move_{k}' for k in KEYS]+[f'arm_{a}' for a in ARMS]+['selectedHeuristic','selectedMinusIncumbentHeuristic']
def extract(cohort):
 d=load(cohort/'FROZEN-DESIGN.json');results=[]
 for c in d['cases']:
  if c['arm']!='randomized':continue
  trace=load(cohort/'matches'/(c['id']+'.random.json'))['traces'][0]
  if trace['setupId']!=c['setupId'] or trace['policy']!='randomized':raise ValueError('cohort metadata')
  for item in trace['rows']:
   if item['unselectedOutcomes'] is not None or not item['compliant'] or item['executedArm']!=item['assignedArm']:raise ValueError('wrong randomization integrity')
   if item['outcome'] is None:
    if not item['censored']:raise ValueError('unknown without censoring')
    continue
   if not item['outcome']['source'].startswith('SERVER_AFTER_STEP_FACTUAL'):raise ValueError('post-step label missing')
   if item['assignedArm'] not in ARMS or item['propensity']!={'control':.8,'alternative-a':.1,'alternative-b':.1}[item['assignedArm']]:raise ValueError('propensity')
   # ACTIONS and features ONLY from pre-decision public command fields.
   encode(item,True)
   results.append(dict(setup=item['setupId'],cohort=cohort.parent.name,gun=c['gun'],
     arm=item['assignedArm'],propensity=item['propensity'],x=encode(item,True),
     baseX=encode(item,False),y=int(item['outcome']['hitWindow'])))
 return results
def score(y,p):
 if not len(y):return None
 p=np.clip(np.asarray(p,dtype=float),1e-6,1-1e-6);y=np.asarray(y)
 return dict(n=len(y),positive=int(np.sum(y)),brier=round(float(np.mean((p-y)**2)),6),
  logLoss=round(float(np.mean(-y*np.log(p)-(1-y)*np.log(1-p))),6))
def detail(rows,pred):
 result={'overall':score([r['y'] for r in rows],pred)}
 for a in ARMS:
  ids=[i for i,r in enumerate(rows) if r['arm']==a]
  result[a]=score([rows[i]['y'] for i in ids],[pred[i] for i in ids])
 per=[result[a]['brier'] for a in ARMS if result[a] is not None]
 result['equalArmMeanBrier']=round(float(statistics.mean(per)),6) if len(per)==3 else None
 return result
def glm_fit(rows,action,C):
 x=np.array([r['x'] if action else r['baseX'] for r in rows]);y=np.array([r['y'] for r in rows])
 scaler=StandardScaler().fit(x);model=LogisticRegression(C=C,max_iter=1500,random_state=35124)
 model.fit(scaler.transform(x),y);return scaler,model
def pred(glm,rows,action):
 scaler,m=glm;x=np.array([r['x'] if action else r['baseX'] for r in rows]);return m.predict_proba(scaler.transform(x))[:,1]
def neural_fit(rows,alpha):
 x=np.array([r['x'] for r in rows]);y=np.array([r['y'] for r in rows]);scaler=StandardScaler().fit(x)
 model=MLPClassifier(hidden_layer_sizes=(12,),alpha=alpha,solver='lbfgs',max_iter=400,random_state=35124)
 model.fit(scaler.transform(x),y);return scaler,model
def frozen_glm(glm):
 sc,m=glm;return dict(modelType='logistic-action-conditioned',featureNames=FEATURES,
  means=sc.mean_.tolist(),scales=sc.scale_.tolist(),weights=m.coef_[0].tolist(),intercept=float(m.intercept_[0]),
  interpretation='offline score only; NOT a causal Q(s,a) oracle, not approved for motor control')
def frozen_mlp(glm):
 sc,m=glm;return dict(modelType='mlp-action-conditioned',featureNames=FEATURES,
  means=sc.mean_.tolist(),scales=sc.scale_.tolist(),weights=[w.tolist() for w in m.coefs_],
  biases=[v.tolist() for v in m.intercepts_],activation='relu',outputActivation='logistic',
  interpretation='offline factual prediction only; not tested as motor policy')
def main():
 # Do not ignore matching setup metadata or reuse C35-W/X cases in more than one split.
 allrows=extract(OLD)+extract(NEW)
 cohorts={'old':len(extract(OLD)),'new':len(extract(NEW))}
 sets={s:set(r['setup'] for r in allrows if split(r['setup'])==s) for s in ('train','validation','holdout')}
 assert not (sets['train']&sets['holdout'] or sets['train']&sets['validation'] or sets['validation']&sets['holdout'])
 parts={s:[r for r in allrows if split(r['setup'])==s] for s in sets}
 tr,va,ho=(parts[s] for s in ('train','validation','holdout'))
 if any(len(x)<15 for x in (tr,va,ho)) or len({r['y'] for r in tr})<2:raise ValueError('insufficient observed labels for training')
 # Select regularization ONLY on setup-separated validation, NEVER on holdout.
 grid={};models={}
 for c in (.03,.3,3):
  for name,action in (('state-only',False),('action-logistic',True)):
   key=f'{name}-C{c}';m=glm_fit(tr,action,c);models[key]=(m,action)
   grid[key]=detail(va,pred(m,va,action))['overall']['brier']
 for alpha in (.5,5,50):
  key=f'action-mlp-alpha{alpha}';m=neural_fit(tr,alpha);models[key]=(m,True)
  grid[key]=detail(va,pred(m,va,True))['overall']['brier']
 selected={family:min((k for k in grid if k.startswith(family)),key=lambda k:(grid[k],k)) for family in ('state-only','action-logistic','action-mlp')}
 base=float(statistics.mean(r['y'] for r in tr))
 evaluate={'constant':detail(ho,np.full(len(ho),base))}
 for name,key in selected.items():
  model,action=models[key];evaluate[name]=detail(ho,pred(model,ho,action))
 # all scores below use holdout only once, no post-hoc model promotion.
 OUTPUT={
  'schema':'fpsarena-c35x-action-value-offline-v1','cohorts':cohorts,
  'splitMethod':'setup suffix mod 5; 0/1/2 train, 3 validation, 4 holdout',
  'splits':{s:dict(setups=sorted(sets[s]),n=len(parts[s]),byArm={a:sum(r['arm']==a for r in parts[s]) for a in ARMS},
   hitRate=round(statistics.mean(r['y'] for r in parts[s]),5) if parts[s] else None) for s in parts},
  'candidateValidationBrier':grid,'selectedByValidation':selected,'holdout':evaluate,
  'baselineTrainPrevalence':base,
  'promotion':'NOT APPROVED: observational factual prediction given randomized one-tick action does not prove safe policy improvement',
  'caveats':['small treated counts','outcomes of unselected actions unknown','sequential within-match interference',
   'overlapping windows share server events','action support exists only within C35-W safety-eligible states',
   'holdout performance does not estimate combat K/D advantage']}
 # Paired per-setup bootstrap: comparisons share the same windows; not iid shots.
 predicted={'constant':np.full(len(ho),base)}
 for name,key in selected.items():
  mo,action=models[key];predicted[name]=pred(mo,ho,action)
 OUT.mkdir(parents=True,exist_ok=True)
 with (OUT/'HOLDOUT-PREDICTIONS.csv').open('w',newline='') as f:
  cw=csv.writer(f);cw.writerow(['setup','cohort','weapon','assignedArm','propensity','label','constant','state-only','action-logistic','action-mlp'])
  for i,row in enumerate(ho):cw.writerow([row['setup'],row['cohort'],row['gun'],row['arm'],row['propensity'],row['y']]+[round(float(predicted[k][i]),9)for k in ('constant','state-only','action-logistic','action-mlp')])
 indices={name:[i for i,r in enumerate(ho)if r['setup']==name]for name in sorted(sets['holdout'])}
 active=[name for name,ids in indices.items()if ids]
 rr=random.Random(35125);bc={name:[]for name in ('action-logistic','action-mlp')}
 for _ in range(5000):
  sample=[i for _ in active for name in [rr.choice(active)] for i in indices[name]]
  y=np.array([ho[i]['y'] for i in sample]);state=predicted['state-only'][sample]
  for name in bc:bc[name].append(float(np.mean((predicted[name][sample]-y)**2-(state-y)**2)))
 def quant(vals,t):
  arr=sorted(vals);return round(float(arr[int((len(arr)-1)*t)]),6)
 OUTPUT['pairedSetupBootstrap5000ActionMinusStateOnlyBrier95']={k:[quant(v,.025),quant(v,.975)]for k,v in bc.items()}
 OUTPUT['effectiveHoldoutSetupClusters']=len(active)
 dump(OUT/'ACTION-VALUE-EVALUATION.json',OUTPUT)
 dump(OUT/'FROZEN-ACTION-LOGISTIC.json',frozen_glm(models[selected['action-logistic']][0]))
 dump(OUT/'FROZEN-ACTION-MLP.json',frozen_mlp(models[selected['action-mlp']][0]))
 print(json.dumps({'splits':OUTPUT['splits'],'holdout':evaluate,'selected':selected},indent=2))
if __name__=='__main__':main()
