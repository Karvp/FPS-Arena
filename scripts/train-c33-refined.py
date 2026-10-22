#!/usr/bin/env python3
"""C33: neural action-value training with validation-only model selection.

IMPORTANT: NEVER read SEALED-HOLDOUT during candidate training, selection, or freezing.
"""
import json,hashlib,random,math
from pathlib import Path
import numpy as np
import torch
from torch import nn
R=Path(__file__).resolve().parents[1];D=R/'reports/c33/refined-cohort'
ACTIONS=('baseline','micro-left','micro-right')
WEAPONS=('mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3')
FEATS=('distance/100','snapshotLag/.25','publicVx/9','publicVz/9','publicBodyYawToTarget/pi',
'LOS-now','LOS-left-projection','LOS-right-projection','collision-clear-left','collision-clear-right')+tuple('enemyWeapon='+w for w in WEAPONS)+('signedWorldLateral/100','predictedLeftDx/.16speed','predictedRightDx/.16speed')
def sha(b):return hashlib.sha256(b).hexdigest()
def fixed(name,obj):
 p=D/name;txt=json.dumps(obj,indent=2,ensure_ascii=False)+'\n'
 if p.exists() and p.read_text()!=txt:raise ValueError('C33 cannot overwrite '+name)
 if not p.exists():p.write_text(txt)
 return sha(txt.encode())
class Net(nn.Module):
 def __init__(self):
  super().__init__();self.net=nn.Sequential(nn.Linear(19,40),nn.Tanh(),nn.Linear(40,24),nn.Tanh(),nn.Linear(24,3),nn.Sigmoid())
 def forward(self,x):return self.net(x)
def targets(rows):return np.array([[a['cappedLoss'] for a in r['arms']] for r in rows],dtype=np.float32)
def features(rows):return np.asarray([r['publicFeatures'] for r in rows],dtype=np.float32)
def policies(rows):
 x=features(rows);n=len(rows)
 base={'baseline':np.zeros(n,dtype=int),'always-left':np.ones(n,dtype=int),'always-right':np.full(n,2,dtype=int)}
 # Public map visibility heuristic: preferentially choose lower exposed LOS.
 base['cover-los']=np.where(x[:,6]<x[:,7],1,np.where(x[:,7]<x[:,6],2,0))
 # Pre-action movement feasibility heuristic based solely on static map collision.
 base['avoid-blocked']=np.where(x[:,8]>x[:,9],1,np.where(x[:,9]>x[:,8],2,0))
 # Restricted cover heuristic: prefer cover only in a collision-feasible direction.
 score_l=x[:,6]+(1-x[:,8])*.3;score_r=x[:,7]+(1-x[:,9])*.3;score_0=x[:,5]
 base['cover-and-clearance']=np.where((score_l<score_r)&(score_l<score_0),1,
       np.where((score_r<score_l)&(score_r<score_0),2,0))
 # Predict lateral space from collision-only, not server-shot labels.
 delta_l=np.abs(x[:,17]);delta_r=np.abs(x[:,18]);
 base['more-side-clearance']=np.where((delta_l>delta_r)&(delta_l>.1),1,np.where((delta_r>delta_l)&(delta_r>.1),2,0))
 return base
def evaluate(rows,pred):
 y=targets(rows);n=len(rows);chosen=y[np.arange(n),pred];diff=chosen-y.min(axis=1)
 by_weapon={}
 for w in WEAPONS:
  idx=np.array([r['scenario']['weaponId']==w for r in rows]);by_weapon[w]={k:int(np.count_nonzero(pred[idx]==k)) for k in range(3)}
 return {'meanLoss':float(chosen.mean()),'meanRegret':float(diff.mean()),
         'counts':{a:int(np.count_nonzero(pred==i)) for i,a in enumerate(ACTIONS)},'byWeapon':by_weapon}
