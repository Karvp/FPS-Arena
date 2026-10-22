#!/usr/bin/env python3
"""Offline, research-only public candidate vs AFTER-STEP hitscan target audit.

Selections are read exclusively from row.publicBeforeStep. Authoritative hit
labels are accessed by evaluation functions only. Never expose labels to agent.
Shot is the primary unit; pellet is a repeated measurement within a shot.
"""
from pathlib import Path
from collections import defaultdict
import hashlib,json,random,statistics

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text())
def write(path,data):
 p=Path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,sort_keys=True,indent=2)+'\n')

def public_candidates(row):
    p=row['publicBeforeStep']
    assert p.get('provenance')=='PUBLIC_BEFORE_STEP_ONLY'
    assert p.get('valid') is True
    return {'nearest':p.get('targetId'),'aim':p.get('aimCandidateId')}

def match_shot(row,shot):
    candidates=public_candidates(row)
    hits=[p for p in shot['pellets'] if p['hitKind']=='player']
    for p in shot['pellets']:
        assert p['hitKind'] in ['player','world','range','zombie','ability','entity']
    res={'shotHasPlayerHit':bool(hits),'pellets':len(shot['pellets']),
         'playerHitPellets':len(hits),'nearest':candidates['nearest'],'aim':candidates['aim'],
         'nearestMatchCount':sum(p['targetId']==candidates['nearest'] for p in hits),
         'aimMatchCount':sum(p['targetId']==candidates['aim'] for p in hits)}
    assert shot['pelletCount']==res['pellets']
    return res

def match_file(case,path):
    doc=read(path); assert doc['schema']=='fpsarena-c35l-shot-truth-traces-v1'
    assert len(doc['traces'])==1
    trace=doc['traces'][0];counter=trace['counts']
    rows=[];shot_count=pellet_count=hit_count=0
    for row in trace['rows']:
        # The only acceptable selection source is a public BEFORE-STEP snapshot.
        for shot in row['authoritativeFiringTimeShots']:
            sm=match_shot(row,shot)
            sm.update(map=case['map'],gun=case['gun'],seed=case['seed'],setupId=case['setupId'],
                      serverTime=shot['t'],rewindSeconds=shot['rewindSeconds'])
            rows.append(sm);shot_count+=1
            pellet_count+=sm['pellets'];hit_count+=sm['playerHitPellets']
    assert shot_count==counter['confirmedShots']==counter['serverShotEvents']
    assert pellet_count==counter['confirmedPellets']
    assert hit_count==counter['hitPlayerPellets']
    assert counter['fireModified']==0 and counter['storedDropped']==0
    return rows

def summarize(rows):
    hit=[r for r in rows if r['shotHasPlayerHit']]
    hp=sum(x['playerHitPellets'] for x in hit)
    nearest=sum(x['nearestMatchCount'] for x in hit)
    aim=sum(x['aimMatchCount'] for x in hit)
    def mean_fraction(field):
        return sum(x[field]/x['playerHitPellets'] for x in hit)/len(hit) if hit else None
    return {'shots':len(rows),'shotsWithPlayerHit':len(hit),
        'pellets':sum(x['pellets'] for x in rows),'hitPellets':hp,
        'nearestCorrectHitPellets':nearest,'aimCorrectHitPellets':aim,
        'nearestHitPelletAgreement':nearest/hp if hp else None,
        'aimHitPelletAgreement':aim/hp if hp else None,
        'nearestShotMacroAverage':mean_fraction('nearestMatchCount'),
        'aimShotMacroAverage':mean_fraction('aimMatchCount'),
        'shotMacroImprovement':(mean_fraction('aimMatchCount')-mean_fraction('nearestMatchCount')) if hit else None,
        'noHitShotsExcludedFromTargetScoring':len(rows)-len(hit)}

def bootstrap_by_match(groups,iterations=3000,seed=358031):
    rng=random.Random(seed); keys=sorted(groups); samples=[]
    for _ in range(iterations):
        selected=[keys[rng.randrange(len(keys))] for _ in keys]
        rows=[r for k in selected for r in groups[k]]
        score=summarize(rows)['shotMacroImprovement']
        if score is not None:samples.append(score)
    samples.sort()
    return [samples[int(.025*(len(samples)-1))],samples[int(.975*(len(samples)-1))]] if samples else None

def analyze(cohort,artifact='ANALYSIS.json'):
    root=Path(cohort);design=read(root/'FROZEN-DESIGN.json');groups={}
    for c in design['cases']:
        case_id=c['setupId'];p=root/'matches'/(c['id']+'.ballistic.json')
        assert p.is_file(),f'Missing {p}'
        groups[case_id]=match_file(c,p)
    rows=[r for g in groups.values() for r in g];whole=summarize(rows)
    bygun={g:summarize([r for r in rows if r['gun']==g]) for g in sorted({x['gun'] for x in rows})}
    bymap={g:summarize([r for r in rows if r['map']==g]) for g in sorted({x['map'] for x in rows})}
    result={'schema':'fpsarena-c35m-target-alignment-v1',
      'scope':'AFTER-STEP AUDIT ONLY; never used for action or aim selection',
      'estimand':'Agreement between public candidate ID and player actually hit by a server pellet; not actual intent or policy reward',
      'noHitShotsScoring':'excluded (unknown intended target)',
      'unit':'shot macro average; pellet micro totals descriptive only',
      'setupCount':len(groups),'overall':whole,'byGun':bygun,'byMap':bymap,
      'shotLevelImprovementCI95':bootstrap_by_match(groups),
      'recordHashesSHA256':{c['id']:sha(root/'matches'/(c['id']+'.ballistic.json')) for c in design['cases']}}
    write(root/artifact,result)
    return result
if __name__=='__main__':
 import sys
 out=analyze(sys.argv[1]);print(json.dumps({k:v for k,v in out.items() if k not in ('recordHashesSHA256',)},indent=2))
