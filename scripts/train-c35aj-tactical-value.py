#!/usr/bin/env python3
"""C35-AJ offline tactical value. Frozen setup holdout, factual assigned returns only.
Never use downstream physical displacement, option compliance, or future events as inputs.
"""
from pathlib import Path
from collections import defaultdict,Counter
import json,csv,hashlib,warnings,random
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.neural_network import MLPRegressor
from sklearn.metrics import mean_squared_error
R=Path(__file__).resolve().parents[1]
NEW=R/'reports/c35aj/prospective-108-v1';OLD=R/'reports/c35ai/frozen-72-v5';OUT=R/'reports/c35aj/neural'
OUT.mkdir(parents=True,exist_ok=True)
ARMS=['incumbent','option-a','option-b'];GUNS=['hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'];MAPS=['foundry','neon','arena'];OPPS=['stress','official','mixed']
def load(f):return json.loads(Path(f).read_text())
def sha(f):return hashlib.sha256(Path(f).read_bytes()).hexdigest()
def rows(base,tag):
 d=load(base/'FROZEN-DESIGN.json');audit=load(base/'EXECUTION-AUDIT.json')
 assert len(d['cases'])==len(audit['cases']) and sha(base/'FROZEN-DESIGN.json')==audit['registrationSHA256']
 out=[]
 for c in d['cases']:
  if c['arm']!='randomized':continue
  trace=load(base/'matches'/f'{c["id"]}.option.json')['traces'][0]
  for r in trace['rows']:
   assert r['assignedArm'] in ARMS and r['unselectedOutcomes'] is None and r['propensity']==[.5,.25,.25][ARMS.index(r['assignedArm'])]
   assert r['initialPublicFeatures'] and len(r['menu'])==2
   item=dict(source=tag,setupId=c['setupId'],gun=c['gun'],map=c['map'],opponents=c['opponents'],lagMs=c['lagMs'],
             seed=c['seed'],index=r['index'],arm=r['assignedArm'],propensity=r['propensity'],features=r['initialPublicFeatures'],
             incumbent=r['initialCommand'],menu=r['menu'],complete=bool(r['factual']['complete']),factual=r['factual'])
   if item['complete']:
    f=item['factual'];assert all(f[k]>=0 for k in ('ownKills','deathCount','damageDealt','damageTaken'))
    # Capped 6-second utility prevents sniper headshot multiplier from driving raw scale.
    item['reward']=(min(300,f['damageDealt'])-min(300,f['damageTaken'])+100*(f['ownKills']-f['deathCount']))/100
    item['survived']=int(bool(f['survived']))
   out.append(item)
 return out
records=rows(OLD,'legacy-c35ai')+rows(NEW,'prospective-c35aj')
for r in records:
 if r['source']=='legacy-c35ai':r['split']='validation' if int(r['setupId'][-2:])>=18 else 'train'
 else:r['split']='holdout' if int(r['setupId'][-2:])>=24 else 'train'
assert len({r['setupId'] for r in records if r['split']=='train'})>=40  # some preregistered setups legitimately have zero eligible assignments
assert len({r['setupId'] for r in records if r['split']=='validation'})==6
assert len({r['setupId'] for r in records if r['split']=='holdout'})==12
complete=[r for r in records if r['complete']]
for s in ('train','validation','holdout'):assert len([r for r in complete if r['split']==s])>5
numeric=['distance','ageMs','angleDeg','hp','enemyCount','fire','aim','near','far','incumbentRadial','incumbentHeuristic']
keys=['forward','backward','left','right']
STATES=numeric+['gun_'+g for g in GUNS]+['map_'+m for m in MAPS]+['opp_'+m for m in OPPS]+['lagScaled']+['cmd_'+k for k in keys]+['menu_a_heur','menu_b_heur','menu_diff']
ACTIONS=['action_'+a for a in ARMS]+['interaction_aim_'+a for a in ARMS]+['interaction_distance_'+a for a in ARMS]+['action_selected_heuristic']
def vector(r,arm,action=True):
 f=r['features'];a=float(r['menu'][0]['heuristic']);b=float(r['menu'][1]['heuristic'])
 v=[float(f.get(k) or 0) for k in numeric]+[float(r['gun']==g) for g in GUNS]+[float(r['map']==m) for m in MAPS]+[float(r['opponents']==m) for m in OPPS]+[r['lagMs']/250.0]+[float(r['incumbent'].get(k,False)) for k in keys]+[a,b,a-b]
 if action:
  v += [float(arm==x) for x in ARMS]
  v += [float(arm==x)*float(f.get('aim') or 0) for x in ARMS]
  v += [float(arm==x)*float(f.get('distance') or 0)/100 for x in ARMS]
  v += [[float(f['incumbentHeuristic']),a,b][ARMS.index(arm)]]
 return np.asarray(v,dtype=np.float64)
