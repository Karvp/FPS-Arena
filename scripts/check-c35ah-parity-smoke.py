#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,hashlib
R=Path(__file__).resolve().parents[1]
O=R/'reports/c35ah/parity';O.mkdir(parents=True,exist_ok=True)
reg='6f987fc819222aad9eebe658e52e5674358a9428ca31a7f9106139d3f34a3864'
base=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps','arena','--seconds','38',
 '--seed','99271143','--bots','5','--opponents','mixed','--lag-ms','65','--trainee-primary','m4a1',
 '--c35aa-setup-id','c35ah-parity','--c35c-enemy-primary','m4a1','--c35c-policy','shadow80',
 '--c35c-setup-id','c35ah-parity','--c35c-registration-sha',reg,
 '--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--c35h-policy','observe']
for arm in ('off','observe'):
 files={k:O/(arm+'.'+k+'.json') for k in ('game','aim','dataset','fire','macro')}
 a=base+['--out',str(files['game']),'--c35aa-trace',str(files['aim']),'--c35c-dataset',str(files['dataset']),
 '--c35g-trace',str(files['fire']),'--c35h-trace',str(files['macro'])]
 if arm=='observe':a+=['--c35ah-policy','observe','--c35ah-trace',str(O/'observe.option.json')]
 p=subprocess.run(a,cwd=R,capture_output=True,text=True,timeout=180)
 (O/(arm+'.log')).write_text(p.stdout+'\n'+p.stderr)
 assert p.returncode==0,p.stderr[-2000:]
for k in ('aim','dataset','fire','macro'):
 assert (O/('off.'+k+'.json')).read_bytes()==(O/('observe.'+k+'.json')).read_bytes(),k
x=json.loads((O/'off.game.json').read_text());y=json.loads((O/'observe.game.json').read_text())
for obj in (x,y):
 obj.pop('created',None)
 for row in obj.get('results',[]):row.pop('c35ah',None)
assert x==y,'gameplay not identical'
# Official engine five-mode release smoke, research-only feature DISABLED.
S=R/'reports/c35ah/regression';S.mkdir(parents=True,exist_ok=True)
cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm,snd,hp,br,zm',
 '--seconds','30','--seed','99275510','--bots','5','--out',str(S/'smoke-five.result.json')]
p=subprocess.run(cmd,cwd=R,capture_output=True,text=True,timeout=240)
(S/'smoke-five.log').write_text(p.stdout+'\n'+p.stderr)
assert p.returncode==0,p.stderr[-2000:]
smoke=json.loads((S/'smoke-five.result.json').read_text())
assert len(smoke['results'])==5 and smoke['aggregate']['agentErrors']==0
summary={'schema':'fpsarena-c35ah-compatibility-v1','fourPriorTracesByteIdentical':True,
 'normalizedGameResultsIdentical':True,'fiveModes':{r['mode']:r['errors'] for r in smoke['results']},
 'allModesZeroErrors':True,'source':'replayed actual headless Game.step'}
(S/'PARITY-SMOKE.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
