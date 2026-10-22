#!/usr/bin/env python3
"""C28: train/freeze micro-encounter action-value MLP; evaluate once on held-out seeds.
Research-only: server fireWeapon labels with simplified motion, empty map, scripted enemy.
"""
import argparse,hashlib,json,math,random
from pathlib import Path
import numpy as np
import torch
from torch import nn
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'reports/c28/micro-v1'
WEAPONS=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3']
ACTIONS=['baseline','micro-left','micro-right']
FEATURE_NAMES=['distance/85','lag/.25','baseVelocity/3','offset/5']+[f'weapon={w}' for w in WEAPONS]

def sha(b):return hashlib.sha256(b).hexdigest()
def read(path):return json.loads(Path(path).read_text())
def record(rows):
 x=[];y=[]
 for row in rows:
  s=row['scenario']
  f=[s['distance']/85.,s['lagSeconds']/.25,s['baseVelocity']/3.,s['offset']/5.]
  f += [float(s['weaponId']==w) for w in WEAPONS]
  x.append(f);y.append([a['cappedLoss']/150 for a in row['arms']])
 return torch.tensor(np.asarray(x),dtype=torch.float32),torch.tensor(np.asarray(y),dtype=torch.float32)

class ValueNet(nn.Module):
 def __init__(self):
  super().__init__();self.net=nn.Sequential(nn.Linear(len(FEATURE_NAMES),24),nn.Tanh(),nn.Linear(24,12),nn.Tanh(),nn.Linear(12,3),nn.Sigmoid())
 def forward(self,x):return self.net(x)

def rule_away(row):
 # Fixed policy, no outcome labels. A coarse rule to move away from current lateral offset.
 off=row['scenario']['offset'];return 1 if off<=0 else 2

def loss_for_policy(rows,choices):return float(np.mean([r['arms'][int(k)]['cappedLoss'] for r,k in zip(rows,choices)]))
def saved_scores(rows,models):
 output={}
 for name,choices in models.items():
  counts={ACTIONS[i]:int(sum(a==i for a in choices)) for i in range(3)}
  output[name]={'meanCappedLoss':loss_for_policy(rows,choices),'counts':counts}
 return output

def load_development():
 p=read(BASE/'PRE-REGISTERED-PLAN.json');idx=read(BASE/'DATASET-INDEX.json')
 path=BASE/'DEVELOPMENT.json'
 if idx['registrationSHA256']!=p['registrationSHA256'] or sha(path.read_bytes())!=idx['developmentSHA256']:
  raise ValueError('C28 development dataset source/hash mismatch')
 data=read(path)
 if data['registrationSHA256']!=p['registrationSHA256']:raise ValueError('development registration mismatch')
 rows=data['rows'];splits={k:[r for r in rows if r['split']==k] for k in ['train','validation']}
 if len(splits['train'])!=432 or len(splits['validation'])!=144:raise ValueError('invalid development split')
 seeds=[r['scenario']['seed'] for r in rows]
 if len(seeds)!=len(set(seeds)) or any(r['split']=='test' for r in rows):raise ValueError('test leakage into development')
 for r in rows:
  s=next((v for v in p['scenarios'] if v['seed']==r['scenario']['seed']),None)
  if s is None or s['split']!=r['split']:raise ValueError('unexpected development seed/split')
 return p,idx,splits

def load_holdout(plan,index):
 path=BASE/'SEALED-HOLDOUT.json'
 if sha(path.read_bytes())!=index['sealedHoldoutSHA256']:raise ValueError('sealed holdout hash mismatch')
 data=read(path)
 if data['registrationSHA256']!=plan['registrationSHA256']:raise ValueError('holdout registration mismatch')
 rows=data['rows']
 if len(rows)!=144 or any(r['split']!='test' for r in rows):raise ValueError('invalid holdout split')
 expected={s['seed']:s for s in plan['scenarios'] if s['split']=='test'}
 if set(r['scenario']['seed'] for r in rows)!=set(expected):raise ValueError('holdout scenario seeds differ from preregistration')
 for r in rows:
  s=expected[r['scenario']['seed']]
  if any(r['scenario'][k]!=s[k] for k in ['weaponId','distance','lagSeconds','tracking','baseVelocity','offset','aim']):
   raise ValueError('holdout scenario covariate was modified')
 return rows

