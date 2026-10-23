#!/usr/bin/env python3
"""V66 preregistered independent 4v4 natural TDM cohort (C35AJ, research-only).

Reuse the frozen v65 runner as-is.  New seed groups and preregistration are
never allowed to access old or new sealed holdouts.  Audit pairs by public
trigger, command prefix, true PRNG/server witness; analyze each match as ONE
outcome, and never treat full-match termination as a fixed time window.
"""
from __future__ import annotations
import concurrent.futures
import hashlib, json, sys
from pathlib import Path
import numpy as np
import tdm_v65_fullmatch as base

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"/"v66"
DATA.mkdir(parents=True,exist_ok=True)
REG=ROOT/"research"/"tdm-v66-natural-frozen-registry.json"
AUD=ROOT/"research"/"tdm-v66-natural-independent-audit.json"
EVAL=ROOT/"research"/"tdm-v66-natural-evaluation.json"
ARMS=base.ARMS
# Prior to *any* V66 run; diversified maps/weapons/trigger strata.
DISCOVERY=[
 {"id":"v66-a-mp5-01","seed":660101,"map":"arena","weapon":"mp5sd","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-a-mp5-02","seed":660102,"map":"arena","weapon":"mp5sd","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-f-uzi-03","seed":660103,"map":"foundry","weapon":"uzi","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-f-uzi-04","seed":660104,"map":"foundry","weapon":"uzi","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-a-uzi-05","seed":660105,"map":"arena","weapon":"uzi","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-a-uzi-06","seed":660106,"map":"arena","weapon":"uzi","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-n-m4a1-07","seed":660107,"map":"neon","weapon":"m4a1","stratum":"post-fire","split":"discovery"},
 {"id":"v66-n-m4a1-08","seed":660108,"map":"neon","weapon":"m4a1","stratum":"post-fire","split":"discovery"},
 {"id":"v66-n-aa12-09","seed":660109,"map":"neon","weapon":"aa12","stratum":"post-fire","split":"discovery"},
 {"id":"v66-n-aa12-10","seed":660110,"map":"neon","weapon":"aa12","stratum":"post-fire","split":"discovery"},
 {"id":"v66-f-m4a1-11","seed":660111,"map":"foundry","weapon":"m4a1","stratum":"post-fire","split":"discovery"},
 {"id":"v66-a-aa12-12","seed":660112,"map":"arena","weapon":"aa12","stratum":"post-fire","split":"discovery"},
 {"id":"v66-f-mp5-13","seed":660113,"map":"foundry","weapon":"mp5sd","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-f-mp5-14","seed":660114,"map":"foundry","weapon":"mp5sd","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-a-mp5-15","seed":660115,"map":"arena","weapon":"mp5sd","stratum":"aim-lock","split":"discovery"},
 {"id":"v66-f-uzi-16","seed":660116,"map":"foundry","weapon":"uzi","stratum":"aim-lock","split":"discovery"}]
HOLDOUT=[
 {"id":"v66-hold-neon-m4a1-17","seed":660117,"map":"neon","weapon":"m4a1","stratum":"post-fire","split":"holdout"},
 {"id":"v66-hold-arena-aa12-18","seed":660118,"map":"arena","weapon":"aa12","stratum":"post-fire","split":"holdout"},
 {"id":"v66-hold-foundry-uzi-19","seed":660119,"map":"foundry","weapon":"uzi","stratum":"aim-lock","split":"holdout"}]
CASES=DISCOVERY+HOLDOUT
SOURCES=[
 "scripts/tdm_v65_fullmatch.py",
 "scripts/tdm_v66_natural.py",
 "lab/arena/train-main-v64.mjs",
 "lab/arena/tdm-context-trial-v64.mjs",
 "lab/arena/tdm-public-tactics-v64.mjs",
 "lab/arena/tdm-engagement-trigger-v61.mjs",
 "lab/arena/tdm-stratified-replay-v60.mjs",
 "lab/arena/source-main/server/game.js",
 "lab/arena/source-main/server/bot.js",
 "page-agent.js",
 "research/tdm-v65-fullmatch-frozen-registry.json",
 "research/tdm-v64-public-context-shadow-model.json"]
REGISTRIES=[
 "tdm-v60-frozen-registry.json","tdm-v61-frozen-registry.json",
 "tdm-v62-frozen-registry.json","tdm-v63-prospective-registry.json",
 "tdm-v64-frozen-registry.json","tdm-v65-fullmatch-frozen-registry.json"]
def sha(path):return base.sha(path)
def require(c,m):
 if not c:raise ValueError(m)
