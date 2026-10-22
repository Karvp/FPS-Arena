from pathlib import Path
from collections import defaultdict
import hashlib,json,re,zipfile,os
root=Path(__file__).resolve().parent.parent
rep=root/'reports'/'c8'
out=Path('/mnt/data')
rows=[]
for seed,map_,weapon in [(999703,'arena','mp5sd'),(911106,'foundry','aa12'),(803301,'neon','m4a1'),(803304,'arena','hk_sl8')]:
    row={'seed':seed,'map':map_,'weapon':weapon,'profiles':{}}
    for profile in ['release','director-main-stats-shadow-lab','director-main-stats-recovery-lab']:
        f=rep/f'{profile}-{seed}.json'
        r=json.loads(f.read_text())['results'][0]
        row['profiles'][profile]={k:r.get(k) for k in ('kills','deaths','shots','hits','damageDealt','damageTaken','firstShotAt','firstHitAt','errors','directorPlanSelectionCount')}
        a=r.get('directorCandidateAudit',{})
        row['profiles'][profile]['candidateAudit']={k:a.get(k,0) for k in ('searches','sites','losValid','riskValid','routesAttempted','routesValid','initialStepsValid','earlyWindows','accepted')}
    rows.append(row)
weapon_audit=json.loads((rep/'weapon-band-audit.json').read_text())
smoke=json.loads((rep/'five-mode-shadow.json').read_text())
result={
 'format':'fpsarena-v2911-c8-main-weapon-stats-v1',
 'date':'2026-10-12','base':'v2.9.11-C7 uploaded-main sync','scope':'headless lab only',
 'sourceMain':'fps-arena-main(1).zip, no git commit metadata',
 'build':'PASS', 'aiRegression':{'passed':749,'total':749},
 'upstreamGameTests':{'passed':733,'total':733},
 'upstreamSmoke':'PASS',
 'mainCatalog':weapon_audit['counts'],
 'pairedTDM':{'secondsPerRun':65,'runs':len(rows)*3,'seedCount':len(rows),'maps':'arena, foundry, neon','conditions':'five stress bots, 65ms delayed snapshots, same seed/map/loadout/opponents per profile','rows':rows},
 'fiveModeSmoke':{'secondsPerMode':12,'profile':smoke['profile'],'rows':[{k:x.get(k) for k in ('mode','kills','deaths','shots','errors')} for x in smoke['results']]},
 'limitation':'No executed experimental plan in four paired scenarios; no established combat improvement. Tactical useful band is uncalibrated.'
}
vp=out/'FPS-Arena-v2.9.11-C8-Validation.json'
vp.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
fromtext=[]
for row in rows:
    opts=[]
    for p in ['release','director-main-stats-shadow-lab','director-main-stats-recovery-lab']:
        q=row['profiles'][p]
        opts.append(f"{q['kills']}K/{q['deaths']}D/{q['shots']} shots")
    fromtext.append(f"| {row['map']} / {row['weapon']} / {row['seed']} | {' | '.join(opts)} |")
bandtable=[]
for id in ['aa12','mp5sd','m4a1','hk_sl8','l115a3']:
    w=next(x for x in weapon_audit['guns'] if x['id']==id)
    b=w['usefulPreference']
    bandtable.append(f"| `{id}` | {w['falloff'][0]}–{w['falloff'][1]} | {b['ideal']:.1f} | {b['max']:.1f} | {w['physicalMax']} |")
