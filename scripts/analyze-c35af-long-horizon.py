#!/usr/bin/env python3
"""Independent C35-AF frozen trial audit, cluster bootstrap & propensity ITT."""
from pathlib import Path
import json,hashlib,random,csv,statistics,math
R=Path(__file__).resolve().parents[1];O=R/'reports/c35af/frozen-54';M=O/'matches'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def mix32(x):
 x=(x+0x9e3779b9)&0xffffffff;x=((x^(x>>16))*0x85ebca6b)&0xffffffff;x=((x^(x>>13))*0xc2b2ae35)&0xffffffff;return (x^(x>>16))&0xffffffff
def assignment(seed,i):return 'control' if mix32((seed ^ ((i*0x69ba01d3)&0xffffffff) ^ 0xc35ad734)&0xffffffff)<0x80000000 else 'toggle'
def get(p):return json.loads(p.read_text())
d=get(O/'FROZEN-DESIGN.json');exe=get(O/'EXECUTION-AUDIT.json');reg=sha(O/'FROZEN-DESIGN.json')
assert exe['registrationSHA256']==reg and len(exe['cases'])==54 and len(d['cases'])==54
assert all(sha(R/k)==v for k,v in d['sourceSHA256'].items()),'source changed after prereg'
for run in exe['cases']:
 for k,v in run['sha256'].items():
  assert sha(Path(str(M/run['id'])+'.'+k+'.json'))==v,(run['id'],k)
per=[];long=[];gun={};allshots=0;allpellets=0;c21=0;offers=0;completed=0;changed=0
for c in d['cases']:
 b=M/c['id'];result=get(Path(str(b)+'.result.json'));assert result['aggregate']['agentErrors']==0,c['id'];m=result['results'][0]
 per.append(dict(setupId=c['setupId'],arm=c['arm'],gun=c['gun'],map=c['map'],seed=c['seed'],lagMs=c['lagMs'],kills=m['kills'],deaths=m['deaths'],shots=m['shots'],hits=m['hits'],damageDealt=m['damageDealt'],damageTaken=m['damageTaken'],errors=m['errors']))
 if c['arm']=='release':continue
 ad=get(Path(str(b)+'.prefire.json'))['traces'][0];aa=get(Path(str(b)+'.aim.json'))['traces'][0];cc=get(Path(str(b)+'.dataset.json'))
 assert aa['counts']['shots']==m['shots'] and sum(r['serverLabelsAfterStep']['pelletCount'] for r in aa['rows'])==aa['counts']['pellets']
 allshots+=aa['counts']['shots'];allpellets+=aa['counts']['pellets'];assert ad['counts']['fireModified']==0
 if c['arm']=='observe':assert ad['rows']==[];continue
 af=get(Path(str(b)+'.long.json'))['traces'][0]
 assert af['counts']['overlaps']==0 and af['counts']['assignments']==len(af['rows'])==len(ad['rows']);offers+=len(af['rows']);changed+=ad['counts']['changedTicks'];completed+=af['counts']['completed']
 assert af['counts']['censored']+af['counts']['completed']==len(af['rows'])
 prev=-1e10
 for x,y in zip(af['rows'],ad['rows']):
  assert x['index']==y['index'] and x['assignedArm']==y['assignedArm']==assignment(c['seed'],x['index'])
  assert x['propensity']==.5 and y['propensity']==.5 and x['baselineADS']==y['baselineADS'];assert x['unselectedOutcome'] is None and y['unselectedOutcome'] is None
  assert x['start']>=prev+3.0-1e-4;prev=x['start'];assert x['features']==y['publicFeatures']
  if x['factual']['complete']:
   o=x['factual'];assert o['netDamage']==o['damageDealt']-o['damageTaken'] and o['survived']==(o['deathCount']==0)
   assert all(v>=0 for k,v in o.items() if k in ('shots','hits','damageDealt','damageTaken','ownKills','deathCount'))
   long.append(dict(setupId=c['setupId'],gun=c['gun'],baselineADS=x['baselineADS'],arm=x['assignedArm'],propensity=.5,netDamage=o['netDamage'],damageDealt=o['damageDealt'],damageTaken=o['damageTaken'],kills=o['ownKills'],deaths=o['deathCount'],survived=int(o['survived']),shots=o['shots'],hitEvents=o['hits'],aimAngleDeg=x['features']['aimAngleDeg'],targetRange=x['features']['targetRange'],speed=x['features']['speed'],lagMs=c['lagMs']))
