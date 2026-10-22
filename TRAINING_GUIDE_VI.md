# FPS Arena — Phòng tập mô phỏng chính chủ v2.7.0

## Mục tiêu và tính xác thực

Bộ `lab/arena/` khởi chạy **mã server gốc của FPS Arena** (được người dùng cung cấp): `source/server/game.js` xử lý mọi bước `Game.step()` ở 60 Hz, cùng `source/server/bot.js` (bot chính thức), các chế độ/mặt bằng và các thành phần `source/shared/` (input, đạn, sát thương, raycast, loot, bo). Trainee được điều khiển bởi **chính bản `page-agent.js` đã biên dịch của extension**, được lắp vào giao diện client tối giản không phụ thuộc WebGL. Lệnh của trainee phải qua `world.queueInput()` và được server xử lý bình thường. Không dùng vị trí đối thủ trực tiếp từ server để làm input trainee: nhận snapshot quan sát được với độ trễ mô phỏng (mặc định 65 ms).

Có thể sử dụng phòng tập khi không kết nối máy chủ Vercel. Không cần cài mô-đun ngoài Node.js mới cho phần training headless.

### Chạy nhanh

Từ thư mục extension đã giải nén:

```bash
node lab/arena/train.mjs --modes tdm,snd,hp,br,zm --episodes 3 --seconds 60 --bots 6 --seed 20261010 --opponents official --out reports/ARENA_AUTHORITATIVE_RESULTS.json --replay reports/ARENA_REPLAY_V270.json
```

Các cờ quan trọng:
- `--modes`: chọn các mode `tdm,snd,hp,br,zm`.
- `--episodes`: số trận mỗi mode (1–100); `--seconds`: giới hạn thời gian mỗi trận (2–360); `--bots`: số bot server (1–11, trừ Zombies dùng hệ thống zombie của game).
- `--opponents official`: **không thay đổi BotBrain gốc**. `mixed`: một phần bot thay bằng `UnrestrictedOpponent` kế thừa BotBrain. `stress`: tất cả bot thay thế, vẫn gửi thao tác hợp lệ qua engine; có thêm nhắm đầu, ADS, lean, crouch/prone, jump/slide, throwable, skill, armor nếu có thể.
- `--lag-ms 65`: trễ snapshot của client mô phỏng, không phải mô phỏng mạng đầy đủ.
- `--profile baseline|aggressive|balanced|survival`: các bộ tham số thử nghiệm; không tự áp vào người chơi thật và KHÔNG tự động sửa default extension.
- `--zombie-pose original` dùng nguyên game gốc; `--zombie-pose patched` thêm các trường tư thế vào lịch sử zombie **chỉ trong quá trình training**, để kiểm chứng bug tiềm ẩn của server.
- `--replay FILE`: xuất JSON đọc được bằng `lab/replay.html`, các trận được chia thành nhiều record.

### So sánh thông số trên seed độc lập

```bash
node lab/arena/compare-profiles.mjs --seconds 36 --episodes 2 --bots 6
```

Chương trình tạo `reports/ARENA_PROFILE_COMPARISON.json` và `.md`. Tập seed đánh giá tách biệt tập dùng để chọn phương án. **Aggressive tốt hơn trên held-out nhưng không thắng tập train**, với cỡ mẫu còn quá nhỏ; do đó vẫn giữ baseline, không khẳng định đã tối ưu chiến thuật qua lần so sánh này. Cần tăng độ phân tán bản đồ, vũ khí và seed, kết hợp record multiplayer thật.

### Chỉ số, kiểm định và giới hạn

Báo cáo có thông tin thắng/hạ gục/phát bắn/trúng/headshot (theo sự kiện server), quãng đường, số lần đảo hướng, số lần reload, tương tác nhặt đồ, hoạt động cạnh đồng đội, vị trí bo và lỗi agent. Trong JSON mỗi mode có số lượt khác nhau vì Zombies có thể chết sớm.

