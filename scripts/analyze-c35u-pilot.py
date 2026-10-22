#!/usr/bin/env python3
"""Independent three-arm C35U audit, paired setup-level bootstrap, and CSV."""
import csv,hashlib,json,random,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'reports/c35u/weapon-balance-36-v1'
def read(p):return json.loads(p.read_text())
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1<<20),b''):h.update(block)
 return h.hexdigest()
def quantile(xs,q):
 x=sorted(xs);return x[int(round(q*(len(x)-1)))]
def ratio_ci(pairs,x,y,field,n=5000):
 rng=random.Random(352035+sum(map(ord,field)));out=[]
 for _ in range(n):
  sampled=[pairs[rng.randrange(len(pairs))] for __ in pairs]
  a=sum(r[x][field] for r in sampled);b=sum(r[y][field] for r in sampled)
  if b>0:out.append(a/b)
 return [quantile(out,.025),quantile(out,.975)]
def main():
 design=read(BASE/'FROZEN-DESIGN.json');exe=read(BASE/'EXECUTION-AUDIT.json');
 assert exe['registrationSHA256']==sha(BASE/'FROZEN-DESIGN.json')
 for rel,hash0 in design['sourceSHA256'].items():assert sha(ROOT/rel)==hash0,rel
 records={o['id']:o for o in exe['matches']};assert len(records)==len(design['cases'])==36
 rows={};tot=collections.defaultdict(lambda:collections.Counter());invalid=[]
 for c in design['cases']:
  ident=c['id'];base=BASE/'matches'/ident
  for k,h in records[ident]['sha256'].items():assert sha(Path(str(base)+f'.{k}.json'))==h,(ident,k)
  r=read(Path(str(base)+'.result.json'))
  assert r['aggregate']['rounds']==1 and r['aggregate']['agentErrors']==0
  assert r['seed']==c['seed'] and r['traineePrimary']==c['gun'] and r['snapshotLagMs']==c['lagMs']
  d={k:r['aggregate'][k] for k in ['kills','deaths','shots','hits','meters','agentErrors']}
  d.update(c);d['modifiedTicks']=0;d['offers']=0;d['modifiedFireTicks']=0
  if c['arm']!='release':
   t=read(Path(str(base)+'.motion.json'))['traces'][0];ct=t['counts']
   g=read(Path(str(base)+'.fire.json'))['traces'][0];cg=g['counts']
   h=read(Path(str(base)+'.macro.json'))['traces'][0]
   assert t['policy']==c['arm'] and ct['illegalFire']==0
   assert ct['modifiedTicks']==sum(e['ticks'] for e in t['events'])
   assert ct['offers']==ct['episodes']==len(t['events'])
   assert (ct['modifiedTicks']==0) if c['arm']=='observe' else True
   assert cg['fireSuppressionTicks']==cg['fireInjectionTicks']==0
   assert cg['serverShots']==d['shots'] and cg['incumbentFireTicks']==ct['fireTicks']
   assert h['counts']['otherControlsModified']==h['counts']['incumbentFireModified']==0
   ds=read(Path(str(base)+'.dataset.json'))
   assert ds['registrationSHA256']==exe['registrationSHA256']
   d.update({k:ct[k] for k in ['offers','modifiedTicks','modifiedFireTicks']})
  rows[ident]=d
  tot[c['arm']].update({k:d[k] for k in ['kills','deaths','shots','hits','meters','agentErrors','modifiedTicks','offers','modifiedFireTicks']})
 pairs=[]
 for i in range(12):
  sid=f'c35u-{i:02d}';pairs.append({a:rows[sid+'-'+a] for a in ['release','observe','balance']})
 # Per-weapon distribution and isolated treatment effects
 byweapon={}
 for gun in ['aa12','mp5sd','m4a1']:
  matched=[z for z in pairs if z['release']['gun']==gun]
  byweapon[gun]={a:{k:sum(p[a][k] for p in matched) for k in ['kills','deaths','shots','hits','modifiedTicks','offers']} for a in ['release','observe','balance']}
 ci={k:ratio_ci(pairs,'balance','observe',k) for k in ['kills','deaths','shots','hits','meters']}
 harm={k:ratio_ci(pairs,'balance','release',k) for k in ['kills','deaths','shots']}
 out=dict(schema='fpsarena-c35u-matched-analysis-v1',registrationSHA256=exe['registrationSHA256'],
  setups=12,matches=36,simulatedMinutes=54,productionAgentSHA256=sha(ROOT/'page-agent.js'),
  totals={k:dict(v) for k,v in tot.items()},byWeapon=byweapon,
  matchedBootstrap95BalanceToObserve=ci,matchedBootstrap95BalanceToRelease=harm,
  promotion='REJECT' if (ci['kills'][0]<=1 or ci['deaths'][1]>=1 or ci['shots'][0]<.95) else 'FURTHER_EVAL_REQUIRED',
  note='Attributing differences: balance vs observe isolates C35-U; observe vs release captures original C21/C16 micro. Same production page-agent on all arms.',
  evidenceLimit='12 independent paired setups, fixed synthetic opponents, delayed public snapshots; chance of false positive; intervals exploratory')
 dump=BASE/'C35U-ANALYSIS.json';dump.write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
 with (BASE/'C35U-TDM-THREE-ARM.csv').open('w',newline='') as f:
  fields=['setupId','arm','map','gun','lagMs','seed','opponents','seconds','kills','deaths','shots','hits','meters','offers','modifiedTicks','modifiedFireTicks']
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();
  for c in design['cases']:w.writerow({k:rows[c['id']].get(k) for k in fields})
 print(json.dumps(out,indent=2))
if __name__=='__main__':main()
