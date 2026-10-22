#!/usr/bin/env python3
"""Run matched authoritative Game.step() traces with C35K observer off/on."""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35k/parity'
REG=hashlib.sha256((ROOT/'reports/c35k/pilot-18-fresh/FROZEN-DESIGN.json').read_bytes()).hexdigest()
def run(case,enabled):
 d=OUT/case;d.mkdir(parents=True,exist_ok=True)
 files={k:d/(k+'.json') for k in ['result','dataset','fire','macro','lane','calibration']}
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps','neon','--seconds','25',
  '--seed','37519801','--bots','5','--opponents','mixed','--lag-ms','65','--trainee-primary','m4a1',
  '--c35c-enemy-primary','m4a1','--c35c-policy','shadow80','--c35c-setup-id','c35k-parity',
  '--c35c-registration-sha',REG,'--c35c-dataset',str(files['dataset']),
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(files['fire']),'--c35h-policy','observe','--c35h-trace',str(files['macro']),
  '--c35i-trace',str(files['lane']),'--c35j-trace',str(files['calibration']),'--out',str(files['result'])]
 if enabled:cmd.extend(['--c35k-trace',str(d/'identity.json')])
 r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=180)
 (d/'run.log').write_text(r.stdout+'\n'+r.stderr)
 if r.returncode:raise RuntimeError('C35K parity game failed '+r.stderr[-800:])
 return files
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def go():
 a=run('disabled',False);b=run('enabled',True)
 diff={k:(sha(a[k])==sha(b[k])) for k in ['dataset','fire','macro','lane','calibration']}
 assert all(diff.values()),diff
 x=json.loads(a['result'].read_text());y=json.loads(b['result'].read_text())
 assert x['aggregate']=={k:v for k,v in y['aggregate'].items() if k!='c35k'},'unexpected aggregate drift'
 assert x['results'][0]=={k:v for k,v in y['results'][0].items() if k!='c35k'},'unexpected result drift'
 ident=json.loads((OUT/'enabled/identity.json').read_text())['traces'][0]
 assert ident['counts']['shots']==x['aggregate']['shots']
 report={'schema':'fpsarena-c35k-parity-v1','seconds':25,'seed':37519801,
  'legacyTraceByteIdentical':diff,'gameplayEqualAfterRemovingC35K':True,
  'newObserverFireTicks':ident['counts']['fireTicks'],'shots':ident['counts']['shots'],
  'sourceProductionSHA256':sha(ROOT/'page-agent.js'),'status':'PASS'}
 (OUT/'PARITY.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
 print('C35K PARITY PASS',diff,'shots',report['shots'])
if __name__=='__main__':go()
