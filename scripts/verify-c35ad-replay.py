#!/usr/bin/env python3
"""Replay C35AD passive observe vs disabled on same source and fixed seed."""
from pathlib import Path
import subprocess,hashlib,json
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ad/replay';O.mkdir(parents=True,exist_ok=True)
reg='ca35ad'*10+'ca35' # 64 hex
assert len(reg)==64
def file(k,tag):return O/f'{tag}.{k}.json'
def run(tag,policy):
 args=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps','neon','--seconds','40','--seed','88220601','--bots','5','--opponents','mixed','--lag-ms','85','--trainee-primary','mp5sd','--c35aa-setup-id','c35ad-replay','--c35aa-trace',str(file('aim',tag)),'--out',str(file('result',tag)),'--c35c-enemy-primary','mp5sd','--c35c-policy','shadow80','--c35c-setup-id','c35ad-replay','--c35c-registration-sha',reg,'--c35c-dataset',str(file('dataset',tag)),'--c35d-forecast-model','reports/c35d2/FROZEN-FORECAST.json','--c35g-trace',str(file('fire',tag)),'--c35h-trace',str(file('macro',tag)),'--c35h-policy','observe']
 if policy:args+=['--c35ad-policy','observe','--c35ad-trace',str(file('prefire',tag))]
 result=subprocess.run(args,cwd=R,text=True,capture_output=True,timeout=120)
 if result.returncode:raise RuntimeError(result.stderr)
run('disabled',False);run('passive',True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for k in ['aim','dataset','fire','macro']:
 assert sha(file(k,'disabled'))==sha(file(k,'passive')),k
before=json.loads(file('result','disabled').read_text());after=json.loads(file('result','passive').read_text());before.pop('created');after.pop('created');
for r in after['results']:r.pop('c35ad',None)
# metrics.c35ad present under result results in new observe trace; drop diagnostic only
if 'c35ad' in after.get('results',[{}])[0]:pass
assert before==after,'passive changed gameplay'
assert not json.loads(file('prefire','passive').read_text())['traces'][0]['rows']
output={'status':'PASS','byteIdenticalTraces':['aim','dataset','fire','macro'],'sameGameplayIgnoringCreatedAndPassiveCounts':True,'seed':88220601}
(O/'REPLAY-VALIDATION.json').write_text(json.dumps(output,indent=2)+'\n');print(output)