assert all(len(vector(r,r['arm'],False))==len(STATES) and len(vector(r,r['arm']))==len(STATES)+len(ACTIONS) for r in complete)
X_state=np.stack([vector(r,r['arm'],False) for r in complete]);X_action=np.stack([vector(r,r['arm']) for r in complete]);Y=np.array([r['reward'] for r in complete]);S=np.array([r['split'] for r in complete]);
mask={k:(S==k) for k in ('train','validation','holdout')}
class Constant:
 def __init__(self,x):self.average=x
 def predict(self,x):return np.full(len(x),self.average)
constant=Constant(float(Y[mask['train']].mean()))
models={};specs={};scalers={};metrics={};
def evaluate(model,X):
 return {s:{'n':int(mask[s].sum()),'mse':float(mean_squared_error(Y[mask[s]],model.predict(X[mask[s]]))),
            'mae':float(np.abs(Y[mask[s]]-model.predict(X[mask[s]])).mean())} for s in mask}
metrics['constant']=evaluate(constant,X_state)
configs=[('state_ridge_10','state',Ridge(alpha=10)),('state_ridge_100','state',Ridge(alpha=100)),
         ('action_ridge_10','action',Ridge(alpha=10)),('action_ridge_100','action',Ridge(alpha=100)),
         ('action_mlp_8','action',MLPRegressor(hidden_layer_sizes=(8,),solver='lbfgs',activation='tanh',alpha=20,max_iter=700,random_state=352026)),
         ('action_mlp_16','action',MLPRegressor(hidden_layer_sizes=(16,),solver='lbfgs',activation='tanh',alpha=40,max_iter=700,random_state=352026))]
with warnings.catch_warnings(record=True) as ws:
 warnings.simplefilter('always')
 for name,space,m in configs:
  X=X_state if space=='state' else X_action
  scaler=StandardScaler().fit(X[mask['train']]);scalers[name]=scaler
  mat=scaler.transform(X);m.fit(mat[mask['train']],Y[mask['train']]);models[name]=m;specs[name]={'space':space,'config':str(m)};metrics[name]=evaluate(m,mat)
 warningsSeen=sorted(set(str(w.message) for w in ws))
select=lambda candidates:min(candidates,key=lambda name:(metrics[name]['validation']['mse'],name))
state=select(['state_ridge_10','state_ridge_100']);action=select([n for n in models if n.startswith('action_')])
def artifact(name):
 m=models[name];sc=scalers[name];v=dict(kind='ridge' if isinstance(m,Ridge) else 'mlp-tanh',space=specs[name]['space'],scalerMean=sc.mean_.tolist(),scalerScale=sc.scale_.tolist())
 if isinstance(m,Ridge):v.update(coefficients=np.asarray(m.coef_).tolist(),intercept=float(m.intercept_))
 else:v.update(weights=[x.tolist() for x in m.coefs_],biases=[x.tolist() for x in m.intercepts_])
 return v
def predict_art(v,x):
 z=(np.asarray(x)-v['scalerMean'])/v['scalerScale']
 if v['kind']=='ridge':return float(np.dot(z,v['coefficients'])+v['intercept'])
 for w,b in zip(v['weights'],v['biases']):
  z=z@np.asarray(w)+np.asarray(b)
  if len(b)>1:z=np.tanh(z)
 return float(np.asarray(z).reshape(-1)[0])
frozen={name:artifact(name) for name in models};maxerr=0
for name in models:
 X=X_state if specs[name]['space']=='state' else X_action
 for i in np.where(mask['holdout'])[0]:
  a=predict_art(frozen[name],X[i]);b=models[name].predict(scalers[name].transform(X[i:i+1]))[0]
  maxerr=max(maxerr,abs(a-b))
assert maxerr<1e-8,maxerr
# Off-policy: all actions were randomized with known propensities; evaluate on fixed held-out setups only.
held=[r for r in complete if r['split']=='holdout']
def q(r,a):return predict_art(frozen[action],vector(r,a))
def selected(r):return max(ARMS,key=lambda a:(q(r,a),-ARMS.index(a)))
def estimate(rows,policy):
 n=len(rows)
 if not n:return {'ips':None,'snips':None,'effectiveSampleSize':0,'matchedOffers':0}
 weights=np.array([(1/r['propensity']) if r['arm']==policy(r) else 0 for r in rows]);ys=np.array([r['reward'] for r in rows])
 return {'ips':float((weights*ys).mean()),'snips':float((weights*ys).sum()/max(weights.sum(),1e-12)),
         'effectiveSampleSize':float(weights.sum()**2/max(float((weights*weights).sum()),1e-12)),
         'matchedOffers':int(np.count_nonzero(weights))}
policies={'always_incumbent':lambda r:'incumbent','chosen_action_model':selected,
          'always_option_a':lambda r:'option-a','always_option_b':lambda r:'option-b'}
ips={k:estimate(held,v) for k,v in policies.items()}
by=defaultdict(list)
for r in held:by[r['setupId']].append(r)
clusterNames=sorted(by);rng=random.Random(20263571);deltas=[];deltaSnips=[];pairs=[]
for i in range(5000):
 sample=[r for s in rng.choices(clusterNames,k=len(clusterNames)) for r in by[s]]
 a=estimate(sample,policies['chosen_action_model']);b=estimate(sample,policies['always_incumbent']);deltas.append(a['ips']-b['ips']);deltaSnips.append(a['snips']-b['snips'])