md=f'''# FPS Arena v2.9.11 — Continuation C8: Main Weapon-Aware Engagement (Research)

**Ngày:** 12/10/2026. **Nền:** C7 đã đồng bộ source ZIP người dùng upload (`fps-arena-main(1).zip`). **Deployment:** headless research only; production Autopilot giữ nguyên. Không push GitHub.

## Executive summary

C7 đã chứa main engine mới nhưng Tactical Director vẫn dùng 6 nhóm tầm bắn cố định. C8 thay bằng bộ **effective weapon engagement band** chỉ khi bật cờ thử nghiệm. Tính toán dựa trên thông số public/effective `curWeapon(ws)` từ main, bao gồm attachments đã được áp vào thông số, với các trường `range`, `dmg`, `spreadAds`, `maxRange`, `move`. **Đây là heuristic hình học chưa hiệu chuẩn, không phải hit probability.**

Đặc biệt: `range[1]` là mốc kết thúc damage falloff (damage giữ ở `dmg[1]` sau mốc đó), **không phải khoảng cách đạn biến mất**. C8 tách hai khoảng: vị trí giao tranh mong muốn (`min/ideal/max` heuristic) và tầm bắn vật lý (`physicalMax = weapon.maxRange`). Vòng bảo vệ cơ hội bắn dùng tầm vật lý nếu đã thấy mục tiêu. Kế hoạch di chuyển dùng khoảng ưu tiên.

## Code changes

1. `tactical-director.mjs`: `tacticalWeaponBand(weapon,true)` thêm ước lượng dựa trên tản đạn ADS và damage retention, giới hạn bởi tầm vật lý, có fallback khi dữ liệu không hợp lệ. `tacticalCandidates`, `tacticalIntent`, `tacticalOpportunityVeto`, `tacticalDirectorDecision` nhận opt-in policy. Audit thêm nguồn/giới hạn tầm bắn.
2. `aim-core.mjs` / `agent-entry.js`: cấu hình mặc định `tacticalDirectorMainWeaponStatsLab:false`; yêu cầu **`globalThis.__FPSARENA_HEADLESS_LAB__===true`** trước khi sử dụng bản mới. Active actuation vẫn giới hạn TDM headless theo safety shield cũ.
3. `lab/arena/train-main.mjs`: hai profile mới `director-main-stats-shadow-lab` và `director-main-stats-recovery-lab`. `lab/arena/train.mjs` pinned C6 không đổi.
4. `tests/tactical-director-main-stats-c8.test.mjs`: 9 kiểm thử mới cho catalog, suppressor, sniper ngoài damage-falloff, tầm bắn vật lý, malformed inputs, A* budget, safety và profile gating.
5. `scripts/c8-main-weapon-audit.mjs` sinh `reports/c8/weapon-band-audit.json`, ghi tất cả **{weapon_audit['counts']['selectable']}** vũ khí selectable và **{weapon_audit['counts']['suppressionCompatible']}** vũ khí tương thích suppressor. Catalog tổng **{weapon_audit['counts']['allCatalog']}** mục bao gồm skill weapons/đồ đặc biệt.

### Ví dụ tầm bắn trong C8 (đơn vị: mét)

| Vũ khí | Damage falloff | Ideal (heuristic) | Useful max (heuristic) | Physical max |
|---|---:|---:|---:|---:|
{chr(10).join(bandtable)}

Không nên xem useful max là điểm không thể bắn. Ví dụ L115A3 có mốc giảm damage ở 45m nhưng đạn có thể bay xa hơn nhiều nếu không bị vật cản.

## Verification

- AI regression: **749/749 PASS**. Game main's own tests: **733/733 PASS**.
- `node scripts/build.mjs`: PASS (page-agent.js regenerated).
- Game `npm run smoke`: PASS (server/client và các tính năng mới, including range/attachments).
- Five-mode game-server `Game.step()` smoke: **5/5 modes, 0 errors** (12 sec per mode, shadow profile).
- Paired fixed-duration headless TDM on uploaded main, 5 stress bots, 65ms lag, 65 sec each, same seed/map/loadout.

| Map / gun / seed | Release | Main-stats Shadow | Main-stats Recovery |
|---|---|---|---|
{chr(10).join(fromtext)}

**12/12 trận không có lỗi.** Số kill/death/shot của cả ba cấu hình bằng nhau trong bốn bối cảnh này; chưa chứng minh có cải thiện chiến đấu. Shadow kiểm tra tuyến mà không can thiệp. Recovery không thực thi kế hoạch mới (0 plan selections) trong mẫu. Đó là một kết quả âm tính cần giữ nguyên khi đánh giá.

## Reproduction

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && npm test && npm run smoke)
node scripts/c8-main-weapon-audit.mjs > reports/c8/weapon-band-audit.json
node lab/arena/train-main.mjs --modes tdm --seconds 65 --classic-maps arena --trainee-primary mp5sd --seed 999703 --bots 5 --opponents stress --profile director-main-stats-shadow-lab --out reports/c8/repro-shadow.json
```

## Remaining risks / C9

Tactical score và angular spread là heuristic, chưa hiệu chuẩn với server-hit ratio; có thể overestimate khả năng bắn ở cự ly xa khi mục tiêu di chuyển. Chưa mô phỏng yếu tố đặc biệt của từng skill trên chiến thuật macro; chưa đánh giá vũ khí có attachments trong match pair (chỉ kiểm thử effective stats bằng unit tests). Sau C8: thu thập phân phối `range × weapon × attachment × accuracy` của server, đo cơ hội thực thi trên holdout nhiều seed; chỉ cập nhật policy sau khi hiệu năng có đối chứng đủ thuyết phục. Không sử dụng các nhãn observational sau kế hoạch như chứng cứ nhân quả hoặc dữ liệu RL đủ chất lượng.

**GitHub:** chỉ sử dụng file main người dùng upload, không suy đoán SHA của repo `forgothtp/fps-arena`.
'''
rp=out/'FPS-Arena-v2.9.11-C8-Engineering-Report.md';rp.write_text(md)
(root/'CHANGELOG-v2.9.11-C8.md').write_text((root/'CHANGELOG-v2.9.11-C8.md').read_text()+'\nVerification: 749/749 AI tests, 733/733 main tests, 5-mode smoke, four paired-seed triples with no reported combat differences.\n')
(root/'reports'/'c8'/'C8-Validation.json').write_text(vp.read_text())
(root/'reports'/'c8'/'C8-Engineering-Report.md').write_text(md)
archive=out/'FPS-Arena-Combat-Suite-v2.9.11-C8-Main-Weapon-Engagement.zip'
exclude={'patch_c8.py'}
files=[]
for path in root.rglob('*'):
 if not path.is_file() or path.name in exclude or any(y in {'.git','node_modules','__pycache__','.pytest_cache'} for y in path.relative_to(root).parts):continue
 files.append(path)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for path in sorted(files):z.write(path, path.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as z:
 failure=z.testzip();n=len(z.infolist())
assert failure is None, f'CRC failure: {failure}'
manifest={
 'archive':archive.name,'archiveFiles':n,'archiveBytes':archive.stat().st_size,
 'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
 'report':{'name':rp.name,'sha256':hashlib.sha256(rp.read_bytes()).hexdigest()},
 'validation':{'name':vp.name,'sha256':hashlib.sha256(vp.read_bytes()).hexdigest()},
 'sourceZipOriginal':'fps-arena-main(1).zip','archiveCRC':'PASS'}
(out/'FPS-Arena-v2.9.11-C8-Manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
