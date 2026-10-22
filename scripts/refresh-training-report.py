from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
reportpath=root/'reports/training-v271/TRAINING_REPORT_v2.7.1.md'
jsonpath=root/'reports/training-v271/TRAINING_COMPARISON_v2.7.1.json'
com=json.loads(jsonpath.read_text())
report=reportpath.read_text().splitlines()
source={
'official':(root/'reports/training-v271/baseline-official.json',root/'reports/training-v271/candidate-official.json'),
'stress':(root/'reports/training-v271/baseline-stress.json',root/'reports/training-v271/candidate-stress.json')}
for env,(before,after) in source.items():
    d0=json.loads(before.read_text())
    d1=json.loads(after.read_text())
    for mode in ('snd','hp'):
        def aggregate(d):
            rows=[r for r in d['results'] if r['mode']==mode]
            return {'matches':len(rows),'kills':sum(r['kills'] for r in rows),'hits':sum(r['hits'] for r in rows),
                    'shots':sum(r['shots'] for r in rows),'headHits':sum(r['headHits'] for r in rows),
                    'deaths':sum(r['deaths'] for r in rows),'extensionErrors':sum(r['errors'] for r in rows),
                    'teamHardpointScore':sum(r.get('teamObjectiveScore') or 0 for r in rows) if mode=='hp' else None,
                    'teamSndRoundWins':sum(r.get('teamRoundWins') or 0 for r in rows) if mode=='snd' else None}
        a,b=aggregate(d0),aggregate(d1)
        com['policies'][env][mode]={'baseline':a,'candidate':b}
        line=f'| {env} / {mode} | {a["kills"]} → **{b["kills"]}** | {a["hits"]} → {b["hits"]} | {a["shots"]} → {b["shots"]} | {a["deaths"]} → {b["deaths"]} | '+(f'{a["teamHardpointScore"]} → {b["teamHardpointScore"]}' if mode=='hp' else '—')+' |'
        report= [line if s.startswith(f'| {env} / {mode} |') else s for s in report]
full=json.loads((root/'reports/TRAIN_ALL_MODES_MIXED_V271.json').read_text())
for r in full['results']:
    line=f'| {r["mode"]} | {r["kills"]} | {r["shots"]} | {r["hits"]} | {r["headHits"]} | {r["errors"]} |'
    report=[line if s.startswith(f'| {r["mode"]} |') else s for s in report]
jsonpath.write_text(json.dumps(com,ensure_ascii=False,indent=2)+'\n')
reportpath.write_text('\n'.join(report)+'\n')
print('Updated',len(full['results']),'mode result rows and paired comparison')
