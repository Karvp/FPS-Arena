#!/usr/bin/env python3
"""FPS Arena v2.9.11 paired, seeded engagement lab evaluation.

Commands exercise bundled page-agent.js and authoritative Game.step(), not unit
mock movement. No promotion is inferred automatically from a limited sample.
"""
from pathlib import Path
import argparse
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
PROFILES = ("release", "director-engagement-shadow-lab", "director-opportunity-lab",
            "director-engagement-lab", "director-engagement-trial-lab")
SCENARIOS = (
    ("arena-shotgun-regression", "arena", "benelli_m4", 999702, 75, False),
    ("arena-smg-regression", "arena", "mp5sd", 999703, 75, False),
    ("foundry-shotgun-holdout", "foundry", "benelli_m4", 911104, 80, False),
    ("arena-shotgun-holdout", "arena", "benelli_m4", 911105, 80, False),
    ("foundry-shotgun-natural", "foundry", "benelli_m4", 911106, 400, True),
    ("arena-smg-natural", "arena", "mp5sd", 911107, 400, True),
)
FIELDS = ("kills", "deaths", "shots", "hits", "firstShotAt", "firstHitAt",
          "damageTaken", "distance", "worldReversals", "duration", "finishedNaturally",
          "errors", "agentTimingMs", "directorDiagnosticCounts")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="Only run the two regression seeds")
    parser.add_argument("--natural", action="store_true", help="Also run both natural-end matches")
    parser.add_argument("--output", type=Path,
                        default=ROOT / "reports" / "v2911" / "REPRO-EVAL.json")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scenarios = SCENARIOS[:2] if args.quick else SCENARIOS[:4]
    if args.natural:
        scenarios += SCENARIOS[4:]
    records = []
    for name, arena_map, weapon, seed, seconds, natural in scenarios:
        profiles = PROFILES if not natural else ("release", "director-engagement-lab",
                                                 "director-engagement-trial-lab")
        row = {"scenario": name, "seed": seed, "map": arena_map,
               "weapon": weapon, "naturalMatch": natural, "profiles": {}}
        for profile in profiles:
            raw = args.output.parent / f"{name}_{profile}.json"
            command = ["node", "lab/arena/train.mjs", "--profile", profile,
                       "--modes", "tdm", "--seconds", str(seconds), "--seed", str(seed),
                       "--classic-maps", arena_map, "--bots", "5", "--opponents", "stress",
                       "--trainee-primary", weapon, "--lag-ms", "65",
                       "--profile-agent", "--out", str(raw)]
            if natural:
                command.append("--full-match")
            print("RUN", name, profile, flush=True)
            subprocess.run(command, cwd=ROOT, check=True, timeout=180)
            match = json.loads(raw.read_text())["results"][0]
            row["profiles"][profile] = {key: match.get(key) for key in FIELDS}
            print("  K/D", match["kills"], match["deaths"], "shots", match["shots"],
                  "firstShotAt", match["firstShotAt"], flush=True)
            args.output.write_text(json.dumps({"format": "fpsarena-2911-repro-v1",
                "scenarios": records + [row], "note": "Experimental profiles are not a release upgrade"}, indent=2))
        records.append(row)
        baseline = row["profiles"]["release"]
        shadow = row["profiles"]["director-engagement-shadow-lab"] if not natural else None
        if shadow:
            keys = ("kills", "deaths", "shots", "hits", "firstShotAt", "firstHitAt",
                    "distance", "worldReversals", "duration", "errors")
            if any(shadow.get(key) != baseline.get(key) for key in keys):
                print("WARNING: shadow diverged from baseline", name)
    print("WROTE", args.output)


if __name__ == "__main__":
    main()
