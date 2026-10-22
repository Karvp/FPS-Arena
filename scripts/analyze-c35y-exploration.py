#!/usr/bin/env python3
import json,random,csv,collections,statistics
from pathlib import Path
R=Path(__file__).resolve().parents[1];O=R/'reports/c35y/expansion-72'
def load(p):return json.loads(Path(p).read_text())
def main():
 d=load(O/'FROZEN-DESIGN.json'); grouped=collections.defaultdict(dict); details=[]
 for c in d['cases']:
  r=load(O/'matches'/f'{c["id"]}.result.json')['aggregate'];grouped[c['setupId']][c['arm']]=r
  details.append(dict(setup=c['setupId'],arm=c['arm'],gun=c['gun'],map=c['map'],lagMs=c['lagMs'],
   kills=r['kills'],deaths=r['deaths'],shots=r['shots'],hits=r['hits'],errors=r['agentErrors']))
 arms=('release','observe','explore');sum_arm={a:{k:sum(g[a][k] for g in grouped.values()) for k in ('kills','deaths','shots','hits','agentErrors')} for a in arms}
 rng=random.Random(35125);names=sorted(grouped);boots={k:[] for k in ('killsRatio','deathsRatio','shotsRatio')}
 for i in range(5000):
  s=[grouped[rng.choice(names)] for _ in names]
  for field,name in [('kills','killsRatio'),('deaths','deathsRatio'),('shots','shotsRatio')]:
   num=sum(x['explore'][field] for x in s);den=sum(x['observe'][field] for x in s)
   if den:boots[name].append(num/den)
 def ci(s):return [round(sorted(s)[int((len(s)-1)*q)],4) for q in (.025,.975)] if s else None
 with (O/'TDM-THREE-ARM.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=details[0].keys());w.writeheader();w.writerows(details)
 expo=collections.defaultdict(lambda:dict(offers=0,control=0,a=0,b=0,completed=0,censored=0))
 windows=[]
 for c in d['cases']:
  if c['arm']!='explore':continue
  w=load(O/'matches'/f'{c["id"]}.random.json')['traces'][0]
  a=expo[c['gun']]
  for r in w['rows']:
   a['offers']+=1;a[{'control':'control','alternative-a':'a','alternative-b':'b'}[r['assignedArm']]]+=1
   a['censored' if r['censored'] else 'completed']+=1
   if r['outcome'] is not None:windows.append(dict(setup=c['setupId'],gun=c['gun'],arm=r['assignedArm'],propensity=r['propensity'],hit=r['outcome']['hitWindow']))
 result=dict(schema='fpsarena-c35y-combat-analysis-v1',matches=len(details),setups=len(names),
   byArm=sum_arm,pairedSetupBootstrap5000ExplorationOverObserve95={k:ci(v) for k,v in boots.items()},
   exposureByWeapon=dict(expo),completeFactualWindows=len(windows),
   caveat='one-tick randomized ITT with subsequent decisions, not counterfactual trajectory Q; do not infer effect for empty gun/arm strata')
 (O/'EXPLORATION-ANALYSIS.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result,indent=2))
if __name__=='__main__':main()