# Long-horizon IPS with constant randomized propensity. Cluster-bootstrap standardized arm means.
groups={s:[r for r in long if r['setupId']==s] for s in sorted(set(r['setupId'] for r in long))};setups=sorted(groups)
def stats(rows,field,stratum=None):
 x=[r for r in rows if stratum is None or r['baselineADS']==stratum];arms={a:[r[field] for r in x if r['arm']==a] for a in ('control','toggle')};n=len(x)
 return dict(n=n,controlN=len(arms['control']),toggleN=len(arms['toggle']),controlMean=round(statistics.mean(arms['control']),5) if arms['control'] else None,
 toggleMean=round(statistics.mean(arms['toggle']),5) if arms['toggle'] else None,
 diff=round(statistics.mean(arms['toggle'])-statistics.mean(arms['control']),5) if all(arms.values()) else None,
 ipsDiff=round(sum((2 if r['arm']=='toggle' else -2)*r[field] for r in x)/n,5) if n else None)
random.seed(20261014);samples=[]
for _ in range(5000):
 chosen=[random.choice(setups) for i in setups];rows=[r for s in chosen for r in groups[s]]
 ar=stats(rows,'netDamage');b=stats(rows,'survived');k=stats(rows,'kills');samples.append(dict(net=ar['ipsDiff'],surv=b['ipsDiff'],kills=k['ipsDiff']))
def ci(k):
 x=sorted(v[k] for v in samples if v[k] is not None);return [x[int(len(x)*.025)],x[min(len(x)-1,int(len(x)*.975))]]
summary={'schema':'fpsarena-c35af-independent-analysis-v1','registrationSHA256':reg,'setups':len(setups),'matches':len(per),'byArm':{arm:{field:round(sum(x[field] for x in per if x['arm']==arm),3) for field in ('kills','deaths','shots','hits','damageDealt','damageTaken','errors')} for arm in ('release','observe','randomized')},'longHorizon':{'offered':offers,'completed':completed,'censored':offers-completed,'changedTicks':changed,'byInitialADS':{z:sum(r['baselineADS']==z for r in long) for z in (True,False)},'netDamage':stats(long,'netDamage'),'survived':stats(long,'survived'),'kills':stats(long,'kills'),'deaths':stats(long,'deaths'),'damageTaken':stats(long,'damageTaken'),'hitEvents':stats(long,'hitEvents'),'ipsClusterBootstrap95':{'netDamage':ci('net'),'survived':ci('surv'),'kills':ci('kills')},'byADSInitial':{str(z):{f:stats(long,f,z) for f in ('netDamage','survived','kills','damageTaken')} for z in (True,False)},'byGun':{g:{'count':sum(r['gun']==g for r in long),'netDamage':stats([r for r in long if r['gun']==g],'netDamage')} for g in sorted(set(r['gun'] for r in long))}},'serverShotAudit':{'auditedResearchShots':allshots,'auditedResearchPellets':allpellets},'productionChanged':False,'limitations':['Within-setup windows not independent','Randomization on eligible pre-fire tick only, 0.28s ADS intervention','IPW bootstrapped by 18 setups, wide and exploratory','Data not a general long-term state action value','No causal labels for unchosen ADS choices']}
(O/'INDEPENDENT-ANALYSIS.json').write_text(json.dumps(summary,indent=2)+'\n')
for name,records in [('TDM-THREE-ARM.csv',per),('LONG-HORIZON-FACTUAL.csv',long)]:
 with (O/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
print(json.dumps(summary,indent=2))
