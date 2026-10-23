#!/usr/bin/env python3
"""V64 frozen public-context replay discovery. Never runs sealed holdouts.
The codebase is persistent; all raw artifacts are restored from tracked Git JSON.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"/"v64"
DATA.mkdir(parents=True,exist_ok=True)
REG=ROOT/"research"/"tdm-v64-frozen-registry.json"
AUD=ROOT/"research"/"tdm-v64-discovery-audit.json"
ARMS=("keep","close","strafe","withdraw")
CASES=[
 {"id":"v64-aim-arena-mp5sd-01","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":640101},
 {"id":"v64-aim-arena-mp5sd-02","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":640102},
 {"id":"v64-aim-arena-mp5sd-03","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":640103},
 {"id":"v64-aim-arena-mp5sd-04","split":"discovery","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":640104},
 {"id":"v64-aim-foundry-uzi-05","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":640105},
 {"id":"v64-aim-foundry-uzi-06","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":640106},
 {"id":"v64-aim-foundry-uzi-07","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":640107},
 {"id":"v64-aim-foundry-uzi-08","split":"discovery","map":"foundry","weapon":"uzi","stratum":"aim-lock","seed":640108},
 {"id":"v64-fire-foundry-uzi-09","split":"discovery","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":640109},
 {"id":"v64-fire-foundry-uzi-10","split":"discovery","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":640110},
 {"id":"v64-aim-arena-uzi-11","split":"discovery","map":"arena","weapon":"uzi","stratum":"aim-lock","seed":640111},
 {"id":"v64-fire-neon-m4a1-12","split":"discovery","map":"neon","weapon":"m4a1","stratum":"post-fire","seed":640112},
 {"id":"v64-hold-arena-mp5sd-13","split":"holdout","map":"arena","weapon":"mp5sd","stratum":"aim-lock","seed":640113},
 {"id":"v64-hold-foundry-uzi-14","split":"holdout","map":"foundry","weapon":"uzi","stratum":"post-fire","seed":640114},
 {"id":"v64-hold-neon-m4a1-15","split":"holdout","map":"neon","weapon":"m4a1","stratum":"post-fire","seed":640115}
]
CODE_FILES=[
 "lab/arena/tdm-public-tactics-v64.mjs",
 "lab/arena/tdm-context-trial-v64.mjs",
 "lab/arena/train-main-v64.mjs",
 "tests/tdm-v64-public-tactics.test.mjs",
 "scripts/tdm_v64_protocol.py",
]
PROTECTED=[
 "lab/arena/tdm-stratified-replay-v60.mjs",
 "lab/arena/tdm-engagement-trigger-v61.mjs",
 "lab/arena/train-main-v61.mjs",
 "research/tdm-v62-shadow-neural-critic.json",
 "research/tdm-v63-contrast-model.json",
 "research/tdm-v63-prospective-registry.json",
 "page-agent.js",
 "lab/arena/source-main/server/game.js",
 "lab/arena/source-main/server/bot.js"
]
def sha(p):
 h=hashlib.sha256()
 with Path(p).open("rb") as f:
  for part in iter(lambda:f.read(1<<20),b""):h.update(part)
 return h.hexdigest()
def require(test,reason):
 if not test:raise ValueError(reason)
def freeze():
 require(not REG.exists(),"ALREADY_FROZEN")
 registries=[
  ROOT/"research"/("tdm-v%d-"%v+("prospective-registry.json" if v==63 else "frozen-registry.json")) for v in (60,61,62,63)]
 # v60-62 registries use standard frozen name; v63 prospective name.
 old=[row["seed"] for p in registries for row in json.loads(p.read_text("utf-8"))["cases"]]
 new=[row["seed"] for row in CASES]
 require(len(set(old+new))==len(old+new),"DUPLICATE_OR_OLD_SEED")
 obj={"schema":"fpsarena-v64-public-context-preregistered-cohort-v1",
  "baseline":"C35AJ not full v57-v59",
  "cases":CASES,"arms":list(ARMS),
  "sourceHashes":{p:sha(ROOT/p) for p in CODE_FILES},
  "protectedHashes":{p:sha(ROOT/p) for p in PROTECTED},
  "parentRegistryHashes":{p.name:sha(p) for p in registries},
  "outcomeTicks":480,"treatmentTicks":150,
  "baseFeatures":18,"newPublicFeatures":12,
  "modelDesign":"Compare constant, state-only ridge, old-action ridge vs action ridge with V64 public-context; grouped leave-one-seed-out; no promotion.",
  "ridgeAlphas":[24,48,96],
  "modelSelection":"Fixed alpha=48 for all candidates before prospective discovery; not tuned on holdouts.",
  "holdoutsBlocked":True,
  "actorHasNoPrivateState":True,
  "unit":"one independent four-arm branch group, outcome window 480 ticks",
  "limitations":["client.map static geometry supplied by headless simulator","headless client opponents are bots, not real humans",
  "snapshot map/visibility approximates public game client, no renderer","delayed teammate/target samples; future RNG can diverge"]
 }
 REG.parent.mkdir(parents=True,exist_ok=True)
 REG.write_text(json.dumps(obj,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return obj
def verify():
 obj=json.loads(REG.read_text("utf-8"))
 require(obj["cases"]==CASES and obj["arms"]==list(ARMS),"REGISTRY_CASE_TAMPER")
 for rel,d in {**obj["sourceHashes"],**obj["protectedHashes"]}.items():
  require(sha(ROOT/rel)==d,"FROZEN_HASH_CHANGED:"+rel)
 for name,d in obj["parentRegistryHashes"].items():
  require(sha(ROOT/"research"/name)==d,"PARENT_REGISTRY_CHANGED:"+name)
 return obj
def path(case,arm):
 return DATA/(case["id"]+"-"+arm+".json")
def run_one(case,arm):
 file=path(case,arm)
 require(not file.exists(),"RESULT_EXISTS:"+str(file))
 command=["node","lab/arena/train-main-v64.mjs","--profile","release",
  "--modes","tdm","--episodes","1","--seconds","78",
  "--seed",str(case["seed"]),"--classic-maps",case["map"],
  "--bots","8","--opponents","official","--lag-ms","45",
  "--trainee-primary",case["weapon"],"--tdm-v64-arm",arm,"--tdm-v64-stratum",case["stratum"],
  "--out",str(file)]
 result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=170,encoding="utf-8",errors="replace")
 (DATA/(case["id"]+"-"+arm+".log")).write_text(result.stdout+"\n"+result.stderr,encoding="utf-8")
 require(result.returncode==0 and file.exists(),"SIMULATION_ERROR:"+case["id"]+":"+arm+":"+result.stderr[-250:])
 m=json.loads(file.read_text("utf-8"))["results"][0]
 return {"id":case["id"],"arm":arm,"trigger":m["tdmV64"]["triggerTick"],
  "changed":m["tdmV64"]["changedTicks"],"kills":m["kills"],"deaths":m["deaths"]}
def audit_case(case):
 records=[]
 for arm in ARMS:
  p=path(case,arm)
  if not p.exists():return {"id":case["id"],"status":"missing","missing":arm}
  m=json.loads(p.read_text("utf-8"))["results"][0]
  records.append((arm,m,m["tdmV64"],sha(p)))
 first=records[0][2]
 problems=[]
 def canonical(x):return json.dumps(x,sort_keys=True,separators=(",",":"))
 for arm,m,v,d in records:
  for key in ("triggerTick","prestate","prefixSHA256","triggerPublicFeatures","initial","contextV64"):
   if canonical(v.get(key))!=canonical(first.get(key)):problems.append(f"{arm}: DIFFERENT_{key}")
  if m["errors"]:problems.append(f"{arm}: ERRORS")
  if v["activeTicks"]>150 or v["changedTicks"]>150:problems.append(f"{arm}: EXCEEDED_TREATMENT_WINDOW")
  if not v.get("onlyMovementModified") or not v.get("contextCapturedBeforeIntervention"):
   problems.append(f"{arm}: PRIVACY_OR_WASD_CONTRACT")
  if v["triggerTick"] is not None:
   if not v["prestate"] or v["prestate"]["tick"]!=v["triggerTick"] or not isinstance(v["prestate"].get("rngState"),int):
    problems.append(f"{arm}: INVALID_RNG_WITNESS")
   if not v["complete"]:problems.append(f"{arm}: RIGHT_CENSORED")
   if not v["contextV64"] or v["contextV64"].get("valid") is not True:
    problems.append(f"{arm}: CONTEXT_MISSING")
   if v["outcome"] and v["initial"] and v["terminal"]:
    for k,v0 in v["initial"].items():
     if v["outcome"].get(k)!=v["terminal"].get(k,0)-v0:problems.append(f"{arm}: DELTA_{k}")
  if v["contextV64"] and v["contextV64"].get("noPrivateServerInput") is not True:
   problems.append(f"{arm}: LEAK_BOUNDARY")
 if records[0][2]["changedTicks"]!=0:problems.append("KEEP_CHANGED")
 return {"id":case["id"],"status":"PASS" if not problems else "FAIL",
  "errors":problems,"trigger":first["triggerTick"],
  "eventPositive":any(v["outcome"] and any(v["outcome"].get(k,0)>0 for k in ("kills","deaths","damageTaken")) for _,_,v,_ in records),
  "changedArms":sum(v["changedTicks"]>0 for _,_,v,_ in records),
  "arms":{arm:{"sha256":d,"outcome":v["outcome"],"changed":v["changedTicks"]} for arm,m,v,d in records}}
def audit():
 obj=verify()
 groups=[]
 for c in CASES:
  if c["split"]=="discovery" and all(path(c,a).exists() for a in ARMS):
   groups.append(audit_case(c))
 report={"schema":"fpsarena-v64-independent-group-audit-v1",
  "registrySHA256":sha(REG),"groups":groups,"completeGroups":len(groups),
  "allPass":all(g["status"]=="PASS" for g in groups),
  "triggered":sum(g["trigger"] is not None for g in groups),
  "hazardRewardGroups":sum(bool(g["eventPositive"]) for g in groups),
  "oldAndNewHoldoutsOpened":False,"policyPromotion":False}
 AUD.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 return report
def main():
 op=sys.argv[1] if len(sys.argv)>1 else "verify"
 if op=="freeze":
  freeze();print("FROZEN",len(CASES),sha(REG))
 elif op=="verify":
  verify();print("VERIFIED",len(CASES),sha(REG))
 elif op=="run":
  verify()
  sel=set(sys.argv[2:])
  target=[c for c in CASES if c["split"]=="discovery" and (not sel or c["id"] in sel)]
  require(not sel or set(c["id"] for c in target)==sel,"HOLDOUT_OR_UNKNOWN_REFUSED")
  for case in target:
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for f in concurrent.futures.as_completed([pool.submit(run_one,case,arm) for arm in ARMS]):
     print("RUN",json.dumps(f.result(),sort_keys=True),flush=True)
 elif op=="audit":
  doc=audit();print("AUDIT",json.dumps({k:doc[k] for k in ("completeGroups","allPass","triggered","hazardRewardGroups","oldAndNewHoldoutsOpened")}))
  if not doc["allPass"]:raise SystemExit(2)
 else:raise SystemExit("freeze | verify | run [discovery IDs] | audit")
if __name__=="__main__":main()
