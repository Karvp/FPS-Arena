#!/usr/bin/env python3
"""V63 research-only preregularized arm-contrast shrinkage model.

Unlike v62 MLP, this model learns differences among all four actual arms
from SAME prestate. Fixed hyperparameters are source-frozen prior to any V63
prospective runs; historical v61/v62 CV is explicitly retrospective.
"""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
import numpy as np
from sklearn.linear_model import Ridge
from tdm_v62_train_shadow import dataset, ROOT, ARMS, SEED as PARENT_SEED

OUT=ROOT/"research"
MODEL=OUT/"tdm-v63-contrast-model.json"
HIST=OUT/"tdm-v63-retrospective-evaluation.json"
DETAIL=ROOT/"data"/"v63"/"v63-retrospective-folds.json"
DETAIL.parent.mkdir(parents=True,exist_ok=True)
SEED=20261023
STATE_ALPHA=48.0
ARM_ALPHA=24.0
ARM_INTERACTION_ALPHA=48.0
DECISION_MIN_GAIN=.15
DECISION_MAX_RISK_INCREASE=.025
BOOTSTRAP=12000
# In v62 public_vector indices: 0 distance 1 HP 2 range 3 hostiles
# 4 aimAlignment 5 fire age 6 damage age 7 aimTicks
# 8-10 map 11-14 weapon 15-17 cue; no server or future input.
INTERACTION_INDEX=(0,1,3,4,5,7,8,9,10,11,12,13,14,15,16,17)
MEAN_DEFAULT_INDEX=tuple(range(18))
SOURCE_DESIGN_FIXED_BEFORE_V63_RESULTS=True

def sha(p):
 return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def require(c,msg):
 if not c:raise ValueError(msg)
def flat(groups):
 arr=np.asarray([[r["utility"] for r in g] for g in groups],dtype=np.float64)
 haz=np.asarray([[r["hazard"] for r in g] for g in groups],dtype=np.float64)
 x=np.asarray([g[0]["state"] for g in groups],dtype=np.float64)
 ids=[g[0]["group"] for g in groups]
 for g in groups:
  require([r["arm"] for r in g]==list(ARMS),"ACTION_ORDER_CHANGED")
 return x,arr,haz,ids

def x_normalize(x,reference):
 mu=np.mean(reference,axis=0)
 scale=np.std(reference,axis=0)
 scale=np.where(scale>=.075,scale,1)
 return np.clip((x-mu)/scale,-3,3),mu,scale

def phi(state_z,include_interactions):
 raw=state_z[:,INTERACTION_INDEX] if include_interactions else np.empty((len(state_z),0))
 cov=np.concatenate([np.ones((len(state_z),1)),raw],axis=1)
 a=np.eye(4)-.25
 return np.asarray([[(a[j,:,None]*cov[i][None,:]).ravel() for j in range(4)]
         for i in range(len(state_z))],dtype=np.float64)

def fit_part(x,y,inc):
 zx,mu,sd=x_normalize(x,x)
 alpha=ARM_INTERACTION_ALPHA if inc else ARM_ALPHA
 base=Ridge(alpha=STATE_ALPHA,fit_intercept=True).fit(zx,y.mean(axis=1))
 contrasts=y-y.mean(axis=1,keepdims=True)
 xx=phi(zx,inc).reshape(len(x)*4,-1)
 target=contrasts.ravel()
 effect=Ridge(alpha=alpha,fit_intercept=False).fit(xx,target)
 return {"stateIntercept":float(base.intercept_),"stateCoefficients":base.coef_.tolist(),
  "armEffectsCoefficients":effect.coef_.tolist(),
  "stateMu":mu.tolist(),"stateScale":sd.tolist(),
  "interaction":bool(inc),"stateAlpha":STATE_ALPHA,
  "armAlpha":alpha}

def predict_part(f,x):
 z=np.clip((x-np.asarray(f["stateMu"]))/np.asarray(f["stateScale"]),-3,3)
 base=float(f["stateIntercept"])+z@np.asarray(f["stateCoefficients"])
 d=phi(z,f["interaction"]).reshape(len(z)*4,-1)@np.asarray(f["armEffectsCoefficients"])
 return base[:,None]+d.reshape(len(z),4)