ci=lambda values:[float(np.quantile(values,.025)),float(np.quantile(values,.975))]
def serializeRow(r):
 return {k:r[k] for k in ['source','split','setupId','gun','map','lagMs','opponents','seed','index','arm','propensity','complete']}|({'reward':r['reward'],'survived':r['survived'],'factual':r['factual']} if r['complete'] else {'censored':True})
with (OUT/'FACTUAL-ASSIGNMENTS.csv').open('w',newline='') as f:
 fields=['source','split','setupId','gun','map','lagMs','opponents','seed','index','assignedArm','propensity','complete','reward','survived','ownKills','deathCount','damageDealt','damageTaken','modifiedTicks','physicalMeters']
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for r in records:
  w.writerow({**{k:r[k] for k in ['source','split','setupId','gun','map','lagMs','opponents','seed','index','propensity','complete']},'assignedArm':r['arm'],
          'reward':r.get('reward'),'survived':r.get('survived'), **{k:r['factual'].get(k) for k in ['ownKills','deathCount','damageDealt','damageTaken']}})
# held out forecasts for reproduction/inspection; counterfactuals are MODEL PREDICTIONS ONLY, no fake ground truth
with (OUT/'HOLDOUT-PREDICTIONS.csv').open('w',newline='') as f:
 fields=['setupId','gun','assignedArm','factualReward','chosenArm','statePrediction','assignedActionPrediction','predIncumbent','predOptionA','predOptionB','propensity']
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for r in held:
  w.writerow(dict(setupId=r['setupId'],gun=r['gun'],assignedArm=r['arm'],factualReward=r['reward'],chosenArm=selected(r),
           statePrediction=predict_art(frozen[state],vector(r,r['arm'],False)),assignedActionPrediction=q(r,r['arm']),
           predIncumbent=q(r,'incumbent'),predOptionA=q(r,'option-a'),predOptionB=q(r,'option-b'),propensity=r['propensity']))
weights=dict(schema='fpsarena-c35aj-frozen-tactical-option-v1',status='OFFLINE_ONLY',stateFeatureNames=STATES,actionFeatureNames=ACTIONS,
             models=frozen,selectedStateOnly=state,selectedAction=action,
             featurePolicy='PUBLIC_PRE_ASSIGNMENT_ONLY: never use physical displacement, compliance or future actions to select',
             reward='(min(300,server_damage_dealt)-min(300,server_damage_taken)+100*(kills-deaths))/100',
             sourceRegistrations={'legacyC35AI':sha(OLD/'FROZEN-DESIGN.json'),'prospectiveC35AJ':sha(NEW/'FROZEN-DESIGN.json')},
             predictionParityMaxError=maxerr,productionEnabled=False)
(OUT/'FROZEN-TACTICAL-MODELS.json').write_text(json.dumps(weights,indent=2)+'\n')
report=dict(schema='fpsarena-c35aj-tactical-value-evaluation-v1',totalAssignments=len(records),completed=len(complete),censored=len(records)-len(complete),
            splitBySetup={s:dict(setups=sorted(set(r['setupId'] for r in records if r['split']==s)),assignments=sum(r['split']==s for r in records),complete=int(mask[s].sum()),arms=dict(Counter(r['arm'] for r in complete if r['split']==s))) for s in mask},
            holdoutWeapons=dict(Counter(r['gun'] for r in held)),
            validationSelected={'stateOnly':state,'actionConditioned':action},allModelMetrics=metrics,
            holdoutMSEImprovementOverState=float(metrics[state]['holdout']['mse']-metrics[action]['holdout']['mse']),
            offPolicyHoldout=dict(estimators=ips,ipsDeltaModelMinusIncumbent=float(ips['chosen_action_model']['ips']-ips['always_incumbent']['ips']),
                 clusterBootstrap95DeltaIPS=ci(deltas),clusterBootstrap95DeltaSNIPS=ci(deltaSnips),setupClusters=len(clusterNames)),
            predictionParityMaxAbsoluteError=maxerr,trainingWarnings=warningsSeen,
            decision='NOT_PROMOTED; prospective setup-based statistical evidence required; no model-controlled matches',
            limitations=['Only AA12 and Uzi appear in frozen prospective holdout (setup indices 24-35); not all-gun generalization',
              'Validation legacy setups 18-23 also skew toward AA12 and Uzi; retain this frozen limitation',
              'ITT randomization is option class, not realized movement or uninterrupted execution',
              'Censored horizon windows not assigned artificial zero rewards','Temporal correlation within each setup; bootstrap by setup',
              'Factual reward predictive MSE alone cannot establish the value of selecting unassigned options'])
(OUT/'EVALUATION.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['totalAssignments','completed','splitBySetup','validationSelected','holdoutMSEImprovementOverState','offPolicyHoldout','decision']},indent=2))
