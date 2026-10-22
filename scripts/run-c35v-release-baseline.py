#!/usr/bin/env python3
"""Supplementary exact-setup original release arm for C35-V. No research flags."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import json,hashlib,subprocess,os,time
R=Path(__file__).resolve().parents[1];A=R/'reports/c35v/factual-value-24-v1';B=R/'reports/c35v/release-baseline-12'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,x):p.parent.mkdir(exist_ok=True,parents=True);p.write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def main():
 old=json.loads((A/'FROZEN-DESIGN.json').read_text());cases=[c for c in old['cases'] if c['arm']=='observe'];assert len(cases)==12
 d=dict(schema='fpsarena-c35v-supplemental-original-release-v1',parentRegistration=sha(A/'FROZEN-DESIGN.json'),
 sourceSHA256={p:sha(R/p) for p in ['page-agent.js','lab/arena/train-main.mjs','lab/arena/source-main/server/game.js',
 'scripts/run-c35v-release-baseline.py']},cases=[{**c,'arm':'release','id':c['setupId']+'-release'} for c in cases])
 f=B/'FROZEN-DESIGN.json'
 if f.exists():assert json.loads(f.read_text())==d
 else:dump(f,d)
 print('FROZEN RELEASE',sha(f),flush=True);out=[];started=time.time()
 def run(c):
  p=B/'matches'/(c['id']+'.result.json');p.parent.mkdir(exist_ok=True,parents=True)
  if not p.exists():
   cmd=['node','lab/arena/train-main.mjs','--profile','release','--modes','tdm','--classic-maps',c['map'],
    '--seconds',str(c['seconds']),'--seed',str(c['seed']),'--bots',str(c['bots']),
    '--opponents',c['opponents'],'--lag-ms',str(c['lagMs']),'--trainee-primary',c['gun'],'--out',str(p)]
   q=subprocess.run(cmd,cwd=R,capture_output=True,text=True,timeout=300)
   Path(str(p)+'.log').write_text(q.stdout+q.stderr)
   if q.returncode:raise RuntimeError(c['id']+q.stderr[-500:])
  return dict(id=c['id'],sha256=sha(p))
 with ThreadPoolExecutor(max_workers=int(os.getenv('C35V_WORKERS','4'))) as pool:
  for future in as_completed([pool.submit(run,c) for c in d['cases']]):
   z=future.result();out.append(z);print(len(out),'/',len(cases),z['id'],flush=True)
 dump(B/'EXECUTION-AUDIT.json',dict(registrationSHA256=sha(f),matches=sorted(out,key=lambda x:x['id']),wallSeconds=round(time.time()-started,2)))
if __name__=='__main__':main()