def fitted(groups,variant):
 x,u,h,_=flat(groups)
 if variant=="constant":
  return {"variant":variant,"utility":float(u.mean()),"hazard":float(h.mean())}
 if variant=="state":
  z,mu,sc=x_normalize(x,x)
  models=[]
  for target in (u.mean(axis=1),h.mean(axis=1)):
   model=Ridge(alpha=STATE_ALPHA).fit(z,target)
   models.append({"intercept":float(model.intercept_),"coef":model.coef_.tolist()})
  return {"variant":variant,"mu":mu.tolist(),"scale":sc.tolist(),"models":models}
 if variant in ("armOnly","armContext"):
  return {"variant":variant,"utility":fit_part(x,u,variant=="armContext"),
   "hazard":fit_part(x,h,variant=="armContext")}
 raise ValueError("UNKNOWN_MODEL")

def predict(model,group):
 x,u,h,_=flat([group])
 if model["variant"]=="constant":
  pu=np.full((1,4),model["utility"])
  ph=np.full((1,4),model["hazard"])
 elif model["variant"]=="state":
  z=np.clip((x-np.asarray(model["mu"]))/np.asarray(model["scale"]),-3,3)
  pu=np.tile(model["models"][0]["intercept"]+z@np.asarray(model["models"][0]["coef"]),(4,1)).T
  ph=np.tile(model["models"][1]["intercept"]+z@np.asarray(model["models"][1]["coef"]),(4,1)).T
 else:
  pu=predict_part(model["utility"],x)
  ph=predict_part(model["hazard"],x)
 return pu.ravel().tolist(),np.clip(ph.ravel(),.001,.999).tolist()

def decision(u,h):
 if len(u)!=4 or len(h)!=4:raise ValueError("FOUR_ARMS_REQUIRED")
 keep_idx=ARMS.index("keep")
 allowed=[keep_idx]
 for i,arm in enumerate(ARMS):
  if i!=keep_idx and (u[i]-u[keep_idx]>=DECISION_MIN_GAIN
                      and h[i]<=h[keep_idx]+DECISION_MAX_RISK_INCREASE):
   allowed.append(i)
 best=max(allowed,key=lambda i:(u[i],-h[i],-i))
 return ARMS[best]

def evaluate(groups,variant):
 predicted=[];observed=[]
 for i,group in enumerate(groups):
  m=fitted([g for j,g in enumerate(groups) if j!=i],variant)
  u,h=predict(m,group)
  idx=ARMS.index(decision(u,h))
  truth=[r["utility"] for r in group]
  hazard=[r["hazard"] for r in group]
  predicted.append({"group":group[0]["group"],"predictedUtility":u,"predictedHazard":h,
        "chosenArm":ARMS[idx],
        "predictedGainVsKeep":float(u[idx]-u[0]),
        "chosenTrueUtility":float(truth[idx]),
        "keepTrueUtility":float(truth[0]),
        "chosenTrueHazard":float(hazard[idx]),
        "keepTrueHazard":float(hazard[0]),
        "actualRegretBestArm":float(max(truth)-truth[idx]),
        "actualUtilityGainVsKeep":float(truth[idx]-truth[0]),
        "actualHazardDifference":float(hazard[idx]-hazard[0])})
  observed.append((truth,hazard))
 utilities=np.asarray([t for t,_ in observed]);hazards=np.asarray([h for _,h in observed])
 pu=np.asarray([p["predictedUtility"] for p in predicted])
 ph=np.asarray([p["predictedHazard"] for p in predicted])
 per_group_mse=np.square(utilities-pu).mean(axis=1)
 per_group_brier=np.square(hazards-ph).mean(axis=1)
 per_group_regret=np.asarray([p["actualRegretBestArm"] for p in predicted])
 gains=np.asarray([p["actualUtilityGainVsKeep"] for p in predicted])
 hazard_delta=np.asarray([p["actualHazardDifference"] for p in predicted])
 return {"variant":variant,"groupCount":len(groups),"sampleCount":len(groups)*4,
   "utilityMSE":float(per_group_mse.mean()),"hazardBrier":float(per_group_brier.mean()),
   "meanBestArmRegret":float(per_group_regret.mean()),
   "meanObservedGainVsKeep":float(gains.mean()),
   "meanObservedHazardChangeVsKeep":float(hazard_delta.mean()),
   "proposedNonKeepCount":sum(p["chosenArm"]!="keep" for p in predicted),
   "perGroup":predicted,"groupMSE":per_group_mse.tolist(),
   "groupBrier":per_group_brier.tolist()}

