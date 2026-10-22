/** Generate reproducible offline weapon-priority audit artifacts from the game weapon catalog. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WEAPONS} from '../tests/fixtures/game-shared/weapons.js';
import {WEAPON_SCENARIOS,evaluateWeapon,rankWeapons} from '../weapon-evaluation.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output=path.join(root,'reports');fs.mkdirSync(output,{recursive:true});
const viable=Object.values(WEAPONS).filter(w=>!w.unarmed&&!w.melee&&!w.skillWeapon&&!w.noLoot);
const categories=[...new Set(viable.map(w=>w.cat))].sort();
const rows=[],byScenario=new Map();
for (const scenario of WEAPON_SCENARIOS) {
 const ranked=rankWeapons(WEAPONS,scenario,{limit:viable.length});
 byScenario.set(scenario.id,ranked);
 for(let i=0;i<ranked.length;i++) {
  const r=ranked[i],w=WEAPONS[r.weaponId];
  rows.push({...r,rank:i+1,scenarioMode:scenario.mode,scenarioDistance:scenario.distance,
   weaponName:w.name,weaponCategory:w.cat,rawMagazine:w.magSize,
   rawReload:w.reload,rawRange:(w.range||[]).join('-')});
 }
}
const quote=v=>`"${String(v??'').replaceAll('"','""')}"`;
const csv=(file,items,keys)=>fs.writeFileSync(path.join(output,file),
  keys.map(quote).join(',')+'\n'+items.map(r=>keys.map(k=>quote(r[k])).join(',')).join('\n')+'\n');
const scoreCols=['scenarioId','scenarioMode','scenarioDistance','rank','weaponId','weaponName',
 'weaponCategory','score','action','timeToKill','estimatedHitFraction','shotsNeeded',
 'magazine','reserve','reason','rawMagazine','rawReload','rawRange'];
csv('weapon-priority-scenarios.csv',rows,scoreCols);
const pair=[];
for(let i=0;i<viable.length;i++)for(let j=i+1;j<viable.length;j++){
 const a=viable[i],b=viable[j];let aw=0,bw=0,ties=0;
 const modeWins={tdm:[0,0,0],zm:[0,0,0],br:[0,0,0]};
 for(const scenario of WEAPON_SCENARIOS){
   const as=evaluateWeapon(a,scenario).score,bs=evaluateWeapon(b,scenario).score;
   const bin=as>bs?0:as<bs?1:2;
   modeWins[scenario.mode][bin]++;
   if(bin===0)aw++;else if(bin===1)bw++;else ties++;
 }
 pair.push({weaponA:a.id,weaponB:b.id,winsA:aw,winsB:bw,ties,
  tdmA:modeWins.tdm[0],tdmB:modeWins.tdm[1],
  zmA:modeWins.zm[0],zmB:modeWins.zm[1],
  brA:modeWins.br[0],brB:modeWins.br[1]});
}
csv('weapon-pairwise.csv',pair,Object.keys(pair[0]));
const gameFixture=fs.readFileSync(path.join(root,'tests/fixtures/game-shared/weapons.js'));
const provenance=createHash('sha256').update(gameFixture).digest('hex');
fs.writeFileSync(path.join(output,'weapon-priority-results.json'),JSON.stringify({
 schema:'fps-arena-weapon-evaluation/1',source:'tests/fixtures/game-shared/weapons.js',
 catalogSha256:provenance,scope:'diagnostic-only; scoring not applied to live weapon selection',
 scenarios:WEAPON_SCENARIOS,weaponCount:viable.length,
 excluded:Object.values(WEAPONS).filter(w=>!viable.includes(w)).map(w=>w.id),
 results:rows,
},null,2)+'\n');
const ref=['classic_cqb_6m','classic_mid_25m','classic_long_90m','classic_sniping_180m','zombies_cluster','br_ring_rotation'];
let md=`# Weapon priority evaluation — FPS Arena Combat Suite v2.6.2\n\n`+
 `**Nguồn:** bảng thống kê vũ khí trong bản game được cung cấp, SHA-256 fixture: \`${provenance}\`.\n\n`+
 `**Phạm vi:** ${viable.length} súng nhặt/sử dụng thông thường × ${WEAPON_SCENARIOS.length} tình huống = **${rows.length} đánh giá**. `+
 `So sánh từng cặp giữa **${pair.length} cặp súng**. Không bao gồm: ${Object.values(WEAPONS).filter(w=>!viable.includes(w)).map(w=>w.id).join(', ')}.\n\n`+
 `> **Không phải bảng xếp hạng sức mạnh tuyệt đối.** Điểm 0–100 là chỉ số mô phỏng heuristic từ sát thương, nhịp bắn, độ tản mát, phạm vi, vận tốc di chuyển, lượng đạn và áp lực tình huống. `+
 `Không phải xác suất thắng hay tỷ lệ headshot thực tế. Kết quả chưa được hiệu chuẩn bằng replay/trận người chơi. `+
 `Dữ liệu recoil, chuyển động đối thủ, cover, server latency chưa được mô phỏng đầy đủ. `+
 `Ưu tiên khẩu súng *để trang bị/nhặt* khác với việc *đổi sang sidearm*: Autopilot hiện vẫn ưu tiên súng chính, sidearm chỉ cứu nguy ở rất gần.\n\n`+
 `## Súng dẫn đầu theo từng kịch bản\n\n| Case | Mode | Khoảng cách | Ba vũ khí dẫn đầu (điểm) |\n|---|---|---:|---|\n`;
for(const s of WEAPON_SCENARIOS){
 const top=byScenario.get(s.id).slice(0,3).map(x=>`${x.weaponId} (${x.score})`).join('; ');
 md+=`| \`${s.id}\` | ${s.mode} | ${s.distance} m | ${top} |\n`;
}
md+='\n## Từng khẩu súng: kết quả ở các cự ly và mode\n\n'+
  '| ID | Nhóm | 6 m | 25 m | 90 m | 180 m | 8 Zombies | BR chạy bo |\n'+
  '|---|---|---:|---:|---:|---:|---:|---:|\n';
for (const w of viable){
  const cols=ref.map(id=>evaluateWeapon(w,WEAPON_SCENARIOS.find(s=>s.id===id)).score);
  md+=`| \`${w.id}\` | ${w.cat} | ${cols.join(' | ')} |\n`;
}
md+='\n## Diễn giải và cảnh báo\n\n'+
 '- Case `magazine=0` tạo hành động **reload** (còn reserve) hoặc **resupply** (hết reserve); súng vô hạn không nạp. Classic ngoài game có reserve vô hạn, còn báo cáo scoring dùng đầu vào kịch bản *cụ thể* để đánh giá tình huống cạn tài nguyên.\n'+
 '- `visible=false` chặn khai hỏa trong đánh giá; phải tìm góc ngắm khác trước khi bắn. `ringUrgent=true` làm giảm giá trị thời gian ADS và tốc độ chạy, không ra lệnh sống sót thay cho BR Ring Planner.\n'+
 '- Các trường hợp `score=100` có thể hòa do giới hạn thang điểm. File `weapon-pairwise.csv` chỉ là thống kê số kịch bản súng A/B được ưu tiên, không thể diễn giải là win rate.\n'+
 '- Kiểm thử `tests/weapon-priority-matrix.test.mjs` chạy **logic điều khiển thực tế** cho từng khẩu ở Classic, BR, Zombies: giữ súng chính, nạp băng trống, đổi sang sidearm cự ly nguy hiểm, chuyển lại súng chính, không reload không thể thực hiện, không bắn qua tường.\n'+
 '- **Chưa thay đổi thuật toán live chọn súng/đổi súng theo điểm** trong bản này để tránh vô tình phá quy tắc ưu tiên súng chính đã thống nhất; đây là bộ đo giúp quyết định các bản tuning tiếp theo.\n\n'+
 '## Cách tái tạo\n\n```bash\nnode scripts/evaluate-weapons.mjs\nnode --test tests/weapon-priority-matrix.test.mjs\n```\n';
fs.writeFileSync(path.join(output,'WEAPON_PRIORITY_REPORT.md'),md);
console.log(JSON.stringify({weapons:viable.length,scenarios:WEAPON_SCENARIOS.length,
 assessments:rows.length,pairwise:pair.length,categories:categories.length,files:4}));