def freeze():
 plan,index,splits=load_development()
 torch.set_num_threads(1);torch.manual_seed(282828);np.random.seed(282828);random.seed(282828)
 torch.use_deterministic_algorithms(True)
 xtr,ytr=record(splits['train']);xv,yv=record(splits['validation'])
 net=ValueNet();opt=torch.optim.AdamW(net.parameters(),lr=.007,weight_decay=.002)
 best=None;bestloss=math.inf;bestepoch=0;patience=0;training=[]
 # Validation outcomes are used only for model selection / early stopping.
 for epoch in range(1,451):
  opt.zero_grad();pred=net(xtr);loss=nn.functional.smooth_l1_loss(pred,ytr,beta=.13);loss.backward();opt.step()
  with torch.no_grad():vl=float(nn.functional.mse_loss(net(xv),yv))
  if epoch==1 or epoch%20==0:training.append({'epoch':epoch,'trainHuber':round(float(loss.detach()),7),'validationMSE':round(vl,7)})
  if vl<bestloss-1e-7:
   bestloss=vl;bestepoch=epoch;best={k:v.detach().clone() for k,v in net.state_dict().items()};patience=0
  else:patience+=1
  if patience>=70:break
 net.load_state_dict(best)
 def neural(rows):
  with torch.no_grad():return torch.argmin(net(record(rows)[0]),dim=1).tolist()
 tr,va=splits['train'],splits['validation']
 constant=min(range(3),key=lambda a:loss_for_policy(tr,[a]*len(tr)))
 policies={'baseline':[0]*len(va),'best_constant_training':[constant]*len(va),
  'rule_away_from_offset':[rule_away(r) for r in va],'neural_mlp':neural(va)}
 val_scores=saved_scores(va,policies)
 order=['baseline','best_constant_training','rule_away_from_offset','neural_mlp']
 chosen=min(order,key=lambda p:(val_scores[p]['meanCappedLoss'],order.index(p)))
 freeze={'schema':'fpsarena-c28-frozen-action-value-v1','researchOnly':True,
  'planSHA256':plan['registrationSHA256'],'datasetSHA256':index['allSHA256'],'sealedHoldoutSHA256':index['sealedHoldoutSHA256'],
  'featureNames':FEATURE_NAMES,'model':'MLP 10→24→12→3 sigmoid',
  'trainingSeed':282828,'trainRows':len(tr),'validationRows':len(va),'holdoutLabelsOpenedDuringFreeze':False,'holdoutRowsPrespecified':144,
  'bestEpoch':bestepoch,'validationMSE':bestloss,'training':training,
  'weights':{k:v.tolist() for k,v in best.items()},
  'constantAction':constant,'validationScores':val_scores,
  'preselectedPolicy':chosen,'selectionMetric':'minimize validation mean capped loss per independent scenario',
  'selectionTieBreak':order,'promotion':False}
 target=BASE/'FROZEN-POLICY.json'
 payload=json.dumps(freeze,indent=2,sort_keys=True)+'\n'
 if target.exists() and target.read_text()!=payload:raise RuntimeError('frozen model differs; use a new study directory')
 target.write_text(payload)
 print(json.dumps({'frozen':str(target),'preselected':chosen,'bestEpoch':bestepoch,'validation':val_scores},indent=2))

def bootstrap(rows,choiceA,choiceB):
 # Cluster is the complete initial scenario with three paired arms. Resample
 # within weapon strata; fixed 6 weapons x 24 holdout scenarios each.
 by={w:[i for i,r in enumerate(rows) if r['scenario']['weaponId']==w] for w in WEAPONS}
 if any(len(v)!=24 for v in by.values()):raise ValueError('incorrect holdout strata')
 rng=random.Random(2829);res=[]
 for _ in range(4000):
  ix=[rng.choice(by[w]) for w in WEAPONS for i in by[w]]
  gain=sum(rows[i]['arms'][choiceB[i]]['cappedLoss']-rows[i]['arms'][choiceA[i]]['cappedLoss'] for i in ix)/len(ix)
  res.append(gain)
 return [float(x) for x in np.quantile(res,[.025,.975])]