def boot(groupwise):
 x=np.asarray(groupwise,dtype=np.float64)
 rng=np.random.default_rng(SEED)
 samples=np.asarray([rng.choice(x,len(x),replace=True).mean() for _ in range(BOOTSTRAP)])
 return {"mean":float(x.mean()),"CI95":[float(z) for z in np.quantile(samples,[.025,.975])]}

def main():
 groups,a61,a62=dataset()
 variants=("constant","state","armOnly","armContext")
 scores={v:evaluate(groups,v) for v in variants}
 comparisons={}
 for baseline in ("constant","state","armOnly"):
  comparisons[baseline]={
   "utilityMSE":boot(np.asarray(scores[baseline]["groupMSE"])-np.asarray(scores["armContext"]["groupMSE"])),
   "hazardBrier":boot(np.asarray(scores[baseline]["groupBrier"])-np.asarray(scores["armContext"]["groupBrier"]))}
 # all training fit done before prospective group evaluation.
 models={v:fitted(groups,v) for v in variants}
 x,u,h,ids=flat(groups)
 fitReport={"schema":"fpsarena-v63-public-contrastive-shrinkage-v1",
  "baseline":"C35AJ simulator", "modelRole":"shadow candidate, not production",
  "frozenSources":{"v61":sha(ROOT/"research"/"tdm-v61-frozen-registry.json"),
                   "v62":sha(ROOT/"research"/"tdm-v62-frozen-registry.json")},
  "fitGroupCount":len(groups),"fitArmSamples":len(groups)*4,
  "features":"public v62 vector 18 features + arm assignment one-hot, group-centering",
  "arms":list(ARMS),"fixedHyperparameters":{"stateRidgeAlpha":STATE_ALPHA,
      "armOnlyAlpha":ARM_ALPHA,"armContextAlpha":ARM_INTERACTION_ALPHA,
      "interactionIndices":list(INTERACTION_INDEX),
      "minPredictedUtilityGain":DECISION_MIN_GAIN,
      "maxPredictedHazardIncrease":DECISION_MAX_RISK_INCREASE},
  "modelVariants":models,
  "policyPromotionAllowed":False,
  "researchOnly":True,
  "note":"All arm outcomes from same starting seed branch; future RNG may diverge and this is not production causal validation."}
 evalReport={"schema":"fpsarena-v63-retrospective-seed-group-loocv-v1",
  "modelSha256":"filled-after-write",
  "evaluationMethod":"leave-one-entire-seed-group-out; four paired arms",
  "exploratoryHistoricalData":True,"neverTuneProspectiveOnHistoricalHoldouts":True,
  "models":{v:{k:value for k,value in s.items() if k not in ("perGroup","groupMSE","groupBrier")} for v,s in scores.items()},
  "groupBootstrapComparisonsOfArmContext":comparisons,
  "automaticPromotion":False,
  "priorV62MLP":json.loads((ROOT/"research"/"tdm-v62-shadow-evaluation.json").read_text(encoding="utf-8"))["metrics"]}
 MODEL.write_text(json.dumps(fitReport,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 evalReport["modelSha256"]=sha(MODEL)
 HIST.write_text(json.dumps(evalReport,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 DETAIL.write_text(json.dumps({"byVariant":scores},sort_keys=True,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"groups":len(groups),
     "models":evalReport["models"],
     "improvementVsConstant":comparisons["constant"],
     "improvementVsState":comparisons["state"],
     "frozenModelSha256":evalReport["modelSha256"]},indent=2))
if __name__=="__main__":
 main()