Điểm headshot phải **tính trên toàn bộ phát trúng**, nhưng cần xem kèm `accuracy = hits/shots` và quy mô mẫu, không dùng riêng headshot để khẳng định aim. Kết quả 90% headshot của bài bắn tổng hợp trước đây **không tái hiện được trong mô phỏng nhiều tick có server thật**.

Bản thân game Zombies lưu `z.history` mà không có `st`, `l`, `yaw`; `server/combat.js` dùng các trường này để tua ngược hitbox. Bản server người dùng cung cấp được giữ nguyên ở `source/server/modes/zombie.js`. Đề xuất sửa tương thích có trong `lab/arena/patches/zombie-stance-history.patch`, cần kiểm chứng trước khi áp dụng lên game trực tuyến. Chế độ `--zombie-pose patched` không sửa file gốc.

Mô phỏng là headless, không render Three.js, không bao quát toàn bộ nội suy animation WebGL hoặc lag/loss/mạng Vercel. Kỹ năng chống bot không chứng minh sẽ chống người chơi thật; không áp giới hạn nhân tạo lên bot gốc, nhưng các chiến thuật con người chưa thể liệt kê hết. `stress` chỉ là đa dạng hóa input hợp lệ, **không** thay thế kiểm tra online thật. Mã nguồn và bot đối thủ hoạt động với cùng engine chứ không bắt đối thủ đứng yên để bắn.

### Phát lại trận

Mở `lab/replay.html` bằng browser và chọn `reports/ARENA_REPLAY_V270.json`; file replay có định dạng `fpsarena-record-bundle-v2`. Replay này là timeline telemetry tái tạo, **không phải video** hay deterministic engine replay từ input.

### Mở rộng bài huấn luyện

1. Đánh giá tối thiểu 10–20 seeds/mode với ít nhất 2 map khác nhau; phân lớp trường hợp đứng sau cover, đồng đội, bo khẩn cấp và zombie áp sát.
2. Thêm đúng tham số qua `--profile`, giữ đối chứng baseline, đo trên seed huấn luyện và held-out. Không hardcode theo seed hoặc ID bot.
3. Đối chiếu bộ `Match Recorder` từ trận multiplayer trước khi thay default; test riêng khả năng tương thích LibreWolf.
4. Với bug ở server Zombies, xác minh ray/hitbox bằng focused test trước khi chỉnh bản game đang chạy.

## v2.7.1 — Kết quả huấn luyện và ba bản đồ Classic

Dùng `--classic-maps arena,neon,foundry` để luân phiên các map cho từng episode. Xem dữ liệu gốc và các giới hạn tại `reports/training-v271/TRAINING_REPORT_v2.7.1.md`. Bản này thực hiện tuning rule-based và held-out validation, chưa huấn luyện RL/neural weights.

## v2.7.2 — TDM dài và Adaptive Combat Peek

Đã chạy 12 trận TDM train (180 s/trận tối đa) và 6 trận seed độc lập (240 s/trận tối đa) trên Neon/Arena/Foundry, so sánh chính xác v2.7.1 với bản mới trước bot gốc và đối thủ stress. Điều chỉnh Autopilot: ưu tiên phát bắn hợp lệ khi có lợi thế, giữ cover/peek khi yếu máu, reload hoặc nhiều góc uy hiếp; sửa hướng đi bị đảo tiến–lùi do mất waypoint thoáng qua. Trong held-out, kills đạt 56→83 với bot gốc và 40→48 với stress, đảo hướng giảm; accuracy stress giảm từ 62,2% xuống 58,9%. Không chứng minh thắng người thật hoặc cải thiện phối hợp đồng đội. Toàn bộ số liệu và cách tái chạy tại `reports/training-v272/TDM_LONG_TRAINING_REPORT.md`.

Chạy phòng tập có nhãn quyết định thực (ghi ở 2 Hz, không phải video):

```bash
node lab/arena/train.mjs --modes tdm --episodes 1 --seconds 180 --bots 6 --opponents stress --seed 4421001 --trace-decisions --out reports/my-diagnostics.json --replay reports/my-diagnostics-replay.json
```


