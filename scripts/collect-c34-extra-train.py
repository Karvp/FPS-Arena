#!/usr/bin/env python3
"""Adaptive training-only augmentation AFTER C34-A development-count shortfall. Sealed test untouched."""
import concurrent.futures,hashlib,json,os,pathlib,subprocess,sys,tempfile,time
ROOT=pathlib.Path(__file__).resolve().parent.parent
ORIG=ROOT/'reports/c34/real-matches-54/PRE-REGISTERED-PLAN.json'
OUT=ROOT/'reports/c34/extra-train-18'
if not ORIG.exists():raise SystemExit('C34 primary preregistration missing')
prior=json.loads(ORIG.read_text());locks=prior['fileSHA256']
for rel,v in locks.items():
 if hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()!=v:raise SystemExit('Locked source changed: '+rel)
cases=[]
for i in range(18):
  m,w=divmod(i,6)
  cases.append(dict(id=f'{i:03d}',seed=34380001+i*47,map=['arena','foundry','neon'][m],weapon=['mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'][w],lagMs=[35,65,125][i%3],opponents='mixed',seconds=90,split='train'))
plan={'schema':'fpsarena-c34-adaptive-training-only-addendum-v1',
 'reason':'Original 18 training matches had 31 positive windows, fewer than preregistered minimum 40; augment TRAIN only on new seeds. Existing validation and sealed test unchanged.',
 'parentRegistrationSHA256':hashlib.sha256(ORIG.read_bytes()).hexdigest(),
 'fileSHA256':locks,'cases':cases,
 'notPreRegisteredInOriginal':True,'holdoutNeverUsedForDesign':True}
OUT.mkdir(parents=True,exist_ok=True);pp=OUT/'ADAPTIVE-TRAIN-ADDENDUM.json'
if pp.exists():
 if json.loads(pp.read_text())!=plan:raise SystemExit('Existing addendum changed')
else:pp.write_text(json.dumps(plan,indent=2)+'\n')
def check(c):
 b=OUT/f"match-{c['id']}";rp=b.with_suffix('.result.json');dp=b.with_suffix('.dataset.json')
 if not rp.exists() or not dp.exists():return False
 try:
  r=json.loads(rp.read_text());d=json.loads(dp.read_text());return r['seed']==c['seed'] and r['errors']==0 if 'errors' in r else r['seed']==c['seed'] and r['aggregate']['rounds']==1 and d['matches'][0]['metadata']['seed']==c['seed']
 except Exception:return False
def run(c):
 if check(c):return c['id'],'cached'
 b=OUT/f"match-{c['id']}";rp=b.with_suffix('.result.json');dp=b.with_suffix('.dataset.json')
 cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],'--seconds','90','--seed',str(c['seed']),'--bots','5','--lag-ms',str(c['lagMs']),'--opponents',c['opponents'],'--c34-enemy-primary',c['weapon'],'--c34-dataset',str(dp),'--out',str(rp)]
 with open(b.with_suffix('.log'),'w') as f:p=subprocess.run(cmd,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,timeout=240)
 return c['id'],'complete' if p.returncode==0 and check(c) else 'INVALID'
print('C34-B ADAPTIVE TRAIN ONLY preregistered',len(cases),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
 for i,f in enumerate(concurrent.futures.as_completed([ex.submit(run,c) for c in cases]),1):
  a,b=f.result();print(f'C34-B {i}/18 {a} {b}',flush=True)
  if b=='INVALID':raise SystemExit('Failed '+a)