def train():
 plan=json.loads((D/'PRE-REGISTERED-PLAN.json').read_text());idx=json.loads((D/'INDEX.json').read_text());
 data=(D/'DEVELOPMENT.json').read_bytes();assert sha(data)==idx['developmentSHA256']
 obj=json.loads(data);assert obj['registrationSHA256']==plan['registrationSHA256']
 train_rows=[r for r in obj['rows'] if r['split']=='train'];val_rows=[r for r in obj['rows'] if r['split']=='validation'];
 assert (len(train_rows),len(val_rows))==(1944,648)
 assert all(len(r['publicFeatures'])==19 for r in obj['rows'])
 selection_plan={'schema':'fpsarena-c33b-neural-model-selection-plan-v1','registrationSHA256':plan['registrationSHA256'],
 'inputFeatures':FEATS,'candidateSeeds':(33001,33007,33013,33019,33031,33037),
 'neuralArchitecture':'MLP 19→40→24→3 sigmoid','trainingEpochMax':600,'earlyStoppingPatience':75,
 'optimizer':'AdamW 0.003, decay 0.002',
 'loss':'C33-B damage-sensitive weighted SmoothL1 (5x sensitive) plus 3x centered value loss, chosen before B labels evaluated',
 'selection':'lowest mean validation capped loss including all trivial heuristics, baseline favored ties',
 'predeclaredBaselineNames':list(policies(val_rows)),
 'gate':plan['predeclaredGates'],'sealedTestAccessibleToTrainer':False,
 'choiceRestrictedToValidation':True};fixed('MODEL-SELECTION-PLAN.json',selection_plan)
 torch.set_num_threads(1);torch.use_deterministic_algorithms(True)
 xt=torch.tensor(features(train_rows));yt=torch.tensor(targets(train_rows)/150)
 xv=torch.tensor(features(val_rows));yv=torch.tensor(targets(val_rows)/150)
 choices=policies(val_rows);candidates=[]
 for seed in selection_plan['candidateSeeds']:
  torch.manual_seed(seed);np.random.seed(seed);random.seed(seed);model=Net();opt=torch.optim.AdamW(model.parameters(),lr=.003,weight_decay=.002)
  best=1e9;state=None;best_ep=0;miss=0
  for epoch in range(1,601):
   model.train();opt.zero_grad();p=model(xt)
   spread=(yt.max(dim=1).values-yt.min(dim=1).values).clamp(min=.035)
   centered=(p-p.mean(dim=1,keepdim=True))-(yt-yt.mean(dim=1,keepdim=True))
   sensitive=(yt.max(dim=1).values-yt.min(dim=1).values>.00001).float()
   per=nn.functional.smooth_l1_loss(p,yt,beta=.08,reduction='none').mean(dim=1)
   loss=torch.mean((1+4*sensitive)*per)+3*torch.mean(spread[:,None]*centered.square())
   loss.backward();opt.step()
   with torch.no_grad():
    model.eval();mse=float(nn.functional.mse_loss(model(xv),yv))
   if mse<best-1e-8:
    best=mse;state={k:v.detach().clone() for k,v in model.state_dict().items()};best_ep=epoch;miss=0
   else:miss+=1
   if miss>=75:break
  model.load_state_dict(state);model.eval()
  with torch.no_grad():val_pred=model(xv).argmin(dim=1).numpy()
  name=f'neural-{seed}';choices[name]=val_pred
  candidates.append({'name':name,'seed':seed,'bestEpoch':best_ep,'bestMSE':best,'weights':{k:v.tolist() for k,v in state.items()}})
  print('candidate',name,'epoch',best_ep,'validation',evaluate(val_rows,val_pred)['meanLoss'],flush=True)
 scores={name:evaluate(val_rows,pred) for name,pred in choices.items()}
 pref=list(selection_plan['predeclaredBaselineNames'])+[c['name'] for c in candidates]
 selected=min(pref,key=lambda name:(scores[name]['meanLoss'],pref.index(name)))
 best_simple=min(selection_plan['predeclaredBaselineNames'],key=lambda name:(scores[name]['meanLoss'],pref.index(name)))
 best_neural=min([c['name'] for c in candidates],key=lambda name:(scores[name]['meanLoss'],pref.index(name)))
 gain=scores[best_simple]['meanLoss']-scores[best_neural]['meanLoss']
 noncollapsed=sum(1 for w in WEAPONS if sum(v>0 for v in scores[best_neural]['byWeapon'][w].values())>=2)
 neural_gate= gain>=plan['predeclaredGates']['minNeuralValGainOverBestSimple'] and noncollapsed>=plan['predeclaredGates']['minNeuralWithinWeaponDiversity'] and selected==best_neural
 frozen={'schema':'fpsarena-c33b-map-frozen-validation-only-v1','registrationSHA256':plan['registrationSHA256'],
 'sourceSHA256':idx['sourceSHA256'],'developmentSHA256':idx['developmentSHA256'],
 'sealedTestSHA256':idx['sealedTestSHA256'],'modelSelectionPlanSHA256':sha((D/'MODEL-SELECTION-PLAN.json').read_bytes()),
 'modelArchitecture':'MLP 19→40→24→3 sigmoid','features':FEATS,
 'selected':selected,'selectedBestSimple':best_simple,'selectedBestNeural':best_neural,
 'neuralEligibleForFullMatch':neural_gate,'neuralGainOverBestSimpleVal':gain,'noncollapsedWithinWeaponCount':noncollapsed,
 'validation':scores,'candidateWeights':{c['name']:c['weights'] for c in candidates},
 'training':[{k:v for k,v in c.items() if k!='weights'} for c in candidates],
 'candidateSelection':'strictly validation only','testViewedBeforeFreeze':False,'productionAuthorized':False};
 frozenSHA256=fixed('FROZEN-MODEL.json',frozen)
 print(json.dumps({'selected':selected,'bestSimple':best_simple,'bestNeural':best_neural,'neuralGain':gain,
 'noncollapsedWithinWeaponCount':noncollapsed,'neuralGate':neural_gate,'frozenSHA256':frozenSHA256,
 'validation':{n:{'meanLoss':round(v['meanLoss'],4),'meanRegret':round(v['meanRegret'],4),'counts':v['counts']} for n,v in scores.items()}},indent=2))
if __name__=='__main__':train()