## v2.7.4 — TDM Team Positioning Laboratory (experimental, OFF by default)

Đã thêm chiến thuật thử nghiệm `squadFlank()` chọn điểm lệch góc so với đồng đội, kiểm tra đường bắn, góc camera đối thủ, khả năng di chuyển, giới hạn máu/giáp và giữ hướng flank ổn định. **Không bật mặc định**, vì trên 6 trận stress độc lập nó chưa vượt qua bộ tiêu chí đánh giá (kills 33→29, deaths 7→7). Chính sách crossfire của v2.7.2 được giữ nguyên trong extension thường.

Để kiểm thử hai cấu hình trong phòng tập headless:

```bash
node lab/arena/train.mjs --modes tdm --episodes 6 --seconds 90 --bots 6 --opponents stress --seed 790633 --classic-maps neon,arena,foundry --out reports/training-v273/baseline.json
node lab/arena/train.mjs --modes tdm --episodes 6 --seconds 90 --bots 6 --opponents stress --seed 790633 --classic-maps neon,arena,foundry --profile squad-experiment --out reports/training-v273/experimental.json
node lab/arena/evaluate-team-flank.mjs --baseline reports/training-v273/baseline.json --candidate reports/training-v273/experimental.json --out reports/training-v273/paired-comparison.json
```

Bộ đánh giá không tự kích hoạt policy kém chất lượng; trong browser option `teamFlankExperiment` được chuẩn hóa là `false` nếu không được bật rõ ràng. Các kết quả chỉ phản ánh phòng tập không có người chơi thật. Xem `reports/training-v273/TEAM_POSITIONING_REPORT.md`.


### Chạy trận BR từ đầu tới kết thúc
`node lab/arena/train.mjs --modes br --episodes 2 --full-match --seconds 480 --bots 11 --opponents official --out reports/br-full.json`
Trường `finishedNaturally` cần là `true` để coi trận đã kết thúc theo luật server.


## v2.7.5 — TDM lag-compensated aim & full-match evaluation

TDM Autopilot uses rewind-aligned aiming without a fixed 65 ms extra lead. Other modes and assist mode retain their original prediction policy. Full-match paired evaluation and how to reproduce: see `CHANGELOG-v2.7.5.md` and `lab/arena/compare-tdm-aim.mjs`.


### So sánh skill trên Training Arena (v2.7.6)
Ví dụ: `node lab/arena/train.mjs --modes tdm,hp --seconds 150 --episodes 1 --bots 9 --opponents stress --trainee-skill exo --out reports/skill-exo.json`. Thêm `--no-auto-skills` để chạy đối chứng với cùng seed. `skillCommands` là số lệnh T của Autopilot, còn `skillsActivated` lấy từ sự kiện server xác nhận. Không cấp năng lượng miễn phí trong benchmark chính; nếu không đủ năng lượng, 0 activation là hợp lệ.


### Training Arena 2.7.7 — Combat routing
Autopilot TDM now defaults to risk-gated pursuit of a server-visible sightline when a target is occluded. It respects actual A* paths, recent damage, armor, health, current projected exposure, close and ADS enemies; ring/loot and other modes are unchanged. The popup includes an opt-out checkbox. The separate `route-lab`, `strafe-lab`, `dodge-lab`, `combined-lab`, `route-strafe`, `sightline-lab`, and steering profiles remain reproducible experimental policies; do not use their training scores as human-player guarantees.

To compare: `node lab/arena/train.mjs --modes tdm --episodes 3 --full-match --seconds 600 --bots 9 --opponents stress --classic-maps neon,arena,foundry --seed 345678 --profile route-lab --out reports/tdm-experiment.json`. For an untouched v2.7.6 tactical baseline, use `--profile baseline`. Summary: `CHANGELOG-v2.7.7.md` and `reports/TDM-TRAINING-v2.7.7.md`.
