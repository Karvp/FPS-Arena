#!/usr/bin/env python3
"""Run a preregistered C35-O match without the new observer; check gameplay and legacy traces."""
from pathlib import Path
import subprocess,sys,json,tempfile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,sha,dump
OUT=ROOT/'reports/c35o/paired-latency-48'
def main():
 design=load(OUT/'FROZEN-DESIGN.json');c=design['cases'][0];reg=sha(OUT/'FROZEN-DESIGN.json')
 reference=OUT/'matches'/c['id']
 with tempfile.TemporaryDirectory(prefix='c35o-parity-') as t:
  p=Path(t)/c['id'];types=('result','dataset','fire','macro','lane','calibration','identity','ballistic')
  fs={k:Path(str(p)+'.'+k+'.json') for k in types}
  cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
   '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],
   '--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],
   '--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
   '--c35c-dataset',str(fs['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
   '--c35g-trace',str(fs['fire']),'--c35h-trace',str(fs['macro']),'--c35h-policy','observe',
   '--c35i-trace',str(fs['lane']),'--c35j-trace',str(fs['calibration']),'--c35k-trace',str(fs['identity']),
   '--c35l-trace',str(fs['ballistic']),'--out',str(fs['result'])]
  r=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=300)
  if r.returncode:raise RuntimeError(r.stderr[-1500:])
  same=[];differences=[]
  for key in types:
   a=Path(str(reference)+'.'+key+'.json');b=fs[key]
   if a.read_bytes()==b.read_bytes():same.append(key)
   else:
    oa=load(a);ob=load(b)
    if key=='result':
     oa.pop('created',None);ob.pop('created',None)
     for x in oa.get('results',[]):x.pop('c35o',None)
    elif key=='dataset':
     # Keep historic metadata fields stable, ignore volatile wall-clock generation time.
     for d in (oa,ob):
      for k in ('createdAt','generatedAt','generated','created'):
       d.pop(k,None)
    if oa==ob:same.append(key+':normalized')
    else:differences.append(key)
  summary={'schema':'fpsarena-c35o-parity-check-v1','case':c['id'],'legacyTraceFieldsIdentical':same,
   'differences':differences,'status':'PASS' if not differences else 'FAIL'}
  dump(OUT/'OBSERVER-PARITY.json',summary)
  print(json.dumps(summary,indent=2))
  if differences:raise RuntimeError('Observer affected legacy output: '+','.join(differences))
if __name__=='__main__':main()
