#!/usr/bin/env python3
"""Non-invasive V66 trigger coverage and public-rejection diagnosis.

Consumes only already-audited discovery runs.  Cannot access holdouts and
cannot tune or alter preregistered control code.  This is descriptive only.
"""
from __future__ import annotations
import json
from collections import Counter,defaultdict
from pathlib import Path
import tdm_v66_natural as study

ROOT=study.ROOT
OUT=ROOT/"research"/"tdm-v66-trigger-coverage.json"

def main():
 study.verify()
 a=study.audit()
 if a["missingGroups"] or a["failedGroups"]:
  raise ValueError("COVERAGE_REQUIRES_FULL_INDEPENDENT_AUDIT")
 cases={c["id"]:c for c in study.DISCOVERY}
 rows=[]
 for g in a["groups"]:
  c=cases[g["id"]]
  m=json.loads(study.filepath(c,"keep").read_text(encoding="utf-8"))["results"][0]
  trace=m["tdmV64"]
  reasons=trace.get("publicCueCounts") or {}
  rejected=trace.get("rejectionCounts") or {}
  if any(not isinstance(x,(int,float)) or x<0 for x in reasons.values()):
   raise ValueError("INVALID_CUE_COUNTERS")
  rows.append({
   "id":g["id"],"map":c["map"],"weapon":c["weapon"],"stratum":c["stratum"],
   "seed":c["seed"],"triggerTick":g["triggerTick"],
   "triggered":g["triggerTick"] is not None,
   "publicCueCounts":reasons,"rejectionCounts":rejected,
   "engineNatural":g["naturalAll"],
   "allFourArmsMatched":g["status"]=="PASS",
   "team":m["team"],
   "teamWon":m["modeState"]["scores"][m["team"]]>=50,
   "keepKills":m["kills"],"keepDeaths":m["deaths"],
   "keepShots":m["shots"],
   "keepDuration":m["duration"],
   "rawKeepSha256":study.sha(study.filepath(c,"keep"))
  })
 for k in ("map","weapon","stratum"):
  if any(not r.get(k) for r in rows):raise ValueError("MISSING_METADATA")
 by={}
 for dimension in ("map","weapon","stratum"):
  groups=defaultdict(list)
  for r in rows:groups[r[dimension]].append(r)
  by[dimension]={name:{"totalGroups":len(rs),
      "triggeredGroups":sum(r["triggered"] for r in rs),
      "meanKeepKills":sum(r["keepKills"] for r in rs)/len(rs),
      "meanKeepShots":sum(r["keepShots"] for r in rs)/len(rs),
      "noTriggerGroups":[r["id"] for r in rs if not r["triggered"]]}
      for name,rs in sorted(groups.items())}
 counts=Counter()
 for r in rows:
  if not r["triggered"]:counts.update(r["publicCueCounts"])
 report={
  "schema":"fpsarena-v66-no-treatment-trigger-coverage-v1",
  "registrySHA256":study.sha(study.REG),
  "source":"audited preregistered discovery results only",
  "descriptiveNotPolicySelection":True,
  "totalGroups":len(rows),"triggeredGroups":sum(r["triggered"] for r in rows),
  "notTriggeredGroups":sum(not r["triggered"] for r in rows),
  "noTriggerReasonTotals":dict(counts),
  "breakdown":by,"groups":rows,
  "oldAndNewHoldoutsAccessed":False,
  "limitations":["Cue sampling only reflects current V61 trigger gate",
    "Not all no-trigger reasons are independently measurable from this summary",
    "High team win rate reflects official simulator opponents, not trained agent advantage"]
 }
 OUT.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 print(json.dumps({"totalGroups":report["totalGroups"],
  "triggered":report["triggeredGroups"],
  "byMap":by["map"],"byWeapon":by["weapon"]},sort_keys=True))
if __name__=="__main__":
 main()
