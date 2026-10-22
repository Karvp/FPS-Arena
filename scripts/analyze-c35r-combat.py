#!/usr/bin/env python3
"""Independent C35-R accounting. No hit-based hindsight enters public decision rows.
No inferred causal damage or kill attribution: result.damageDealt includes abilities.
"""
from collections import Counter,defaultdict
from pathlib import Path
import argparse,csv,json,hashlib,random,math
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads(Path(p).read_text())
def metrics(j):
 a=j['aggregate'];return {k:a[k] for k in ('shots','hits','kills','deaths','meters','agentErrors')}
def verify_one(base):
 get=lambda x:load(str(base)+'.'+x+'.json')['traces'][0]
 ball,dec,confidence=get('ballistic'),get('decision'),get('confidence')
 result=load(str(base)+'.result.json')
 assert result['aggregate']['agentErrors']==0
 bs=ball['counts'];dc=dec['counts'];cc=confidence['counts']
 assert bs['confirmedShots']==result['aggregate']['shots']==dc['confirmedShots']==cc['confirmedShots']
 assert bs['confirmedPellets']==sum(len(shot['pellets']) for r in ball['rows'] for shot in r['authoritativeFiringTimeShots'])
 assert dc['modifiedCommands']==bs['fireModified']==0
 assert dc['candidateSamples']==len(dec['rows'])+dc['storedDropped']
 assert all(r['publicBeforeStep']['provenance']=='PUBLIC_BEFORE_STEP_ONLY' for r in dec['rows'])
 assert all('pellets' not in json.dumps(r['publicBeforeStep']) for r in dec['rows'])
 tally=Counter();shotKinds=Counter();hits=0;shots=0
 for row in ball['rows']:
  for shot in row['authoritativeFiringTimeShots']:
   shots+=1;seen=set()
   for pellet in shot['pellets']:
    category=pellet['hitKind']
    if category=='world':category='dynamic-foam' if pellet['worldKind']=='dynamic-foam' else 'static-cover'
    tally[category]+=1;seen.add(category)
   if 'player' in seen: hits+=1
   for typ in seen:shotKinds[typ]+=1
 assert shots==bs['confirmedShots']
 assert sum(tally.values())==bs['confirmedPellets']
 return dict(result=metrics(result),pellets=dict(tally),shotKinds=dict(shotKinds),playerHitShots=hits,
             candidateSamples=dc['candidateSamples'],candidateEligible=dc['sampledEligible'],noFireSamples=dc['noFireSamples'],reasons=dc['reasonCounts'])
def analyze(folder):
 d=load(folder/'FROZEN-DESIGN.json');audit=load(folder/'EXECUTION-AUDIT.json')
 assert len(d['cases'])==len(audit['matches'])
 assert {c['id'] for c in d['cases']}=={a['id'] for a in audit['matches']}
 rows=[];perGun=defaultdict(lambda:dict(shots=0,kills=0,deaths=0,pellets=Counter(),playerHitShots=0,samples=0,eligible=0))
 for c in d['cases']:
  prefix=folder/'matches'/c['id']
  r=load(str(prefix)+'.result.json');m=metrics(r)
  auditShot=verify_one(prefix) if c['policy']=='shadow80' else None
  row={**c,**m,'playerHitShots':auditShot['playerHitShots'] if auditShot else None,
      'pellets':sum(auditShot['pellets'].values()) if auditShot else None}
  rows.append(row)
  if auditShot:
   g=perGun[c['gun']];g['shots']+=m['shots'];g['kills']+=m['kills'];g['deaths']+=m['deaths'];g['playerHitShots']+=auditShot['playerHitShots'];
   g['pellets'].update(auditShot['pellets']);g['samples']+=auditShot['candidateSamples'];g['eligible']+=auditShot['candidateEligible']
 allRows=[]
 for setup in sorted({r['setupId'] for r in rows}):
  pair=[r for r in rows if r['setupId']==setup];assert len(pair)==2
  assert len({(a['seed'],a['map'],a['gun'],a['lagMs'],a['seconds'],a['bots'],a['opponents']) for a in pair})==1
  base=next(x for x in pair if x['policy']=='release');research=next(x for x in pair if x['policy']=='shadow80')
  allRows.append({**{k:base[k] for k in ('setupId','map','gun','seed','lagMs')},
     **{k+'Original':base[k] for k in ('shots','hits','kills','deaths','meters')},
     **{k+'Research':research[k] for k in ('shots','hits','kills','deaths','meters')},
     'researchPlayerHitShots':research['playerHitShots'],'researchPellets':research['pellets']})
 sums={p:{k:sum(r[k] for r in rows if r['policy']==p) for k in ('shots','hits','kills','deaths','meters','agentErrors')} for p in ('release','shadow80')}
 rng=random.Random(20261013);clusters=len(allRows);boots={k:[] for k in ('kills','shots','hits','deaths','meters')}
 for _ in range(10000):
  subset=[allRows[rng.randrange(clusters)] for __ in range(clusters)]
  for k in boots:
   a=sum(z[k+'Original'] for z in subset);b=sum(z[k+'Research'] for z in subset)
   boots[k].append(b/a if a>0 else None)
 def ci(values):
  a=sorted(x for x in values if x is not None)
  return [round(a[int(len(a)*.025)],4),round(a[int(len(a)*.975)-1],4)] if len(a)>9000 else None
 pairedCI={k:ci(v) for k,v in boots.items()}
 summary={'schema':'fpsarena-c35r-decision-loss-analysis-v1','matches':len(rows),'pairedSetups':len(allRows),
          'totalSimulatedSeconds':sum(r['seconds'] for r in rows),
          'pairedClusterBootstrapRatio95':pairedCI,'bootstrapReplications':10000,
          'policies':sums,
          'researchShotBreakdown':{k:{**{z:v for z,v in g.items() if z!='pellets'},'pellets':dict(g['pellets'])} for k,g in perGun.items()},
          'caveats':['damageDealt and kills cannot be causally attributed to shots (abilities and opponents interfere)',
                     'pellet events are dependent inside shotgun shots','no-fire snapshots are diagnostic, not guaranteed lost firing opportunities',
                     'same initial conditions do not imply identical trajectories after C21 micro intervention',
                     'C35R is passive; comparison is release versus shadow80 research, NOT two production AI versions']}
 out=folder/'C35R-ANALYSIS.json';out.write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n')
 csvpath=folder/'C35R-TDM-PAIRED.csv'
 with csvpath.open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(allRows[0]));w.writeheader();w.writerows(allRows)
 return summary
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--folder',default=str(ROOT/'reports/c35r/paired-24-v1'));args=ap.parse_args()
 print(json.dumps(analyze(Path(args.folder)),indent=2))
