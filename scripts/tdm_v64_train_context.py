#!/usr/bin/env python3
"""V64 exploratory public-context action critic; seed-group LOOCV.
No holdout access. Four arms from same simulator prestate form ONE group.
Model design uses prespecified Ridge alpha 48 and compares simple baselines.
"""
from __future__ import annotations
import hashlib,json,sys
from pathlib import Path
import numpy as np
from sklearn.linear_model import Ridge
from tdm_v62_train_shadow import public_vector,ARMS
import tdm_v64_protocol as protocol

ROOT=protocol.ROOT
DATA=protocol.DATA
REG=protocol.REG
AUD=protocol.AUD
MODEL=ROOT/"research"/"tdm-v64-public-context-shadow-model.json"
EVAL=ROOT/"research"/"tdm-v64-public-context-evaluation.json"
PRED=DATA/"tdm-v64-group-predictions.json"
ALPHA=48
SEED=640064
INTERACTIONS=[0,3,4,8,9]  # baseline distance, hostiles, alignment, cover, team support, after extension
VARIANTS=("constant","old-state","old-action","context-state","context-action")

def check(cond,msg):
 if not cond:raise ValueError(msg)
def features(ctx):
 check(ctx.get("valid") is True and ctx.get("noPrivateServerInput") is True,"PRIVILEGED_OR_MISSING_CONTEXT")
 def cap(value,lim):
  if not isinstance(value,(int,float)) or not np.isfinite(value):return 0.
  return max(0,min(lim,float(value)))/lim
 return [
   float(ctx["los3DClear"]),
   float(ctx["coverFootprint"]),
   cap(ctx["interveningCoverCount"],6),
   cap(ctx["nearbyCoverDistance"],40),
   cap(ctx["teammatesNearby20m"],3),
   cap(ctx["teammatesSupportingTarget25m"],3),
   cap(ctx["visibleEnemies"],6),
   cap(ctx["snapshotAge"],.275),
   float(ctx["validMotion"]),
   float(np.clip(ctx["radialSpeed"]/12.5,-1,1)),
   float(np.clip(ctx["lateralSpeed"]/12.5,-1,1)),
   cap(ctx["motionSpeed"],12.5)
 ]
def dataset():
 r=protocol.verify()
 a=json.loads(AUD.read_text("utf-8"))
 check(a["allPass"] and a["registrySHA256"]==protocol.sha(REG),"AUDIT_OR_REGISTRY_FAILED")
 check(a["completeGroups"]==12,"NOT_ALL_DISCOVERY_GROUPS_AUDITED")
 cases={v["id"]:v for v in r["cases"] if v["split"]=="discovery"}
 groups=[]; skipped=[]
 for group in a["groups"]:
  if group["trigger"] is None:
   skipped.append(group["id"]);continue
  case=cases[group["id"]]; rows=[]
  for arm in ARMS:
   p=protocol.path(case,arm)
   check(protocol.sha(p)==group["arms"][arm]["sha256"],"RAW_SHA_CHANGED")
   v=json.loads(p.read_text("utf-8"))["results"][0]["tdmV64"]
   check(v["complete"] and v["contextCapturedBeforeIntervention"],"CENSORED_LABEL")
   ctx=v["contextV64"]
   old=public_vector(case,v["triggerPublicFeatures"])
   new=features(ctx)
   out=v["outcome"]
   rows.append({"group":case["id"],"arm":arm,"old":old,"new":new,
    "utility":float(out["kills"]-2*out["deaths"]-out["damageTaken"]/75),
    "hazard":float(out["damageTaken"]>0 or out["deaths"]>0)})
  check(len({tuple(r["old"]+r["new"]) for r in rows})==1,"FEATURES_DIFFER_ACROSS_ARMS")
  groups.append(rows)
 check(len(groups)>0,"NO_TRIGGERED_GROUPS")
 return groups,skipped

def inputs(groups,variant):
 x=[];utility=[];hazard=[]
 for group in groups:
  for row in group:
   old=row["old"]
   new=row["new"]
   state=old+new if variant.startswith("context") else old
   if variant in ("old-action","context-action"):
    arm=[float(row["arm"]==a) for a in ARMS]
    # Small fixed interaction block, reducing overfitting on correlated arms.
    interaction=[v*arm[i] for i in range(4) for v in [
      state[0],state[3],state[4],state[-12] if variant=="context-action" else 0
    ]]
    x.append(state+arm+interaction)
   else:x.append(state)
   utility.append(row["utility"]);hazard.append(row["hazard"])
 return (np.asarray(x,dtype=np.float64),
         np.asarray(utility,dtype=np.float64),
         np.asarray(hazard,dtype=np.float64))
