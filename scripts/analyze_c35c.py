#!/usr/bin/env python3
"""C35-C research-only descriptive analysis. No causal promotion decisions.

Input: JSONL lines produced by C35COfferLedger.rows(); optionally one file per
match. Requires outcomes to be genuinely observed, never synthesized.

Examples:
 python scripts/analyze_c35c.py reports/c35c/pilot/*.jsonl --out reports/c35c/summary.json
 python scripts/analyze_c35c.py --audit-c35b reports/c35c/C35B-BASELINE.json
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import json
import math
from c35c_validation import audit_prospective_linkage, matched_setup_bootstrap
from pathlib import Path
import random
import statistics

ARMS = ("baseline", "micro-left", "micro-right")
RISKS = ("low", "middle", "high", "unknown")


def load_jsonl(paths):
    rows = []
    for path in paths:
        for i, text in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
            if not text.strip():
                continue
            try:
                row = json.loads(text, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"nonfinite JSON constant {value}")))
                validate_row(row)
                rows.append(row)
            except (ValueError, TypeError, KeyError) as exc:
                raise ValueError(f"{path}:{i}: {exc}") from exc
    if not rows:
        raise ValueError("No observations: C36 remains blocked")
    ids = [r["offerId"] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Offer IDs must be unique across every loaded match")
    # Nonoverlap is per-match, not per-setup; two matched runs can share setup.
    groups = defaultdict(list)
    for row in rows:
        groups[row["matchId"]].append((row["startMs"], row["windowEndMs"]))
    for match_id, windows in groups.items():
        windows.sort()
        if any(b[0] < a[1] for a, b in zip(windows, windows[1:])):
            raise ValueError(f"Overlapping windows in match {match_id}")
    return rows


def validate_row(row):
    if not isinstance(row, dict) or row.get("schema") != "fpsarena-c35c-offer-v1":
        raise ValueError("Unexpected schema")
    for k in ("matchId", "setupId", "offerId"):
        if not isinstance(row.get(k), str) or not row[k]:
            raise ValueError(f"Missing {k}")
    if row.get("policy") is not None and row["policy"] not in ("legacy80", "hierarchical80"):
        raise ValueError("Invalid policy")
    if row.get("attemptId") is not None and (not isinstance(row["attemptId"],str) or not row["attemptId"]):
        raise ValueError("Invalid attemptId")
    if row.get("assignment") not in ARMS or row.get("riskBin") not in RISKS:
        raise ValueError("Invalid arm or prospective risk bin")
    if row.get("predecisionOnly") is not True:
        raise ValueError("Predecision integrity marker missing")
    p = row.get("propensity")
    if not isinstance(p, dict) or any(not isinstance(p.get(arm), (int, float)) or not 0 < p[arm] < 1 for arm in ARMS):
        raise ValueError("Each randomized arm must have positive propensity")
    if not all(math.isfinite(p[arm]) for arm in ARMS) or abs(sum(p[arm] for arm in ARMS) - 1) > 1e-9:
        raise ValueError("Propensities do not sum to unity")
    if any(not isinstance(row.get(k), (int,float)) or isinstance(row[k],bool) or not math.isfinite(row[k]) for k in ("startMs","windowEndMs")) or row["startMs"] < 0 or row["windowEndMs"] <= row["startMs"]:
        raise ValueError("Invalid window times")
    if not isinstance(row.get("complete"), bool) or row.get("censored") != (not row["complete"]):
        raise ValueError("Incorrect window censoring")
    if not all(isinstance(row.get(k), int) and not isinstance(row.get(k), bool) and row[k] >= 0 for k in ("plannedTicks", "executedTicks")) or row["executedTicks"] > row["plannedTicks"]:
        raise ValueError("Invalid tick execution")
    if row["assignment"] == "baseline" and row.get("interruptReason") is not None:
        raise ValueError("Baseline must not have micro interruption cause")
    o = row.get("outcome")
    if not isinstance(o, dict) or o.get("source") != "server-after-action":
        raise ValueError("Outcome provenance violation")
    if row["complete"]:
        if not isinstance(o.get("hitPositive"), bool) or not isinstance(o.get("hostileHits"), int) or isinstance(o.get("hostileHits"), bool) or o["hostileHits"] < 0:
            raise ValueError("Missing observed hit label")
        if o["hitPositive"] != (o["hostileHits"] > 0):
            raise ValueError("Hit-label contradiction")
    elif o.get("hitPositive") is not None or o.get("hostileHits") is not None:
        raise ValueError("Censored outcomes cannot be silently labeled as no hits")
    for k in ("damageTaken", "damageDealt", "shotsFired", "shotsLost"):
        if o.get(k) is not None and (not isinstance(o[k], (int, float)) or isinstance(o[k], bool) or not math.isfinite(o[k]) or o[k] < 0):
            raise ValueError(f"Invalid {k}")


def wilson(k, n, z=1.95996398454):
    if n == 0:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2*n)) / d
    m = z * ((p * (1-p) + z*z / (4*n)) / n) ** 0.5 / d
    return [round(max(0, c-m), 6), round(min(1, c+m), 6)]


def summarize_rows(rows):
    counts = Counter()
    by_risk = defaultdict(Counter)
    by_arm = defaultdict(Counter)
    for r in rows:
        arm, risk = r["assignment"], r["riskBin"]
        micro = arm != "baseline"
        interrupted = micro and r["interruptReason"] is not None
        complete = r["complete"]
        hit = complete and r["outcome"]["hitPositive"] is True
        for c in [counts, by_risk[risk], by_arm[arm]]:
            c["offers"] += 1
            c["micro"] += micro
            c["interruptions"] += interrupted
            c["complete"] += complete
            c["censored"] += not complete
            c["hitPositive"] += hit
            c["executedTicks"] += r["executedTicks"] if micro else 0
            c["plannedTicks"] += r["plannedTicks"] if micro else 0
    def finish(c):
        m = c["micro"]
        return {**{k: c[k] for k in ("offers", "micro", "interruptions", "complete", "censored", "hitPositive", "executedTicks", "plannedTicks")},
            "interruptionRateAmongMicro": round(c["interruptions"] / m, 6) if m else None,
            "interruptionWilson95": wilson(c["interruptions"], m),
            "hitPositiveAmongComplete": round(c["hitPositive"] / c["complete"], 6) if c["complete"] else None,
            "executionFraction": round(c["executedTicks"] / c["plannedTicks"], 6) if c["plannedTicks"] else None}
    return {"all": finish(counts),
        "byRisk": {k: finish(by_risk[k]) for k in RISKS},
        "byArm": {k: finish(by_arm[k]) for k in ARMS}}


def cluster_bootstrap_interruption(rows, *, replicates=2000, seed=3503):
    """Bootstrap per prospective setup (not per-offer) for engineering rate."""
    groups = defaultdict(list)
    for row in rows:
        groups[row["setupId"]].append(row)
    keys = sorted(groups)
    if len(keys) < 2:
        return {"status": "INSUFFICIENT_CLUSTERS", "clusters": len(keys)}
    randomizer = random.Random(seed)
    estimates = []
    for _ in range(replicates):
        sample = [randomizer.choice(keys) for __ in keys]
        n = sum(1 for key in sample for r in groups[key] if r["assignment"] != "baseline")
        k = sum(1 for key in sample for r in groups[key] if r["assignment"] != "baseline" and r["interruptReason"] is not None)
        if n:
            estimates.append(k / n)
    estimates.sort()
    if not estimates:
        return {"status": "NO_MICRO_ASSIGNMENTS", "clusters": len(keys)}
    def quantile(p):
        return round(estimates[int((len(estimates)-1) * p)], 6)
    return {"status": "DESCRIPTIVE_ONLY", "clusters": len(keys),
            "bootstrap95": [quantile(.025), quantile(.975)], "replicates": replicates}


def load_preoffers(paths):
    records = []
    seen = set()
    for path in paths:
        for line_no, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(),1):
            if not line.strip():
                continue
            r=json.loads(line, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"nonfinite JSON constant {value}")))
            if not isinstance(r,dict) or r.get("schema") != "fpsarena-c35c-preoffer-v1" or r.get("predecisionOnly") is not True:
                raise ValueError(f"{path}:{line_no}: invalid preoffer provenance")
            if r.get("policy") is not None and r["policy"] not in ("legacy80","hierarchical80"):
                raise ValueError(f"{path}:{line_no}: invalid prospective policy")
            if not isinstance(r.get("nowMs"),(int,float)) or isinstance(r["nowMs"],bool) or not math.isfinite(r["nowMs"]) or r["nowMs"] < 0:
                raise ValueError(f"{path}:{line_no}: invalid prospective timestamp")
            if not isinstance(r.get("eligible"),bool) or r.get("riskBin") not in RISKS:
                raise ValueError(f"{path}:{line_no}: invalid prospective eligibility")
            if not isinstance(r.get("predecisionReason"),str) or not r.get("predecisionReason"):
                raise ValueError(f"{path}:{line_no}: missing predecision refusal cause")
            for key in ("attemptId","matchId","setupId"):
                if not isinstance(r.get(key),str) or not r[key]:
                    raise ValueError(f"{path}:{line_no}: missing {key}")
            if r["attemptId"] in seen:
                raise ValueError(f"duplicate preoffer attemptId {r['attemptId']}")
            seen.add(r["attemptId"])
            records.append(r)
    return records


def summarize_preoffers(rows):
    by_reason=Counter()
    by_risk=defaultdict(Counter)
    for row in rows:
        if not row["eligible"]:
            by_reason[row["predecisionReason"]]+=1
        by_risk[row["riskBin"]]["attempted"]+=1
        by_risk[row["riskBin"]]["eligible"]+=row["eligible"]
    return {"attempts":len(rows),"eligiblePreoffers":sum(row["eligible"] for row in rows),
      "blockedPreoffers":sum(not row["eligible"] for row in rows),
      "blockedReasons":dict(sorted(by_reason.items())),
      "byProspectiveRisk":{risk:{"attempted":by_risk[risk]["attempted"],
       "eligible":by_risk[risk]["eligible"],
       "eligibilityRate":round(by_risk[risk]["eligible"]/by_risk[risk]["attempted"],6) if by_risk[risk]["attempted"] else None}
       for risk in RISKS}}


def audit_c35b(path):
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    dose = doc["byDose"]
    for k in ("80", "120", "160"):
        d = dose[k]
        assert d["interrupted"] <= d["micro"] <= d["offers"]
        assert abs(d["interrupted"]/d["micro"] - d["interruptRate"]) < 1e-8
    assert sum(v["offers"] for v in dose.values()) == doc["offers"]
    assert sum(v["micro"] for v in dose.values()) == doc["micro"]
    assert sum(v["interrupted"] for v in dose.values()) == doc["interruptedMicro"]
    assert sum(doc["interruptionReasons"].values()) == doc["interruptedMicro"]
    return {"status":"PASS_AGGREGATED_ARITHMETIC_ONLY",
        "80msRate": dose["80"]["interruptRate"],
        "120msRate": dose["120"]["interruptRate"],
        "160msRate": dose["160"]["interruptRate"],
        "160Minus80PercentagePoints":round((dose["160"]["interruptRate"] - dose["80"]["interruptRate"])*100,3),
        "note":"Aggregate audit is NOT a replay, causal analysis, or verification of source bytes."}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jsonl", nargs="*", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--preoffers", nargs="*", type=Path, help="Optional pre-randomization audit JSONL")
    parser.add_argument("--audit-c35b", type=Path)
    parser.add_argument("--require-linked-preoffers", action="store_true", help="Fail if a randomized offer lacks an eligible prospective attempt and matching policy")
    args=parser.parse_args()
    if args.audit_c35b:
        result=audit_c35b(args.audit_c35b)
    else:
        if not args.jsonl:
            parser.error("Provide C35C JSONL files or --audit-c35b")
        rows=load_jsonl(args.jsonl)
        result={"schema":"fpsarena-c35c-descriptive-summary-v1",
            "stage":"RESEARCH-ONLY-NOT-CAUSAL", "offers":len(rows),
            "setups":len({r["setupId"] for r in rows}),
            "matches":len({r["matchId"] for r in rows}),
            **summarize_rows(rows),
            "setupClusterInterruption": cluster_bootstrap_interruption(rows),
            "gates": {"C16Safety":"REQUIRES_FULL_ENGINE_REPLAY",
                "C36NeuralTraining":"BLOCKED_PENDING_POWER_AND_SEALED_EVALUATION",
                "productionPromotion":"NO"},
            "warning":"Public decision bins are not calibrated damage probabilities; no combat-efficacy inference."}
        if args.preoffers:
            pre=load_preoffers(args.preoffers)
            result["preofferAudit"]=summarize_preoffers(pre)
            result["preofferAudit"]["comparisonToAssignedOffers"] = (
                "INVALID: more assignments than predecision eligibilities" if len(rows) > result["preofferAudit"]["eligiblePreoffers"]
                else "DESCRIPTIVE: assignment count <= predecision eligibilities")
            if len(rows) > result["preofferAudit"]["eligiblePreoffers"]:
                raise ValueError("Assignment count exceeds prospectively eligible offer count")
            if args.require_linked_preoffers:
                result["linkageAudit"] = audit_prospective_linkage(pre, rows)
                result["matchedSetupBootstrap"] = matched_setup_bootstrap(pre, rows)
        elif args.require_linked_preoffers:
            raise ValueError("--require-linked-preoffers needs --preoffers")
    rendered=json.dumps(result,indent=2,ensure_ascii=False)+"\n"
    if args.out:
        args.out.parent.mkdir(parents=True,exist_ok=True)
        args.out.write_text(rendered,encoding="utf-8")
    print(rendered)

if __name__ == "__main__":
    main()