def evaluate():
 plan,index,splits=load_development();f=read(BASE/'FROZEN-POLICY.json')
 if f['planSHA256']!=plan['registrationSHA256'] or f['datasetSHA256']!=index['allSHA256'] or f['sealedHoldoutSHA256']!=index['sealedHoldoutSHA256']:raise ValueError('frozen plan/dataset mismatch')
 if f['featureNames']!=FEATURE_NAMES or f['promotion']!=False:raise ValueError('frozen feature/promotion mismatch')
 net=ValueNet();net.load_state_dict({k:torch.tensor(v,dtype=torch.float32) for k,v in f['weights'].items()});net.eval()
 test=load_holdout(plan,index)
 with torch.no_grad():choices=net(record(test)[0]).argmin(dim=1).tolist()
 c=f['constantAction'];policies={
  'baseline':[0]*len(test),'best_constant_training':[c]*len(test),
  'rule_away_from_offset':[rule_away(r) for r in test],'neural_mlp':choices}
 scores=saved_scores(test,policies)
 candidate=f['preselectedPolicy'];a=policies[candidate]
 bestComparator=min(['baseline','best_constant_training','rule_away_from_offset'],key=lambda p:f['validationScores'][p]['meanCappedLoss'])
 gainBaseline=scores['baseline']['meanCappedLoss']-scores[candidate]['meanCappedLoss']
 gainComparator=scores[bestComparator]['meanCappedLoss']-scores[candidate]['meanCappedLoss']
 # Unattainable oracle: observes all post-intervention labels and must not be a policy.
 oracle=np.asarray([min(a['cappedLoss'] for a in r['arms']) for r in test]);oracleDamage=float(np.mean(oracle))
 report={'schema':'fpsarena-c28-locked-holdout-evaluation-v1','isFullMatch':False,'sampleSize':len(test),
  'perWeapon':24,'frozenModelSHA256':sha((BASE/'FROZEN-POLICY.json').read_bytes()),
  'preselectedPolicy':candidate,'primaryMetric':'mean capped damage under server fireWeapon micro-harness',
  'testScores':scores,'oracleUnattainableDamage':oracleDamage,
  'comparison':{'baselineGain':gainBaseline,'baselineGainCI95':bootstrap(test,a,policies['baseline']),
   'bestValidationSimplePolicy':bestComparator,'simplePolicyGain':gainComparator,
   'simplePolicyGainCI95':bootstrap(test,a,policies[bestComparator])},
  'perWeapon':[{'weaponId':w,'n':len(ix),'baselineMean':loss_for_policy(ix,[0]*len(ix)),
   'selectedMean':loss_for_policy(ix,[a[i] for i,r in enumerate(test) if r['scenario']['weaponId']==w]),
   'neuralMean':loss_for_policy(ix,[choices[i] for i,r in enumerate(test) if r['scenario']['weaponId']==w])}
   for w in WEAPONS for ix in [[r for r in test if r['scenario']['weaponId']==w]]],
  'warnings':['scripted aim responses and empty-world physics; not real gameplay evidence',
   'capped loss assumes 150 maximum HP+armor with no healing/respawn; server records uncapped hits',
   'three counterfactuals are computed in a cloned microenvironment, NOT a randomized multiplayer trial',
   'no browser FPS/latency, no map geometry or multiple enemies',
   'test cannot be reused for policy selection']}
 report['releaseDecision']='RESEARCH ONLY: no production policy modifications'
 target=BASE/'EVALUATION.json';text=json.dumps(report,indent=2)+'\n'
 if target.exists() and target.read_text()!=text:raise RuntimeError('evaluation changed: refuse overwrite')
 target.write_text(text)
 print(json.dumps({'selected':candidate,'testScores':scores,'baselineGain':gainBaseline,
  'baselineGainCI95':report['comparison']['baselineGainCI95'],'simpleGain':gainComparator,
  'simpleGainCI95':report['comparison']['simplePolicyGainCI95'],'oracle':oracleDamage},indent=2))

def main():
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['freeze','evaluate']);args=parser.parse_args()
 if args.action=='freeze':freeze()
 else:evaluate()
if __name__=='__main__':main()
