#!/usr/bin/env python3
"""C35AD setup-cluster bootstrap for prefire ADS ITT and match-level outcomes."""
from pathlib import Path
from collections import defaultdict
import json,random,csv
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/c35ad/matched-72'
def read(p):return json.loads(Path(p).read_text())
def ci(values):
 s=sorted(values);return [round(s[int(.025*(len(s)-1))],6),round(s[int(.975*(len(s)-1))],6)] if s else None
def main():
 audit=read(OUT/'INDEPENDENT-AUDIT.json');d=read(OUT/'FROZEN-DESIGN.json');rng=random.Random(35542026)
 cases=d['cases'];outcomes={};setups={};matches=[]
 for c in cases:
  a=read(OUT/'matches'/(c['id']+'.result.json'))['aggregate'];outcomes[(c['setupId'],c['arm'])]=a;setups[c['setupId']]=c['gun']
 for setup,gun in sorted(setups.items()):
  line={'setup':setup,'gun':gun}
  for arm in ('release','observe','randomized'):
   for k in ('kills','deaths','shots','hits'):line[arm+'_'+k]=outcomes[(setup,arm)][k]
  matches.append(line)
 with (OUT/'MATCHED-RESULTS.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(matches[0]));w.writeheader();w.writerows(matches)
 keys=list(setups);ratio=lambda z,k:sum(outcomes[(x,'randomized')][k] for x in z)/max(1,sum(outcomes[(x,'observe')][k] for x in z))
 rbootstrap=[ratio([rng.choice(keys) for _ in keys],'kills') for _ in range(5000)]
 factual=[q for q in audit['rows'] if q['complete']]
 treatment={}
 for stratum in (False,True):
  cohort=[q for q in factual if q['baselineADS']==stratum];arms={a:[q for q in cohort if q['arm']==a] for a in ('control','toggle')}
  def summary(q):return {'offers':len(q),'meanShotsPerOfferedWindow':sum(x['shots'] for x in q)/len(q) if q else None,'meanHitShotsPerOfferedWindow':sum(x['hitShots'] for x in q)/len(q) if q else None,'meanKillEvents':sum(x['kills'] for x in q)/len(q) if q else None,'meanDamageTaken':sum(x['damageTaken'] for x in q)/len(q) if q else None}
  clusters=sorted({x['setup'] for x in cohort});boot=[]
  if clusters:
   for _ in range(5000):
    drawn=[q for sid in [rng.choice(clusters) for _ in clusters] for q in cohort if q['setup']==sid];b=[q for q in drawn if q['arm']=='control'];t=[q for q in drawn if q['arm']=='toggle']
    if b and t:boot.append(sum(x['hitShots'] for x in t)/len(t)-sum(x['hitShots'] for x in b)/len(b))
  treatment['baselineADS' if stratum else 'baselineHIP']={'setupCount':len(clusters),'byArm':{arm:summary(arms[arm]) for arm in arms},'hitShotITTDeltaCI95':ci(boot),'bootstrapReplicates':len(boot)}
 bygun=defaultdict(lambda:{'total':0,'control':0,'toggle':0,'changedTicks':0,'factualShots':0})
 for q in audit['rows']:
  b=bygun[q['weapon']];b['total']+=1;b[q['arm']]+=1;b['changedTicks']+=q['changedTicks'];b['factualShots']+=q['shots']
 res=dict(schema='fpsarena-c35ad-analysis-v1',designSHA256=read(OUT/'EXECUTION-AUDIT.json')['registrationSHA256'],matchCount=len(cases),minutesSimulated=sum(c['seconds'] for c in cases)/60,
  matchedKillRatioRandomizedObserve=ratio(keys,'kills'),pairedSetupBootstrapCI95=ci(rbootstrap),byArm=audit['byArm'],offers=len(audit['rows']),completedFactualWindows=len(factual),
  censoredWindows=len(audit['rows'])-len(factual),strata=treatment,byGun=dict(bygun),
  caveat='Randomized assignment occurs on non-firing ticks; later fire is observational, not guaranteed. The causal estimand is eligible prefire ITT on 0.7s window. Repeated offers correlated within setup; no conclusions about permanent ADS policy or long-run neural controller.')
 (OUT/'ANALYSIS.json').write_text(json.dumps(res,indent=2,sort_keys=True)+'\n');print(json.dumps(res,indent=2,sort_keys=True))
if __name__=='__main__':main()