def freeze():
 require(not REG.exists(),"REGISTRY_ALREADY_EXISTS")
 base.verify()
 older=[]
 for name in REGISTRIES:
  obj=json.loads((ROOT/"research"/name).read_text(encoding="utf-8"))
  older += obj.get("cases",obj.get("allCases",[]))
 seen=[x["seed"] for x in older+CASES]
 require(len(set(seen))==len(seen),"DUPLICATE_OR_SEALED_SEED")
 reg={
  "schema":"fpsarena-v66-diverse-natural-fullmatch-preregistered-v1",
  "parent":"C35AJ, from research-v65-full-natural-tdm; never claim restored v57+",
  "cases":CASES,"arms":list(ARMS),
  "frozenSourceSha256":{x:sha(ROOT/x) for x in SOURCES},
  "priorRegistrySha256":{x:sha(ROOT/"research"/x) for x in REGISTRIES},
  "matchConfig":{"mode":"tdm","bots":8,"opponents":"official","lagMs":45,
    "fullMatch":True,"capSeconds":600,"serverTeamScoreLimit":50,
    "pulseTreatmentTicks":150},
  "population":{"maps":["arena","foundry","neon"],"weapons":["mp5sd","uzi","m4a1","aa12"],
    "triggerStrata":["aim-lock","post-fire"],"independentSeedGroups":len(DISCOVERY)},
  "statisticalUnit":"one seed group (4 matched arms), never individual ticks/arms",
  "outcomes":["fullMatchNetKills","deaths","damageTaken","teamWon","teamScoreMargin","duration"],
  "matchedPairedAnalysis":{"control":"keep","treatments":["close","strafe","withdraw"],
    "requireAllFourNatural":True,"requirePrebranchExactWitness":True,
    "silentNoTriggerPolicy":"include natural match descriptives, exclude treatment-effect analysis",
    "censorPolicy":"retain and report; never score as natural win"},
  "promotionRule":{"minEligibleGroups":12,
    "lowerBound95CIOfNetKillsDeltaStrictPositive":True,
    "upperBound95CIOfDeathsDeltaNonPositive":True,
    "upperBound95CIOfDamageDeltaNonPositive":True,
    "requireOtherRepresentativeOpponentsAndUnopenedHoldouts":True,
    "noAutoPromotion":True},
  "bootstrap":{"seed":660066,"iterations":15000,"unit":"matched seed group"},
  "limitations":["four-arm simulator replay rather than true cloned in-memory simulator",
    "post-treatment RNG may diverge","different natural-match durations",
    "official bots, not human opponents","v65 observed outcomes NOT used as tuning seeds"],
  "noTraining":True,"holdoutsCannotBeRunFromProtocol":True,
  "researchOnly":True,"productionModified":False}
 REG.parent.mkdir(parents=True,exist_ok=True)
 REG.write_text(json.dumps(reg,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return reg
def verify():
 obj=json.loads(REG.read_text(encoding="utf-8"))
 require(obj["cases"]==CASES and obj["arms"]==list(ARMS),"FROZEN_REGISTRY_CHANGED")
 require(obj["matchConfig"]["fullMatch"] and obj["matchConfig"]["capSeconds"]==600,
   "MATCH_CENSORING_PROTOCOL_ALTERED")
 for item,digest in obj["frozenSourceSha256"].items():
  require(sha(ROOT/item)==digest,"FROZEN_SOURCE_ALTERED:"+item)
 for item,digest in obj["priorRegistrySha256"].items():
  require(sha(ROOT/"research"/item)==digest,"PARENT_REGISTRY_ALTERED:"+item)
 base.verify()
 return obj
def use_own_data():base.DATA=DATA
def filepath(case,arm):return DATA/(case["id"]+"-"+arm+".json")
def runone(case,arm):
 use_own_data()
 return base.runone(case,arm)
def run(selected):
 verify()
 names=set(selected)
 allowed={x["id"] for x in DISCOVERY}
 require(not names or names<=allowed,"NO_OLD_OR_NEW_HOLDOUT_ALLOWED")
 cases=[x for x in DISCOVERY if not names or x["id"] in names]
 for c in cases:
  for arm in ARMS:require(not filepath(c,arm).exists(),"DO_NOT_OVERWRITE "+c["id"])
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   fs=[pool.submit(runone,c,a) for a in ARMS]
   for f in concurrent.futures.as_completed(fs):
    print("RUN",json.dumps(f.result(),sort_keys=True),flush=True)
def audit():
 verify()
 use_own_data()
 groups=[base.audit_one(c) for c in DISCOVERY]
 report={
  "schema":"fpsarena-v66-natural-matched-four-arm-audit-v1",
  "registrySHA256":sha(REG),"groups":groups,
  "completeGroups":sum(g["status"]=="PASS" for g in groups),
  "missingGroups":[g["id"] for g in groups if g["status"]=="MISSING"],
  "failedGroups":[g["id"] for g in groups if g["status"]=="FAIL"],
  "fullyNaturallyEndedGroups":sum(g.get("naturalAll",False) for g in groups),
  "eligiblePairedGroups":sum(g.get("eligiblePairedEffect",False) for g in groups),
  "rightCensoredGroups":sum(g.get("censoredAny",False) for g in groups),
  "triggeredGroups":sum(g.get("triggerTick") is not None for g in groups),
  "holdoutAccessed":False,"productionPromoted":False}
 AUD.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return report
def bootstrap(z,seed):
 x=np.asarray(z,dtype=np.float64)
 if x.size==0:return None
 rng=np.random.default_rng(seed)
 draws=np.asarray([rng.choice(x,x.size,replace=True).mean() for _ in range(15000)])
 return {"mean":float(x.mean()),"CI95":np.quantile(draws,[.025,.975]).tolist(),
   "min":float(x.min()),"max":float(x.max()),"groups":len(x)}
def study():
 a=audit()
 require(not a["failedGroups"] and not a["missingGroups"],"AUDIT_HAS_MISSING_OR_BAD_GROUPS")
 eligible=[g for g in a["groups"] if g["eligiblePairedEffect"]]
 natural=[g for g in a["groups"] if g["naturalAll"]]
 winAll=0;matchCount=0;wins={}
 for arm in ARMS:
  records=[g["arms"][arm] for g in natural]
  wins[arm]={"nNatural":len(records),"traineeTeamWins":sum(
    r["modeState"]["scores"].get("red",0)>=50 for r in records),
    "meanDuration":float(np.mean([r["duration"] for r in records])) if records else None}
  winAll+=wins[arm]["traineeTeamWins"];matchCount+=len(records)
 comparisons={}
 for i,arm in enumerate(ARMS[1:]):
  deltas={k:[] for k in ("netKills","deaths","damageTaken","kills")}
  teamMargin=[]
  duration=[]
  for g in eligible:
   a0=g["arms"][arm];b=g["arms"]["keep"]
   for k in deltas:deltas[k].append(a0[k]-b[k])
   teamMargin.append((a0["modeState"]["scores"]["red"]-a0["modeState"]["scores"]["blue"])-
      (b["modeState"]["scores"]["red"]-b["modeState"]["scores"]["blue"]))
   duration.append(a0["duration"]-b["duration"])
  comparisons[arm]={key:bootstrap(val,660066+10*i+j)
     for j,(key,val) in enumerate([*deltas.items(),("teamScoreMargin",teamMargin),("duration",duration)])}
 min_groups=len(eligible)>=12
 # Explicitly forbid automatic promotion even if numerical checks pass.
 statistical={arm:bool(min_groups and data["netKills"]["CI95"][0]>0 and
   data["deaths"]["CI95"][1]<=0 and data["damageTaken"]["CI95"][1]<=0)
   for arm,data in comparisons.items()}
 doc={
  "schema":"fpsarena-v66-independent-natural-match-group-comparison-v1",
  "frozenRegistrySHA256":sha(REG),
  "discoveryGroups":len(DISCOVERY),"eligibleGroups":len(eligible),
  "fullyNaturalGroups":len(natural),"censoredGroups":a["rightCensoredGroups"],
  "triggeredGroups":a["triggeredGroups"],"naturalMatchCount":matchCount,
  "totalTraineeTeamWins":winAll,
  "descriptive":wins,"byArmVsKeep":comparisons,
  "statisticalGatePerArm":statistical,"anyStatisticalGatePass":any(statistical.values()),
  "promotionAllowed":False,"allHoldoutsSealed":True,
  "safetyNote":"Do not treat team win or more kills in mismatched-length natural games as isolated effect of a 150-tick action.",
  "comparability":["Four arms share pre-action seed/witness but diverge after 150-tick intervention",
   "Natural-end durations can differ, so total K/D are not fixed-time outcomes",
   "Official bots only and the same algorithmic incumbent on all arms"]}
 EVAL.write_text(json.dumps(doc,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return doc
def main():
 op=sys.argv[1] if len(sys.argv)>1 else "verify"
 if op=="freeze":
  freeze();print("FROZEN",len(CASES),sha(REG))
 elif op=="verify":
  verify();print("VERIFIED",len(CASES),sha(REG))
 elif op=="run":run(sys.argv[2:])
 elif op=="audit":
  a=audit();print("AUDIT",json.dumps({k:a[k] for k in
   ("completeGroups","missingGroups","failedGroups","fullyNaturallyEndedGroups",
    "eligiblePairedGroups","rightCensoredGroups")}))
  if a["failedGroups"]:raise SystemExit(2)
 elif op=="evaluate":
  d=study()
  print("EVAL",json.dumps({k:d[k] for k in
   ("eligibleGroups","fullyNaturalGroups","naturalMatchCount","totalTraineeTeamWins","statisticalGatePerArm","promotionAllowed")}))
 else:raise SystemExit("freeze|verify|run [discovery ids...]|audit|evaluate")
if __name__=="__main__":main()
