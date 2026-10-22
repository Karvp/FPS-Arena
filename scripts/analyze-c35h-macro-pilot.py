#!/usr/bin/env python3
"""Independent C35-H ledger verifier and paired cluster uncertainty. No cherry-picking."""
from pathlib import Path
import hashlib,json,random,math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35h/pilot-18-pairs'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def hash32(x):
 x=(x+0x9e3779b9)&0xffffffff;x=((x^(x>>16))*0x85ebca6b)&0xffffffff
 x=((x^(x>>13))*0xc2b2ae35)&0xffffffff;return (x^(x>>16))&0xffffffff
def assigned(seed,n):
 h=hash32((seed^((n*0x517cc1b7)&0xffffffff)^0xc21f7a39)&0xffffffff)
 return ['baseline','micro-left','micro-right'][min(2,h*3//4294967296)]
def pct(a,p):a=sorted(a);return a[int((len(a)-1)*p)]
def load(c,reg):
 pre=OUT/'matches'/c['id']; files={k:Path(str(pre)+f'.{k}.json') for k in ['macro','fire','dataset','result']}
 data={k:json.loads(f.read_text()) for k,f in files.items()}
 r=data['result'];m=data['macro']['traces'][0];f=data['fire']['traces'][0];d=data['dataset']['matches'][0];fc=f['counts'];mc=m['counts']
 if data['dataset']['registrationSHA256']!=reg or m['policy']!=c['policy'] or d['metadata']['policy']!='shadow80':raise ValueError('registration/policy mismatch '+c['id'])
 if fc['serverShots']!=r['aggregate']['shots'] or fc['serverShots']!=sum(row['shots'] for row in f['rows']):raise ValueError('server shot ledger mismatch')
 if r['aggregate']['agentErrors'] or fc['fireSuppressionTicks'] or fc['fireInjectionTicks'] or fc['incumbentFireTicks']!=fc['appliedFireTicks']:
  raise ValueError('C35H fire-invariant failure')
 if mc['otherControlsModified'] or mc['incumbentFireModified'] or mc['modifiedTicks']!=sum(e['deliveredTicks'] for e in m['events']):raise ValueError('C35H motor tick corruption')
 if c['policy']=='observe' and mc['modifiedTicks']!=0:raise ValueError('shadow mutated command')
 if mc['modifiedTicks']>0 and fc['movementModifiedTicks']<mc['modifiedTicks']:raise ValueError('macro edits absent from Game.step')
 if len(d['offers'])!=len(d['c35c']['offers']):raise ValueError('C35C ledger orphan')
 if d['diagnostics']['interventionTicks']!=sum(o['executedTicks'] for o in d['offers'] if o['assignedAction']!='baseline'):raise ValueError('C16 dose mismatch')
 preoffers={x['attemptId'] for x in d['c35c']['preoffers'] if x['eligible']}
 for i,o in enumerate(d['offers'],1):
  if o['assignedAction']!=assigned(c['seed'],i) or o['propensity']!=1/3 or o['c35c']['attemptId'] not in preoffers:
   raise ValueError('C21 / preassignment mismatch '+c['id'])
  if o['candidateSet']!=['baseline','micro-left','micro-right']:raise ValueError('C16 arm asymmetry')
 return {'setupId':c['setupId'],'policy':c['policy'],'shots':fc['serverShots'],'originalFire':fc['incumbentFireTicks'],
  'fireAndMotion':fc['fireAndMotionTicks'],'movementModified':fc['movementModifiedTicks'],
  'microTicks':d['diagnostics']['interventionTicks'],'preoffers':d['c35c']['diagnostics']['attempts'],
  'macroModified':mc['modifiedTicks'],'macroEligible':mc['eligible'],
  'kills':r['aggregate']['kills'],'hits':r['aggregate']['hits'],
  'damageDealt':r['results'][0]['damageDealt'],'damageTaken':r['results'][0]['damageTaken']}
if __name__=='__main__':
 plan=json.loads((OUT/'FROZEN-DESIGN.json').read_text());audit=json.loads((OUT/'EXECUTION-AUDIT.json').read_text());reg=sha(OUT/'FROZEN-DESIGN.json')
 if audit['registrationSHA256']!=reg:raise ValueError('frozen design changed')
 for f,h in plan['sourceSHA256'].items():
  if sha(ROOT/f)!=h:raise ValueError('source drift: '+f)
 regFiles={x['id']:x for x in audit['files']};rows={}
 for c in plan['cases']:
  for kind,h in regFiles[c['id']]['sha'].items():
   if sha(OUT/'matches'/(c['id']+'.'+kind+'.json'))!=h:raise ValueError('artifact drift '+c['id'])
  result=load(c,reg);rows[(c['setupId'],c['policy'])]=result
 ids=sorted(set(c['setupId'] for c in plan['cases']))
 for i in ids:
  if (i,'observe') not in rows or (i,'lateral') not in rows:raise ValueError('missing pair')
 arms={p:[rows[(i,p)] for i in ids] for p in ['observe','lateral']}
 stats={p:{k:sum(x[k] for x in cohort) for k in ['shots','originalFire','fireAndMotion','movementModified','microTicks','preoffers','macroModified','macroEligible','kills','hits','damageDealt','damageTaken']} for p,cohort in arms.items()}
 rng=random.Random(35020213)
 def ratio(keys,field):
  b=sum(rows[(i,'observe')][field] for i in keys);a=sum(rows[(i,'lateral')][field] for i in keys)
  return a/b if b else None
 boot={}
 for field in ['shots','originalFire','microTicks','hits','kills','damageTaken']:
  vals=[ratio([rng.choice(ids) for _ in ids],field) for _ in range(5000)];vals=[v for v in vals if v is not None]
  boot[field]={'ratio':ratio(ids,field),'CI95':[pct(vals,.025),pct(vals,.975)],'lower5':pct(vals,.05)} if vals else None
 passed=(boot['shots']['lower5']>=.95 and boot['microTicks']['lower5']>=.95 and stats['lateral']['macroModified']>0)
 out={'schema':'fpsarena-c35h-fire-compatible-macro-analysis-v1','designSHA256':reg,
  'matches':len(plan['cases']),'setups':len(ids),'minutesSimulated':sum(c['seconds'] for c in plan['cases'])/60,
  'status':'RESEARCH_ONLY_NO_PROMOTION' if not passed else 'RESEARCH_GATE_ONLY_REQUIRE_CONFIRMATORY_REPLICATION',
  'fireAndC21Safety':'PASS','totals':stats,'setupClusterBootstrap5000':boot,
  'limit':['matched seeds permit diverging match trajectories','shots are not target-value adjusted','18 setup clusters and sparse hits','new macro-fire gate separate from C16 micro safety']}
 (OUT/'RESULTS.json').write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
 print('C35H VERIFIED',out['matches'],'matches',out['setups'],'pairs',out['minutesSimulated'],'minutes')
 print('SHOTS',stats['observe']['shots'],stats['lateral']['shots'],'ratio',boot['shots'])
 print('MICRO ticks',stats['observe']['microTicks'],stats['lateral']['microTicks'],'ratio',boot['microTicks'])
 print('MACRO modified',stats['lateral']['macroModified'],'C35H status',out['status'])
