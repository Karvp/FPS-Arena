#!/usr/bin/env python3
"""C33-A/B: frozen-policy evaluation. Opens sealed holdout AFTER freeze only."""
import hashlib,json,math
from pathlib import Path
import numpy as np
from importlib.machinery import SourceFileLoader
ROOT=Path(__file__).resolve().parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ACTIONS=('baseline','micro-left','micro-right')
TRAIN=SourceFileLoader('c33_train',str(ROOT/'scripts/train-c33-map.py')).load_module()
TRAIN_B=SourceFileLoader('c33_train_b',str(ROOT/'scripts/train-c33-refined.py')).load_module()

def neural(weights,x):
 for layer in (0,2,4):
  ww=np.array(weights[f'net.{layer}.weight'],dtype=np.float64)
  bb=np.array(weights[f'net.{layer}.bias'],dtype=np.float64)
  x=x@ww.T+bb
  x=np.tanh(x) if layer in (0,2) else 1/(1+np.exp(-np.clip(x,-60,60)))
 return np.argmin(x,axis=1)

def run(group,trainer):
 d=ROOT/'reports/c33'/group
 plan=json.loads((d/'PRE-REGISTERED-PLAN.json').read_text());index=json.loads((d/'INDEX.json').read_text())
 frozen=json.loads((d/'FROZEN-MODEL.json').read_text())
 assert index['registrationSHA256']==plan['registrationSHA256']==frozen['registrationSHA256']
 assert sha(d/'DEVELOPMENT.json')==index['developmentSHA256']==frozen['developmentSHA256']
 assert sha(d/'SEALED-HOLDOUT.json')==index['sealedTestSHA256']==frozen['sealedTestSHA256']
 assert sha(d/'MODEL-SELECTION-PLAN.json')==frozen['modelSelectionPlanSHA256']
 assert not frozen['neuralEligibleForFullMatch'] and not frozen['productionAuthorized']
 data=json.loads((d/'SEALED-HOLDOUT.json').read_text())
 rows=data['rows'];assert len(rows)==648 and data['registrationSHA256']==plan['registrationSHA256']
 seeds={r['scenario']['seed'] for r in rows};assert len(seeds)==648
 assert not seeds.intersection({r['scenario']['seed'] for r in json.loads((d/'DEVELOPMENT.json').read_text())['rows']})
 assert all(r['split']=='test' and len(r['publicFeatures'])==len(frozen['features']) and tuple(a['action'] for a in r['arms'])==ACTIONS for r in rows)
 simple=trainer.policies(rows)
 candidates={**simple}
 for name,w in frozen['candidateWeights'].items(): candidates[name]=neural(w,trainer.features(rows).astype(float))
 assert frozen['selected'] in candidates and frozen['selectedBestNeural'] in candidates
 scores={k:trainer.evaluate(rows,pred) for k,pred in candidates.items()}
 Y=trainer.targets(rows)
 series={k:Y[np.arange(len(rows)),pred] for k,pred in candidates.items()}
 selected=frozen['selected'];neural_name=frozen['selectedBestNeural']
 rng=np.random.default_rng(337733)
 boot_idx=rng.integers(0,len(rows),size=(4000,len(rows)))
 paired={}
 for other in ['baseline','always-left','always-right',neural_name]:
  diff=series[other]-series[selected]
  ci=np.quantile(diff[boot_idx].mean(1),[.025,.975])
  paired[f'{selected}-vs-{other}']={'meanImprovement':float(diff.mean()),'clusterBootstrap95':ci.tolist(),
   'unit':'independently seeded scenario, paired three action arms'}
 strata={}
 for attr in ('map','weaponId'):
  strata[attr]={}
  for v in sorted({r['scenario'][attr] for r in rows}):
   ids=np.array([i for i,r in enumerate(rows) if r['scenario'][attr]==v],dtype=int)
   strata[attr][v]={'n':len(ids),'selectedMean':float(series[selected][ids].mean()),
    'bestNeuralMean':float(series[neural_name][ids].mean()),
    'actionSensitiveCount':int(np.sum(Y[ids].ptp(axis=1)>0)) if hasattr(Y[ids],'ptp') else int(np.sum(np.ptp(Y[ids],axis=1)>0)),
    'anyCollision':sum(any(a['blockedTicks']>0 for a in rows[i]['arms']) for i in ids)}
 obj={'schema':'fpsarena-c33-frozen-map-holdout-evaluation-v1','cohort':group,
 'registrationSHA256':plan['registrationSHA256'],'developmentSHA256':index['developmentSHA256'],
 'frozenSHA256':sha(d/'FROZEN-MODEL.json'),'sealedHoldoutSHA256':index['sealedTestSHA256'],
 'selectionLockedBeforeTest':selected,'bestNeuralLockedBeforeTest':neural_name,
 'neuralGateAtValidation':frozen['neuralEligibleForFullMatch'],
 'scores':scores,'pairedBootstrap':paired,'strata':strata,
 'holdoutWasNeverUsedForSelection':True,'neuralProductionPromotion':False,
 'importantLimits':['synthetic 1v1 on real static map boxes','not a real saved Game.step encounter',
  'shooter tracking is synthetic','pre-action collision probes may be computationally expensive in browser',
  'per-seed bootstrap ignores shared map feature correlations']}
 (d/'SEALED-EVALUATION.json').write_text(json.dumps(obj,indent=2)+'\n')
 return {'cohort':group,'selected':selected,'bestNeural':neural_name,
  'testScores':{name:{'damage':round(scores[name]['meanLoss'],4),'regret':round(scores[name]['meanRegret'],4),
  'actionCounts':scores[name]['counts']} for name in ['baseline','always-left','always-right',selected,neural_name]},
  'pairedBootstrap':paired,'frozenSHA256':obj['frozenSHA256']}
if __name__=='__main__':
 a=run('map-cohort',TRAIN);b=run('refined-cohort',TRAIN_B)
 aa=json.loads((ROOT/'reports/c33/map-cohort/PRE-REGISTERED-PLAN.json').read_text())
 bb=json.loads((ROOT/'reports/c33/refined-cohort/PRE-REGISTERED-PLAN.json').read_text())
 assert not {r['scenario']['seed'] for r in aa['rows']}.intersection({r['scenario']['seed'] for r in bb['rows']})
 print(json.dumps([a,b],indent=2))
