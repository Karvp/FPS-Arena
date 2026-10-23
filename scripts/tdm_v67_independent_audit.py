#!/usr/bin/env python3
"""Independent audit/evaluation for preregistered V67 research.

Purpose: immutable protocol script tdm_v67_acquisition.py has a shadowed local
"result" variable in audit_case, causing UnboundLocalError. Do NOT silently edit
or refreeze that protocol after runs began. Verify its SHA from frozen registry,
then independently verify every arm from raw match JSONs here.
"""
from __future__ import annotations
import json, numpy as np, sys
from pathlib import Path
import tdm_v67_acquisition as frozen

ROOT=frozen.ROOT
OUT=ROOT/"research"
AUD=OUT/"tdm-v67-acquisition-independent-audit.json"
EVAL=OUT/"tdm-v67-acquisition-evaluation.json"
ARMS=tuple(frozen.ARMS)
def assert_(condition,why):
 if not condition:raise ValueError(why)
def literal(x):
 return json.dumps(x,sort_keys=True,separators=(",",":"),allow_nan=False)
def audited_group(case):
 rows=[]
 for arm in ARMS:
  p=frozen.file(case,arm)
  if not p.exists():return {"id":case["id"],"status":"MISSING","reason":"missing-"+arm}
  doc=json.loads(p.read_text(encoding="utf-8"))
  assert_(doc.get("fullMatch") is True,"NOT_FULL_MATCH:"+case["id"])
  assert_(len(doc["results"])==1,"WRONG_EPISODE_COUNT")
  m=doc["results"][0]
  v=m["tdmV67"]
  rows.append((arm,m,v,frozen.sha(p)))
 original=rows[0][2];errors=[]
 for arm,m,v,digest in rows:
  for field in ("triggerTick","prestate","prefixSHA256","triggerPublicFeatures","initial"):
   if literal(v.get(field))!=literal(original.get(field)):
    errors.append(arm+" prefix/prestate "+field)
  if m.get("errors")!=0:errors.append(arm+" engine error")
  if m.get("map")!=case["map"] or m.get("weapon")!=case["weapon"]:
   errors.append(arm+" wrong environment")
  if v.get("schema")!="fpsarena-v67-public-map-range-acquisition-v1":
   errors.append(arm+" missing V67 schema")
  if v.get("productionAllowed") is not False or v.get("onlyMovementModified") is not True or v.get("fireAimAdsSkillsModified") is not False:
   errors.append(arm+" research/motor safety contract")
  if v.get("farPublicTargetCapturedBeforeIntervention") is not True:
   errors.append(arm+" target not captured before intervention")
  if v.get("changedTicks",-1)>1050 or v.get("changedTicks",-1)<0 or v.get("activeTicks",-1)>1050:
   errors.append(arm+" exceeded bounded action window")
  natural=m.get("finishedNaturally") and m.get("termination")=="results"
  if bool(m.get("finishedNaturally"))!=(m.get("termination")!="match"):
   errors.append(arm+" invalid termination")
  scores=m.get("modeState",{}).get("scores",{})
  if natural and max(scores.get("red",0),scores.get("blue",0))<50:
   errors.append(arm+" unfinished server score")
  if m.get("duration",0)>600.25:
   errors.append(arm+" exceeded censor cap")
  if v["triggerTick"] is not None:
   witness=v.get("prestate")
   if not witness or witness.get("tick")!=v["triggerTick"] or not isinstance(witness.get("rngState"),int):
    errors.append(arm+" invalid server+PRNG witness")
   public=v.get("triggerPublicFeatures")
   if not public or public.get("valid") is not True or public.get("noPrivilegedState") is not True:
    errors.append(arm+" invalid public acquisition trigger")
   if v.get("complete") is True:
    initial=v.get("initial");terminal=v.get("terminal");outcome=v.get("outcome")
    if not all(isinstance(x,dict) for x in (initial,terminal,outcome)):
     errors.append(arm+" outcome counter unavailable")
    else:
     for key,start in initial.items():
      if outcome.get(key)!=terminal.get(key,0)-start:
       errors.append(arm+" counter delta "+key)
 if original.get("changedTicks")!=0:
  errors.append("Keep must be an exact passive policy")
 naturalAll=all(m["finishedNaturally"] and m["termination"]=="results" for _,m,_,_ in rows)
 eligible=naturalAll and original.get("triggerTick") is not None and all(v.get("complete") for _,m,v,_ in rows)
 return {
  "id":case["id"],"status":"PASS" if not errors else "FAIL","errors":errors,
  "map":case["map"],"weapon":case["weapon"],"seed":case["seed"],
  "triggerTick":original["triggerTick"],"naturalFourArm":naturalAll,
  "eligiblePaired":eligible,"censoredAny":not naturalAll,
  "triggerDistance":original["triggerPublicFeatures"].get("distance") if original["triggerPublicFeatures"] else None,
  "arms":{arm:{
    "sha256":digest,"shots":m["shots"],"hits":m["hits"],"kills":m["kills"],
    "deaths":m["deaths"],"netKills":m["kills"]-m["deaths"],
    "damageTaken":m["damageTaken"],"duration":m["duration"],
    "team":m["team"],"scores":m["modeState"]["scores"],
    "natural":m["finishedNaturally"],
    "changedTicks":v["changedTicks"],"activeTicks":v["activeTicks"],
    "routePlans":v["routePlans"],"routeFound":v["routeFound"],
    "inRangeTicks":v["inRangeTicks"],"stops":v["stops"],
    "initialFarDistance":v["initialFarDistance"],"finalDistance":v["finalDistance"],
    "windowOutcome":v["outcome"]
   } for arm,m,v,digest in rows}}
