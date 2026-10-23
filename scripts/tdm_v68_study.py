#!/usr/bin/env python3
"""V68 immutable preregistration, source freeze and natural TDM 4-arm replay.

Calibration seed 441109 excluded. Never reads/runs sealed holdouts. Audit and
evaluation are separate from action code. No research policy promotion.
"""
from __future__ import annotations
import concurrent.futures, hashlib, json, subprocess, sys
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"/"v68"
DATA.mkdir(parents=True,exist_ok=True)
REG=ROOT/"research"/"tdm-v68-risk-frozen-registry.json"
AUD=ROOT/"research"/"tdm-v68-risk-independent-audit.json"
EVAL=ROOT/"research"/"tdm-v68-risk-fullmatch-evaluation.json"
ARMS=("keep","route","guarded-route","guarded-flank")
DISCOVERY=[
 {"id":f"v68-n-aa12-{i:02d}","seed":680100+i,"map":"neon","weapon":"aa12","split":"discovery"} for i in range(1,7)]
DISCOVERY += [
 {"id":"v68-a-aa12-07","seed":680107,"map":"arena","weapon":"aa12","split":"discovery"},
 {"id":"v68-a-aa12-08","seed":680108,"map":"arena","weapon":"aa12","split":"discovery"},
 {"id":"v68-f-aa12-09","seed":680109,"map":"foundry","weapon":"aa12","split":"discovery"},
 {"id":"v68-f-aa12-10","seed":680110,"map":"foundry","weapon":"aa12","split":"discovery"},
 {"id":"v68-n-m4a1-11","seed":680111,"map":"neon","weapon":"m4a1","split":"discovery"},
 {"id":"v68-n-m4a1-12","seed":680112,"map":"neon","weapon":"m4a1","split":"discovery"}]
HOLDOUT=[
 {"id":"v68-hold-neon-aa12-13","seed":680113,"map":"neon","weapon":"aa12","split":"holdout"},
 {"id":"v68-hold-arena-aa12-14","seed":680114,"map":"arena","weapon":"aa12","split":"holdout"},
 {"id":"v68-hold-foundry-aa12-15","seed":680115,"map":"foundry","weapon":"aa12","split":"holdout"}]
CASES=DISCOVERY+HOLDOUT
SOURCES=[
 "scripts/tdm_v68_study.py",
 "lab/arena/train-main-v68.mjs",
 "lab/arena/tdm-exposure-guard-v68.mjs",
 "lab/arena/tdm-public-acquisition-v67.mjs",
 "lab/arena/tdm-stratified-replay-v60.mjs",
 "lab/arena/tdm-engagement-trigger-v61.mjs",
 "lab/arena/tdm-context-trial-v64.mjs",
 "lab/arena/public-target-los-c35k.mjs",
 "lab/arena/source-main/shared/weapons.js",
 "lab/arena/source-main/shared/geometry.js",
 "lab/arena/source-main/server/game.js",
 "lab/arena/source-main/server/bot.js",
 "page-agent.js"]
PARENTS=[
 "tdm-v60-frozen-registry.json",
 "tdm-v61-frozen-registry.json",
 "tdm-v62-frozen-registry.json",
 "tdm-v63-prospective-registry.json",
 "tdm-v64-frozen-registry.json",
 "tdm-v65-fullmatch-frozen-registry.json",
 "tdm-v66-natural-frozen-registry.json",
 "tdm-v67-acquisition-frozen-registry.json"]
def sha(p):
 h=hashlib.sha256()
 with Path(p).open("rb") as f:
  for x in iter(lambda:f.read(1<<20),b""):h.update(x)
 return h.hexdigest()
def require(c,msg):
 if not c:raise ValueError(msg)
