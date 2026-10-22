#!/usr/bin/env python3
"""Recompute frozen sklearn MLP/logistic predictions using portable Python math."""
from pathlib import Path
import json,csv,math,importlib.util
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('c35x_trainer',ROOT/'scripts/train-c35x-action-value.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
O=ROOT/'reports/c35x/action-value-v1'
read=lambda p:json.loads(Path(p).read_text())
def sigmoid(z):return 1/(1+math.exp(-max(-60,min(60,z))))
def predict(config,features):
 x=[(v-a)/b for v,a,b in zip(features,config['means'],config['scales'],strict=True)]
 if config['modelType']=='logistic-action-conditioned':
  return sigmoid(sum(a*b for a,b in zip(x,config['weights'],strict=True))+config['intercept'])
 assert config['modelType']=='mlp-action-conditioned'
 for i,(weights,biases) in enumerate(zip(config['weights'],config['biases'],strict=True)):
  y=[sum(x[j]*weights[j][k]for j in range(len(x)))+biases[k]for k in range(len(biases))]
  x=[max(0,z)for z in y]if i+1<len(config['weights'])else [sigmoid(z)for z in y]
 return x[0]
def main():
 models={k:read(O/f'FROZEN-ACTION-{name}.json')for k,name in [('action-logistic','LOGISTIC'),('action-mlp','MLP')]}
 ho=[r for r in m.extract(m.OLD)+m.extract(m.NEW)if m.split(r['setup'])=='holdout']
 with (O/'HOLDOUT-PREDICTIONS.csv').open() as file:rows=list(csv.DictReader(file))
 assert len(rows)==len(ho)
 worst=0.0
 for r,row in zip(ho,rows,strict=True):
  assert r['setup']==row['setup']and r['y']==int(row['label'])and r['arm']==row['assignedArm']
  for key,model in models.items():
   assert model['featureNames']==m.FEATURES
   delta=abs(predict(model,r['x'])-float(row[key]))
   worst=max(worst,delta)
   if delta>1e-6:raise AssertionError(f'{key} frozen inference mismatch {delta}')
 result=dict(schema='fpsarena-c35x-frozen-weight-parity-v1',status='PASS',holdoutRows=len(ho),models=list(models),
  maxProbabilityDifference=worst,serverLabelsNeverUsedAsFeatures=True,policyIntegration=False)
 (O/'FROZEN-MODEL-VALIDATION.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result,indent=2))
if __name__=='__main__':main()