def fit_predict(train,test,variant):
 if variant=="constant":
  _,u,h=inputs(train,variant)
  return [float(u.mean())]*4,[float(h.mean())]*4,None
 x,y,h=inputs(train,variant)
 z,_,_=inputs(test,variant)
 mu=x.mean(axis=0);std=x.std(axis=0)
 std=np.where(std>=.075,std,1.)
 x=np.clip((x-mu)/std,-3,3)
 z=np.clip((z-mu)/std,-3,3)
 reg_u=Ridge(alpha=ALPHA).fit(x,y)
 reg_h=Ridge(alpha=ALPHA).fit(x,h)
 pu=reg_u.predict(z).tolist()
 ph=np.clip(reg_h.predict(z),.001,.999).tolist()
 # Can be serialized into JS in a later research pass; never connected to actor.
 weights={"mu":mu.tolist(),"std":std.tolist(),
  "utility":{"intercept":float(reg_u.intercept_),"weights":reg_u.coef_.tolist()},
  "hazard":{"intercept":float(reg_h.intercept_),"weights":reg_h.coef_.tolist()}}
 return pu,ph,weights

def metrics(groups):
 output={v:[] for v in VARIANTS}
 predictions={}
 for i,group in enumerate(groups):
  train=[g for j,g in enumerate(groups) if j!=i]
  for variant in VARIANTS:
   pu,ph,_=fit_predict(train,[group],variant)
   y=np.asarray([r["utility"] for r in group])
   h=np.asarray([r["hazard"] for r in group])
   mse=float(np.mean(np.square(y-np.asarray(pu))))
   brier=float(np.mean(np.square(h-np.asarray(ph))))
   selected=int(np.argmax(np.asarray(pu)-2*np.maximum(0,np.asarray(ph)-ph[0])))
   chosen=selected if pu[selected]>=pu[0]+.15 and ph[selected]<=ph[0]+.025 else 0
   output[variant].append({"group":group[0]["group"],"utilityMSE":mse,
    "hazardBrier":brier,"armChosen":ARMS[chosen],
    "observedUtilityGain":float(y[chosen]-y[0]),
    "observedHazardChange":float(h[chosen]-h[0])})
 def average(values,key):return float(np.mean([v[key] for v in values]))
 results={v:{
  "utilityMSE":average(rows,"utilityMSE"),
  "hazardBrier":average(rows,"hazardBrier"),
  "selectedNonKeep":sum(x["armChosen"]!="keep" for x in rows),
  "observedPolicyGainVsKeep":average(rows,"observedUtilityGain"),
  "observedPolicyHazardDifference":average(rows,"observedHazardChange"),
  } for v,rows in output.items()}
 rng=np.random.default_rng(SEED)
 ci={}
 for metric in ("utilityMSE","hazardBrier"):
  old=output["old-action"];ext=output["context-action"];constant=output["constant"]
  def test(ref):
   deltas=np.asarray([ref[i][metric]-ext[i][metric] for i in range(len(ext))])
   bs=np.asarray([rng.choice(deltas,len(deltas),replace=True).mean() for _ in range(10000)])
   return {"meanImprovement":float(deltas.mean()),"CI95":np.quantile(bs,[.025,.975]).tolist()}
  ci[metric]={"overOldAction":test(old),"overConstant":test(constant)}
 return results,ci,output

def main():
 groups,skipped=dataset()
 result,ci,preds=metrics(groups)
 full_model={}
 for variant in VARIANTS:
  if variant=="constant":
   full_model[variant]={"utilityMean":float(np.mean([r["utility"] for g in groups for r in g])),
    "hazardMean":float(np.mean([r["hazard"] for g in groups for r in g]))}
  else:
   full_model[variant]=fit_predict(groups,[groups[0]],variant)[2]
 # Strict benchmark: positive CI lower bound on utility and hazard over both baselines.
 accept=all(ci[m][base]["CI95"][0]>0 for m in ci for base in ("overOldAction","overConstant"))
 reg_sha=protocol.sha(REG)
 doc={"schema":"fpsarena-v64-public-tactics-ridge-shadow-v1",
  "parent":"C35AJ simulator, public client only",
  "fitGroups":len(groups),"sampleCount":len(groups)*4,
  "featureCount":{"old":len(groups[0][0]["old"]),"additionalPublic":12},
  "arms":list(ARMS),
  "alpha":ALPHA,"model":{"variants":full_model},
  "trainingSeeds":[g[0]["group"] for g in groups],
  "registrySHA256":reg_sha,"productionUse":False,"noPromotion":True}
 report={"schema":"fpsarena-v64-public-tactics-seed-loocv-v1",
  "groupCount":len(groups),"sampleCount":4*len(groups),"notTriggered":skipped,
  "positiveHazardArms":sum(r["hazard"]>0 for g in groups for r in g),
  "models":result,"pairedSeedBootstrap":ci,
  "actionContextStrictModelGatePassed":accept,"promotionAllowed":False,
  "limitations":["No full-match policy trial","tiny independent set; outcomes may share RNG",
    "only a feature acquisition study, not neural policy","no hyperparameter selection on holdouts",
    "Ridge is linear, not a new trained MLP"]}
 MODEL.write_text(json.dumps(doc,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 EVAL.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 PRED.write_text(json.dumps(preds,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"groups":len(groups),"positiveHazardArms":report["positiveHazardArms"],
  "models":result,"CI":ci,"strictModelGatePassed":accept},sort_keys=True,indent=2))
if __name__=="__main__":main()