def freeze():
 require(not REG.exists(),"REGISTRY_ALREADY_FROZEN")
 used=[]
 for file in PARENTS:
  obj=json.loads((ROOT/"research"/file).read_text("utf-8"))
  used.extend(x["seed"] for x in obj.get("cases",obj.get("allCases",[])))
 new=[c["seed"] for c in CASES]
 require(len(set([*used,*new]))==len(used)+len(new),"SEED_REUSE")
 doc={
  "schema":"fpsarena-v68-predeclared-public-risk-guard-four-arm-v1",
  "parent":"C35AJ, research-v67-public-acquisition",
  "sourceSHA256":{name:sha(ROOT/name) for name in SOURCES},
  "priorRegistrySHA256":{name:sha(ROOT/"research"/name) for name in PARENTS},
  "cases":CASES,"arms":list(ARMS),
  "simulation":{"fullMatch":True,"secondsCap":600,"bots":8,
    "lagMs":45,"opponents":"official","mode":"tdm","teamKillTarget":50},
  "actor":{"trigger":"V67 unchanged public far-range target trigger",
    "navigation":"V67 unchanged bounded grid A-star",
    "guardPolicy":"V68 public static 3D LOS + public hostile counts + fresh ally support + own HP",
    "maxInterventionTicks":1050,
    "maxActualChangedTicksGuarded":520,
    "highRiskResponse":"neutralize WASD, leave fire/aim/ADS/reload/skills unchanged",
    "targetFeatureTiming":"public client before Game.step only",
    "privateServerInput":False},
  "statisticalUnit":"independent four-arm matched seed group",
  "primarySafety":["deaths","damageTaken"],
  "primaryUtility":["fullMatchNetKills"],
  "secondaryAcquisition":["shots","hits","kills","guardedTicks","routePlans"],
  "comparisons":[["route","keep"],["guarded-route","keep"],["guarded-flank","keep"],
     ["guarded-route","route"],["guarded-flank","route"]],
  "bootstrap":{"samples":15000,"seed":680068,"unit":"matched group"},
  "promotionGate":{"minimum12MatchedNaturalGroups":True,
    "netKillsDeltaLower95StrictPositiveVsKeep":True,
    "deathsDeltaUpper95NonPositiveVsKeep":True,
    "damageDeltaUpper95NonPositiveVsKeep":True,
    "prospectiveUnopenedHoldoutsAndRepresentativeOpponents":True},
  "promotionNeverAutomatic":True,"researchOnly":True,
  "calibrationSeed441109Excluded":True,
  "holdoutRunsForbidden":True,
  "censoring":"any 600s capped match retained but excluded from natural matched effects",
  "limitations":["official bot opponents, not humans","post-branch RNG can diverge",
    "natural matches vary in duration","neutralizing WASD is no guarantee of survival",
    "public geometric LOS approximates actual combat visibility"]}
 REG.parent.mkdir(parents=True,exist_ok=True)
 REG.write_text(json.dumps(doc,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 return doc
def verify():
 doc=json.loads(REG.read_text("utf-8"))
 require(doc["cases"]==CASES and doc["arms"]==list(ARMS),"REGISTRY_CASE_CHANGE")
 for file,digest in doc["sourceSHA256"].items():
  require(sha(ROOT/file)==digest,"SOURCE_HASH_CHANGE:"+file)
 for file,digest in doc["priorRegistrySHA256"].items():
  require(sha(ROOT/"research"/file)==digest,"PRIOR_REGISTRY_CHANGED:"+file)
 return doc
def path(case,arm):return DATA/(case["id"]+"-"+arm+".json")
def runone(case,arm):
 file=path(case,arm)
 require(not file.exists(),"REFUSE_RESULT_REPLACEMENT:"+str(file))
 args=["node","lab/arena/train-main-v68.mjs","--profile","release","--modes","tdm",
  "--episodes","1","--seconds","600","--full-match","--seed",str(case["seed"]),
  "--classic-maps",case["map"],"--bots","8","--opponents","official",
  "--lag-ms","45","--trainee-primary",case["weapon"],"--tdm-v68-arm",arm,
  "--out",str(file)]
 done=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,
   encoding="utf-8",errors="replace",timeout=230)
 (DATA/(case["id"]+"-"+arm+".log")).write_text(done.stdout+"\n"+done.stderr,encoding="utf-8")
 require(done.returncode==0 and file.exists(),
  "RUN_FAILED:"+case["id"]+":"+arm+":"+done.stderr[-250:])
 m=json.loads(file.read_text("utf-8"))["results"][0];v=m["tdmV68"]
 return {"group":case["id"],"arm":arm,"natural":m["finishedNaturally"],
  "kills":m["kills"],"deaths":m["deaths"],"damageTaken":m["damageTaken"],
  "shots":m["shots"],"trigger":v["triggerTick"],"changed":v["changedTicks"],
  "gated":v["gatedTicks"],"riskSamples":v["publicExposureValid"]}
def canon(x):return json.dumps(x,sort_keys=True,separators=(",",":"),allow_nan=False)
def audit_case(case):
 rows=[]
 for arm in ARMS:
  p=path(case,arm)
  if not p.exists():return {"id":case["id"],"status":"MISSING","missing":arm}
  raw=json.loads(p.read_text("utf-8"))
  if raw.get("fullMatch") is not True:return {"id":case["id"],"status":"FAIL","problems":["not-full-match"]}
  m=raw["results"][0];v=m["tdmV68"]
  rows.append((arm,m,v,sha(p)))
 control=rows[0][2];problems=[]
 for arm,m,v,digest in rows:
  for field in ("triggerTick","prestate","prefixSHA256","triggerPublicFeatures","initial"):
   if canon(v.get(field))!=canon(control.get(field)):
    problems.append(arm+" MISMATCH_"+field)
  if m.get("errors")!=0:problems.append(arm+" ERROR")
  if m.get("map")!=case["map"] or m.get("weapon")!=case["weapon"]:
   problems.append(arm+" CONFIG")
  if v.get("schema")!="fpsarena-v68-public-exposure-capped-acquisition-v1":
   problems.append(arm+" SCHEMA")
  if (v.get("productionAllowed") is not False or not v.get("allNonWASDUnchanged") or
     not v.get("noPrivilegedActorInput") or not v.get("onlyMovementModified")):
   problems.append(arm+" INPUT_OR_COMMAND_BOUNDARY")
  if v["changedTicks"]>v["maxChangedTicks"] or v["activeTicks"]>1050:
   problems.append(arm+" MOTOR_LIMIT")
  if arm.startswith("guarded") and v["maxChangedTicks"]!=520:
   problems.append(arm+" GUARD_BUDGET")
  if arm=="keep" and v["changedTicks"]!=0:
   problems.append("KEEP_CHANGED")
  if m["finishedNaturally"]!=(m["termination"]!="match"):
   problems.append(arm+" NATURAL_FLAG")
  if m["finishedNaturally"]:
   score=m["modeState"]["scores"]
   if m["termination"]!="results" or max(score["red"],score["blue"])<50:
    problems.append(arm+" MISSING_SCORE_TERMINATION")
  if m["duration"]>600.25:problems.append(arm+" TIME_GUARD_EXCEEDED")
  if v["triggerTick"] is not None:
   w=v["prestate"];f=v["triggerPublicFeatures"]
   if not w or w["tick"]!=v["triggerTick"] or not isinstance(w["rngState"],int):
    problems.append(arm+" WITNESS")
   if f is None or f.get("noPrivilegedState") is not True or not f.get("valid"):
    problems.append(arm+" PUBLIC_TRIGGER")
   if v["complete"]:
    for key,base in v["initial"].items():
     if v["outcome"][key]!=v["terminal"].get(key,0)-base:
      problems.append(arm+" COUNTER_DELTA_"+key)
 natural=all(m["finishedNaturally"] and m["termination"]=="results" for arm,m,v,d in rows)
 triggered=control["triggerTick"] is not None
 eligible=natural and triggered and all(v["complete"] for arm,m,v,d in rows)
 return {"id":case["id"],"status":"PASS" if not problems else "FAIL",
  "problems":problems,"map":case["map"],"weapon":case["weapon"],
  "trigger":control["triggerTick"],"naturalFour":natural,"eligible":eligible,
  "arms":{arm:{"sha256":digest,"kills":m["kills"],"deaths":m["deaths"],
    "netKills":m["kills"]-m["deaths"],"shots":m["shots"],"hits":m["hits"],
    "damageTaken":m["damageTaken"],"duration":m["duration"],
    "team":m["team"],"scores":m["modeState"]["scores"],
    "natural":m["finishedNaturally"],"changedTicks":v["changedTicks"],
    "guardedTicks":v["gatedTicks"],"safetyStopChanged":v["safetyStopChanged"],
    "riskSamples":v["publicExposureValid"],"routePlans":v["routePlans"],
    "budgetExhaustedTicks":v["budgetExhaustedTicks"]}
   for arm,m,v,digest in rows}}
def audit():
 verify()
 groups=[audit_case(c) for c in DISCOVERY]
 doc={
  "schema":"fpsarena-v68-independent-natural-matched-risk-audit-v1",
  "registrySHA256":sha(REG),"groups":groups,
  "passGroups":sum(g["status"]=="PASS" for g in groups),
  "missingGroups":[g["id"] for g in groups if g["status"]=="MISSING"],
  "failedGroups":[g["id"] for g in groups if g["status"]=="FAIL"],
  "triggeredGroups":sum(g.get("trigger") is not None for g in groups),
  "naturalFourArmGroups":sum(g.get("naturalFour",False) for g in groups),
  "eligibleGroups":sum(g.get("eligible",False) for g in groups),
  "oldAndNewSealedHoldoutsOpened":False,"promotionAllowed":False}
 AUD.write_text(json.dumps(doc,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 return doc
def boot(xs,seed):
 a=np.asarray(xs,dtype=float)
 if len(a)==0:return None
 rng=np.random.default_rng(seed)
 v=np.asarray([rng.choice(a,len(a),replace=True).mean() for _ in range(15000)])
 return {"nGroups":len(a),"mean":float(a.mean()),
  "CI95":np.quantile(v,[.025,.975]).tolist(),"min":float(a.min()),"max":float(a.max())}
def evaluate():
 a=audit()
 require(not a["missingGroups"] and not a["failedGroups"],"CANNOT_SCORE_INCOMPLETE")
 groups=[g for g in a["groups"] if g["eligible"]]
 metrics=("kills","netKills","deaths","damageTaken","shots","hits")
 specs=[("route","keep"),("guarded-route","keep"),("guarded-flank","keep"),
   ("guarded-route","route"),("guarded-flank","route")]
 paired={}
 for i,(arm,baseline) in enumerate(specs):
  paired[arm+"_vs_"+baseline]={
    metric:boot([g["arms"][arm][metric]-g["arms"][baseline][metric] for g in groups],
     680068+32*i+j)
     for j,metric in enumerate(metrics)}
 summary={arm:{
  "meanKills":float(np.mean([g["arms"][arm]["kills"] for g in a["groups"]])),
  "meanDeaths":float(np.mean([g["arms"][arm]["deaths"] for g in a["groups"]])),
  "meanDamageTaken":float(np.mean([g["arms"][arm]["damageTaken"] for g in a["groups"]])),
  "meanShots":float(np.mean([g["arms"][arm]["shots"] for g in a["groups"]])),
  "meanRiskGuardedTicks":float(np.mean([g["arms"][arm]["guardedTicks"] for g in a["groups"]])),
  "meanChangedTicks":float(np.mean([g["arms"][arm]["changedTicks"] for g in a["groups"]])),
  "teamWins":sum(g["arms"][arm]["scores"][g["arms"][arm]["team"]]>=50 for g in a["groups"]),
  "natural":sum(g["arms"][arm]["natural"] for g in a["groups"])
 } for arm in ARMS}
 safety={}
 for arm in ARMS[1:]:
  m=paired[arm+"_vs_keep"]
  safety[arm]=bool(len(groups)>=12 and m["netKills"]["CI95"][0]>0 and
   m["deaths"]["CI95"][1]<=0 and m["damageTaken"]["CI95"][1]<=0)
 report={
  "schema":"fpsarena-v68-predeclared-seed-group-natural-survival-evaluation-v1",
  "registrySHA256":sha(REG),
  "discoveryGroups":len(a["groups"]),"pairedGroups":len(groups),
  "naturalMatchCount":sum(s["natural"] for s in summary.values()),
  "descriptiveArms":summary,"paired":paired,"strictSafetyGate":safety,
  "promotionAllowed":False,"oldAndNewHoldoutsUntouched":True,
  "calibrationSeedExcluded":True,
  "limitations":["bot opponents not representative of human PvP",
    "server dynamics and PRNG diverge after branch treatment",
    "natural finish times are different across arms",
    "guarding LOS with neutral WASD can still result in deaths",
    "12 seed groups not sufficient for broad generalization"]}
 EVAL.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 return report
def main():
 op=sys.argv[1] if len(sys.argv)>1 else "verify"
 if op=="freeze":
  freeze();print("FROZEN",len(CASES),sha(REG))
 elif op=="verify":
  verify();print("VERIFIED",len(CASES),sha(REG))
 elif op=="run":
  verify()
  wanted=set(sys.argv[2:])
  ids={x["id"] for x in DISCOVERY}
  require(not wanted or wanted<=ids,"SEALED_HOLDOUT_OR_UNKNOWN_FORBIDDEN")
  selected=[c for c in DISCOVERY if not wanted or c["id"] in wanted]
  for c in selected:
   for arm in ARMS:require(not path(c,arm).exists(),"DUPLICATE_RAW_OUTPUT:"+c["id"])
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for f in concurrent.futures.as_completed([pool.submit(runone,c,arm) for arm in ARMS]):
     print("RUN",json.dumps(f.result(),sort_keys=True),flush=True)
 elif op=="audit":
  d=audit();print("AUDIT",json.dumps({k:d[k] for k in
   ("passGroups","missingGroups","failedGroups","triggeredGroups","naturalFourArmGroups","eligibleGroups")}))
  if d["failedGroups"]:raise SystemExit(2)
 elif op=="evaluate":
  d=evaluate();print("EVAL",json.dumps({k:d[k] for k in
   ("discoveryGroups","pairedGroups","naturalMatchCount","strictSafetyGate","promotionAllowed")}))
 else:raise SystemExit("freeze | verify | run [discovery IDs] | audit | evaluate")
if __name__=="__main__":main()
