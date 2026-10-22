#!/usr/bin/env python3
"""Exact paired replay with observer enabled/disabled; no modification to control."""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35j/parity'
REG=hashlib.sha256((ROOT/'reports/c35j/pilot-18-fresh-3d-v2/FROZEN-DESIGN.json').read_bytes()).hexdigest()
def h(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(arm,enabled):
 base=OUT/arm;base.mkdir(parents=True,exist_ok=True)
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps','neon','--seconds','60',
  '--seed','36201424','--bots','5','--opponents','mixed','--lag-ms','35',
  '--trainee-primary','hk_sl8','--c35c-enemy-primary','hk_sl8','--c35c-policy','shadow80',
  '--c35c-setup-id','c35j-09','--c35c-registration-sha',REG,
  '--c35c-dataset',str(base/'dataset.json'),
  '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
  '--c35g-trace',str(base/'fire.json'),'--c35h-trace',str(base/'macro.json'),
  '--c35h-policy','observe','--c35i-trace',str(base/'lane.json'),
  '--out',str(base/'result.json')]
 if enabled:args.extend(['--c35j-trace',str(base/'calibration.json')])
 p=subprocess.run(args,cwd=ROOT,text=True,capture_output=True,timeout=240)
 (base/'log.txt').write_text(p.stdout+'\n'+p.stderr)
 if p.returncode:raise RuntimeError(p.stderr[-800:])
 return base
if __name__=='__main__':
 a=run('disabled',False);b=run('enabled',True)
 compare={x:{'off':h(a/(x+'.json')),'on':h(b/(x+'.json'))} for x in ['dataset','fire','macro','lane']}
 if any(d['off']!=d['on'] for d in compare.values()):raise RuntimeError('control trace byte drift '+str(compare))
 original=json.loads((a/'result.json').read_text()),json.loads((b/'result.json').read_text())
 r0,r1=original
 r0.pop('created',None);r1.pop('created',None)
 for x in r1['results']:x.pop('c35j',None)
 if r0!=r1:raise RuntimeError('Game.step result or public output changed with observer')
 report={'schema':'fpsarena-c35j-parity-v1','seed':36201424,'gameplayExact':True,'legacyTraceByteExact':True,
  'files':compare,'shots':r0['aggregate']['shots'],'C35JTraceSHA256':h(b/'calibration.json')}
 (OUT/'PARITY.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
 print('C35J PARITY PASS',report['shots'],'shots',len(compare),'byte-identical old traces')
