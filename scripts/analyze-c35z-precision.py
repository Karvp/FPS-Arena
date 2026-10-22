#!/usr/bin/env python3
"""Matched setup analysis; prevents treating shots/random assignments as independent matches."""
import csv,json,random,collections
from pathlib import Path
R=Path(__file__).resolve().parents[1];O=R/'reports/c35z/precision-36'
def load(x):return json.loads(Path(x).read_text())
def main():
 d=load(O/'FROZEN-DESIGN.json'); audit=load(O/'INDEPENDENT-AUDIT.json');arm=('release','observe','precision');by=collections.defaultdict(dict);rows=[]
 for c in d['cases']:
  a=load(O/'matches'/f'{c["id"]}.result.json')['aggregate'];stats={k:a[k] for k in ('kills','deaths','shots','hits','agentErrors')}
  by[c['setupId']][c['arm']]=stats;rows.append(dict(setup=c['setupId'],arm=c['arm'],weapon=c['gun'],map=c['map'],lagMs=c['lagMs'],**stats))
 with (O/'TDM-THREE-ARM.csv').open('w',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
 totals={a:{k:sum(x[a][k]for x in by.values())for k in ('kills','deaths','shots','hits','agentErrors')}for a in arm}
 rng=random.Random(35026);names=sorted(by);boot={k:[]for k in ('killsRatio','deathsRatio','shotsRatio','killsDifference')}
 for _ in range(6000):
  sample=[by[rng.choice(names)]for _ in names]
  for k,name in [('kills','killsRatio'),('deaths','deathsRatio'),('shots','shotsRatio')]:
   den=sum(x['observe'][k]for x in sample);num=sum(x['precision'][k]for x in sample)
   if den:boot[name].append(num/den)
  boot['killsDifference'].append(sum(x['precision']['kills']-x['observe']['kills']for x in sample))
 def ci(v):return [round(sorted(v)[int((len(v)-1)*p)],4)for p in (.025,.975)]if v else None
 out=dict(schema='fpsarena-c35z-precision-analysis-v1',setupCount=len(by),games=len(rows),secondsPerGame=75,
  byArm=totals,pairedBootstrap6000={k:ci(v)for k,v in boot.items()},exposureByGun=audit['exposureByGun'],
  legacyC35YSniperOffers=0, interpretation='Randomized assignment provides one-tick ITT; exposure not proof of better gameplay; no model promoted')
 (O/'PRECISION-ANALYSIS.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if __name__=='__main__':main()
