#!/usr/bin/env python3
"""Run one frozen external-holdout match without C35P; original observers must be byte-identical."""
import json,sys,subprocess,os,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35o_freshness_analysis import load,dump,sha
OUT=ROOT/'reports/c35p/new-seed-holdout-12';c=load(OUT/'FROZEN-DESIGN.json')['cases'][0];reg=sha(OUT/'FROZEN-DESIGN.json')
base=OUT/'matches'/c['id'];dest=ROOT/'reports/c35p/observer-parity';dest.mkdir(exist_ok=True,parents=True)
parts=('dataset','fire','macro','lane','calibration','identity','ballistic','track')
fs={k:dest/f'without-c35p.{k}.json' for k in (*parts,'result')}
cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
 '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),'--opponents',c['opponents'],
 '--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--c35c-enemy-primary',c['gun'],
 '--c35c-policy','shadow80','--c35c-setup-id',c['setupId'],'--c35c-registration-sha',reg,
 '--c35c-dataset',str(fs['dataset']),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json',
 '--c35g-trace',str(fs['fire']),'--c35h-trace',str(fs['macro']),'--c35h-policy','observe',
 '--c35i-trace',str(fs['lane']),'--c35j-trace',str(fs['calibration']),
 '--c35k-trace',str(fs['identity']),'--c35l-trace',str(fs['ballistic']),
 '--c35o-trace',str(fs['track']),'--out',str(fs['result'])]
env=dict(os.environ);env['TERM']='xterm';r=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=300,env=env)
(dest/'run.log').write_text(r.stdout+'\n'+r.stderr)
assert r.returncode==0,r.stderr[-1500:]
identical={k:sha(fs[k])==sha(str(base)+'.'+k+'.json') for k in parts}
assert all(identical.values()),identical
withp=load(str(base)+'.result.json');without=load(fs['result'])
withp.pop('created',None);without.pop('created',None)
for metric in withp['results']:metric.pop('c35p',None)
assert withp==without,'C35-P passive observer changed the authoritative outcome'
dump(dest/'RESULT.json',{'schema':'fpsarena-c35p-observer-parity-v1','case':c['id'],'originalSidecarsByteIdentical':identical,
 'gameResultEqualExceptDiagnosticAndTimestamp':True,'c35pNoActuation':True,'sourceRegistrationSHA256':reg})
print(json.dumps(load(dest/'RESULT.json'),indent=2))