def audit():
 reg=frozen.verify()  # exact original source and all parent hashes remain frozen
 groups=[audited_group(c) for c in frozen.DISCOVERY]
 report={
  "schema":"fpsarena-v67-independent-auditor-erratum-v1",
  "frozenRegistrySHA256":frozen.sha(frozen.REG),
  "frozenProtocolSourceSHA256":reg["sourceSHA256"]["scripts/tdm_v67_acquisition.py"],
  "frozenProtocolAuditKnownFailure":"UnboundLocalError: local result variable in audit_case",
  "auditImplementedInIndependentUnfrozenAddendum":True,
  "matchGroupCount":len(groups),"allPass":all(g["status"]=="PASS" for g in groups),
  "passGroups":sum(g["status"]=="PASS" for g in groups),
  "missingGroups":[g["id"] for g in groups if g["status"]=="MISSING"],
  "failedGroups":[g["id"] for g in groups if g["status"]=="FAIL"],
  "triggeredGroups":sum(g.get("triggerTick") is not None for g in groups),
  "naturalFourArmGroups":sum(g.get("naturalFourArm",False) for g in groups),
  "eligiblePairedGroups":sum(g.get("eligiblePaired",False) for g in groups),
  "censoredGroups":sum(g.get("censoredAny",False) for g in groups),
  "groups":groups,"newAndOldHoldoutsOpened":False,"promotionAllowed":False}
 AUD.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return report
def seed_boot(values,seed):
 a=np.asarray(values,dtype=np.float64)
 if len(a)==0:return None
 rng=np.random.default_rng(seed)
 simulations=np.asarray([rng.choice(a,len(a),replace=True).mean() for i in range(16000)])
 return {"nGroups":len(a),"mean":float(a.mean()),
  "CI95":np.quantile(simulations,[.025,.975]).tolist(),
  "min":float(a.min()),"max":float(a.max())}
def evaluation():
 a=audit()
 assert_(a["allPass"],"CANNOT_ANALYZE_FAILED_OR_MISSING_GROUPS")
 paired=[g for g in a["groups"] if g["eligiblePaired"]]
 metrics=("kills","netKills","deaths","damageTaken","shots","hits")
 deltas={}
 for i,arm in enumerate(ARMS[1:]):
  deltas[arm]={key:seed_boot([g["arms"][arm][key]-g["arms"]["keep"][key] for g in paired],
    670067+64*i+j) for j,key in enumerate(metrics)}
 desc={}
 for arm in ARMS:
  obs=[g["arms"][arm] for g in a["groups"]]
  desc[arm]={
   "naturalCount":sum(r["natural"] for r in obs),
   "teamWins":sum(r["scores"][r["team"]]>=50 for r in obs),
   "meanShots":float(np.mean([r["shots"] for r in obs])),
   "meanKills":float(np.mean([r["kills"] for r in obs])),
   "meanDeaths":float(np.mean([r["deaths"] for r in obs])),
   "meanDamageTaken":float(np.mean([r["damageTaken"] for r in obs])),
   "meanRoutePlans":float(np.mean([r["routePlans"] for r in obs])),
   "meanPathFound":float(np.mean([r["routeFound"] for r in obs]))}
 enough=len(paired)>=12
 safety={
  arm:bool(enough and d["netKills"]["CI95"][0]>0 and
           d["deaths"]["CI95"][1]<=0 and d["damageTaken"]["CI95"][1]<=0)
  for arm,d in deltas.items()}
 report={
  "schema":"fpsarena-v67-independent-audit-natural-fullmatch-statistics-v1",
  "registrySHA256":frozen.sha(frozen.REG),
  "discoveryGroups":len(a["groups"]),"eligibleGroups":len(paired),
  "triggeredGroups":a["triggeredGroups"],"naturalMatchCount":sum(x["naturalCount"] for x in desc.values()),
  "noTriggerGroups":[g["id"] for g in a["groups"] if g["triggerTick"] is None],
  "byArm":desc,"pairedArmMinusKeep":deltas,
  "safetyGateByArm":safety,"minimumIndependentMatchedGroupGatePassed":enough,
  "promoteToProduction":False,"allHoldoutsSealed":True,
  "calibrationSeed441109Excluded":True,
  "limitations":["C35AJ headless sim and official bots, not representative human players",
    "same-seed forks diverge after intervention",
    "naturally completed matches can have different durations",
    "extra acquisition may increase deaths/damage despite more shots and kills",
    "independent audit addendum fixes a reporting code name collision without altering frozen protocol"]}
 EVAL.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return report
def main():
 op=sys.argv[1] if len(sys.argv)>1 else "audit"
 if op=="audit":
  d=audit()
  print("AUDIT",json.dumps({key:d[key] for key in
    ("passGroups","missingGroups","failedGroups","triggeredGroups",
     "naturalFourArmGroups","eligiblePairedGroups")},sort_keys=True))
  if d["failedGroups"] or d["missingGroups"]:raise SystemExit(2)
 elif op=="evaluate":
  d=evaluation()
  print("EVAL",json.dumps({key:d[key] for key in
    ("eligibleGroups","naturalMatchCount","safetyGateByArm","promoteToProduction")},sort_keys=True))
 else:raise SystemExit("audit | evaluate")
if __name__=="__main__":
 main()
