#!/usr/bin/env python3
"""One-time external holdout evaluation on NEW seed cohort, no fitting/refitting."""
from pathlib import Path
import sys,json,csv,hashlib,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from importlib import import_module
T=import_module('train-c35ae-ads-value')
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ae/prospective-24';A=R/'reports/c35ae/offline-ads-value'
def read(p):return json.loads(Path(p).read_text())
def dump(p,o):p.write_text(json.dumps(o,indent=2,sort_keys=True)+'\n')
def predict(mod,X):
 v=(X-np.array(mod['mean']))/np.array(mod['scale'])
 for layer in mod['layers']:
  w=np.array(layer['weights']);b=np.array(layer['bias']);v=v@w.T+b if w.ndim==2 else v@w+b
  v=np.maximum(v,0) if layer['activation']=='relu' else 1/(1+np.exp(-np.clip(v,-50,50)))
 return np.array(v).reshape(-1)
def main():
 audit=read(O/'INDEPENDENT-AUDIT.json');assert audit['status']=='PASS'
 models=read(A/'FROZEN-ADS-VALUE-MODELS.json');ret=read(A/'RETROSPECTIVE-EVALUATION.json')
 rows,files=T.read_rows(O/'matches');assert len(files)==12 and len(rows)==audit['completedFactual']
 assert not {r['setup'] for r in rows}&set(sum(ret['split'].values(),[]))
 scores={};ys=np.array([r['target'] for r in rows]);train_rate=ret['modelMetrics']['validation']['constant']['positive']/ret['modelMetrics']['validation']['constant']['n']
 # The true constant baseline is training-set prevalence, not validation prevalence.
 trainrows,_=T.read_rows()
 train_ids=set(ret['split']['train']);train_rate=sum(q['target'] for q in trainrows if q['setup'] in train_ids)/sum(q['setup'] in train_ids for q in trainrows)
 scores['constant']=T.metrics(ys,np.full(len(ys),train_rate))
 checks=[]
 for name,model in models.items():
  X=np.array([T.assignment(q,name!='state-logistic') for q in rows]);p=predict(model,X);scores[name]=T.metrics(ys,p)
  for q,prob in zip(rows,p):checks.append({'model':name,'setup':q['setup'],'index':q['index'],'arm':q['toggle'],'observedHit':q['target'],'prediction':float(prob)})
 best=ret['bestActionCandidateOnValidation'];ope=T.compare_policies(rows,models[best],models,predict,bootstrap_seed=35062026,replicates=5000)
 groups=[]
 for c in read(O/'FROZEN-DESIGN.json')['cases']:
  a=read(O/'matches'/(c['id']+'.result.json'))['aggregate'];groups.append({'setup':c['setupId'],'gun':c['gun'],'arm':c['arm'],'kills':a['kills'],'deaths':a['deaths'],'shots':a['shots'],'hits':a['hits']})
 rng=np.random.default_rng(35072026);by={s:{x['arm']:x for x in groups if x['setup']==s} for s in sorted({v['setup'] for v in groups})};keys=list(by)
 def r(k,metric):return sum(by[s]['randomized'][metric] for s in k)/max(1,sum(by[s]['observe'][metric] for s in k))
 bootstrap=[r(rng.choice(keys,size=len(keys),replace=True),'kills') for _ in range(5000)]
 result={'schema':'fpsarena-c35ae-new-seed-ads-evaluation-v1','prospectiveRegistrationSHA256':T.sha(O/'FROZEN-DESIGN.json'),
  'frozenModelsSHA256':T.sha(A/'FROZEN-ADS-VALUE-MODELS.json'),'newUnseenSetups':len(keys),'completedFactualOffers':len(rows),
  'initialADSOffers':sum(q['base'][0]==1 for q in rows),'initialHipOffers':sum(q['base'][0]==0 for q in rows),
  'modelMetrics':scores,'actionModelChosenByHistoricalValidation':best,'policyIPS':ope,
  'matchedTDM':{'byArm':audit['byArm'],'killRatioRandomizedObserve':r(keys,'kills'),'killRatioSetupCI95':[float(v) for v in np.quantile(bootstrap,[.025,.975])]},
  'decision':'NOT_PROMOTED','reason':'No independent whole-match policy improvement: only existing randomized ADS controller was evaluated; neural model made ZERO actual gameplay decisions; OPE is eligible-only, not a production validation.',
  'limitations':['12 independent setup clusters in prospective holdout','selected ADS action differs only on non-firing 0.28-second window','off-policy IPS cluster CI exploratory','never treat unselected outcomes as labels','potential interference across offers and trajectory divergence']}
 dump(O/'PROSPECTIVE-MODEL-EVALUATION.json',result);dump(O/'FROZEN-MODEL-PREDICTIONS.json',checks)
 with (O/'MATCHED-RESULTS.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=['setup','gun','arm','kills','deaths','shots','hits']);w.writeheader();w.writerows(groups)
 print(json.dumps(result,indent=2))
if __name__=='__main__':main()
