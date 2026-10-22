# Hướng dẫn FPS Arena Combat Suite v2.8.1

## Mới trong v2.8.1 — Tối ưu giảm giật do A*

- Bộ tìm đường nhiều tầng phân chia tác vụ thành nhiều frame, không giữ luồng mô phỏng trong hàng trăm ms khi phải tìm qua cầu thang.
- Tăng tốc kiểm tra va chạm bằng chỉ mục không gian dùng lại theo bản đồ.
- Khắc phục việc bot kiểm tra lại vị trí chiếm lợi thế khi đối thủ hồi sinh ở mỗi frame dù không có đường đi khả thi.
- Benchmark TDM/BR stress: 74 → 2 tick AI quá 16ms trên 7.680 tick. Tuy nhiên kills TDM giảm 7 → 3; tính hiệu quả chiến đấu chưa được bảo đảm.
- Kiểm thử kỹ thuật: xem `reports/PERFORMANCE-v2.8.1.md`. Chỉ số độ trễ được đo trong headless Node.js, không phải FPS trực tiếp trên LibreWolf.

## Mới trong v2.8.0 — Điều hướng đa tầng, đổi súng và sửa bóp cò

- **Phím đổi súng V:** mở trò chơi, nhấn V để đổi giữa 2 khẩu nếu đã trang bị; có thể chỉnh trong popup → Phím đổi súng. Hoạt động ngay cả khi Aim Assist tắt, không tác động khi Autopilot đang điều khiển.
- **Battle Royale nhiều tầng:** tìm đường lên/xuống sàn bằng các bậc và cầu thang đúng vật lý, kiểm tra vật cản theo cả độ cao; không dịch chuyển xuyên sàn.
- **Bớt lặp đường vô ích:** kiểm tra tiến triển dựa trên quãng đường còn lại của tuyến thay vì cứ đi lại là tính có tiến triển; bảo lưu lộ trình ngắn hạn khi snapshot loot bị gián đoạn.
- **Có mục tiêu mà không bắn:** cập nhật bước cuối của bộ phân xử hành động để phục hồi lệnh khai hỏa hợp lệ, không ép bắn khi có tường che, cần nạp đạn hoặc đang mặc giáp.
- **Kiểm thử:** 509/509 bài tự động đạt, 5 chế độ mô phỏng không lỗi runtime. Chưa thể khẳng định giảm đảo hướng ổn định ở mọi bản đồ; xem `reports/ROUTING-v2.8.0.md`.

## Nâng cấp Aimbot cho mục tiêu nghiêng trái/phải (Q/E)

- Bám theo đúng hitbox server: đầu dịch trọn độ nghiêng, thân chỉ dịch một nửa; sửa lệch ngắm thân của bản cũ.
- Ước lượng hướng nghiêng từ 2 snapshot gần nhất, nhưng giới hạn dự đoán vì trạng thái mạng và cú đảo Q/E có thể thay đổi đột ngột.
- Khi đối thủ đổi nghiêng rất nhanh, ưu tiên bắn thân (vùng trúng lớn hơn). Khi đầu bị chắn nhưng thân còn lộ, thử ngắm thân; không bắn nếu toàn bộ hitbox bị chắn.
- Hệ thống Aim Assist/Autopilot áp dụng tự động sau khi bật, không cần cài đặt bổ sung. Match Recorder, Auto Loot, các chế độ game và domain tùy chỉnh được giữ nguyên.

**Lưu ý:** Không thể đảm bảo bắn trúng mọi phát: server vẫn tính lag compensation, độ phân tán đạn, vật cản và chuyển động mục tiêu. Chưa kiểm thử một trận multiplayer LibreWolf thật.

# FPS Arena Combat Suite v2.6.7 — LibreWolf

Bản tương thích được đối chiếu với `fps-arena-main(1).zip` do người dùng gửi ngày 09/10/2026.

## Bản v2.6.7 — Sửa lỗi Autopilot, chạy bo, Match Recorder và chống giật di chuyển

- **Zombies mất Autopilot:** Bản build cũ thiếu module `zombie-weapon-choice.mjs` mặc dù gọi `preferredZombieSlot()`. Đã tích hợp module đầy đủ. Khi lỗi nhất thời, bot trả về input gốc và thử khôi phục sau khoảng chờ ngắn, không tự lưu `enabled=false` nữa. Trạng thái đường đi cũ được xóa khi chuyển trận/mode.
- **Battle Royale:** Chủ động đi bo kế tiếp sớm hơn theo tốc độ di chuyển bảo thủ 3,8 m/s và thêm thời gian dự phòng; trong khi bo đang thu, việc đi bo có ưu tiên cao hơn né/peek/loot. Nếu vật cản chặn đường thực sự, vẫn cần thử trên bản đồ thật.
- **Di chuyển bớt giật:** Thêm lọc hướng và khoảng giữ hướng ngắn 0,14 giây trước khi đảo hướng; khi muốn đứng yên sẽ nhả hẳn các phím đi lại. Không làm chậm né nguy hiểm hay chạy bo.
- **Match Recorder hoạt động lại:** Sửa `page-agent.js` thiếu module lấy mẫu. Sự kiện start/sample/end được gửi theo đúng thứ tự. Ghi **tự động tất cả mode Classic, Zombies, Battle Royale**, hỗ trợ **nhiều trận liên tiếp**, lưu tối đa **30 trận mới nhất**, mỗi trận tối đa **1800 mẫu, 800 sự kiện** (2 mẫu/giây); lưu cục bộ định kỳ 8 giây/lần và khi kết thúc trận. Popup cho phép **Xuất trận mới nhất** hoặc **Xuất tất cả trận** ra JSON. Bật ghi trận độc lập với Autopilot. Nút xóa dữ liệu không tắt chức năng ghi.
- **Lưu ý dung lượng:** Sau khi có nhiều trận, hãy xuất tất cả rồi lưu JSON ra máy để giữ bản ghi lâu dài. Dữ liệu vượt giới hạn lưu trữ nội bộ sẽ bị loại theo thứ tự cũ nhất. Không quay video, âm thanh, không tự gửi dữ liệu ra internet.

Đã kiểm tra 409/409 bài kiểm thử, 41/41 kiểm tra API game. Chưa xác minh trực tiếp một trận trên LibreWolf.

## Trước đó: v2.6.6 — Reload khi bị áp sát, Peek khó đoán, phân tích vũ khí địch và BR Loot

- **Địch áp sát trong lúc còn đạn:** không tự nạp thêm băng. Nếu shotgun đang nạp từng viên, bot có thể khai hỏa để ngắt nạp. Với băng đạn thông thường đã bắt đầu nạp, game không cho ngắt bằng phím bắn: bot chỉ thực hiện chuyển vũ khí đi–về khi thời gian nạp còn trên 0,9 giây và có đối thủ áp sát. Mất khoảng 0,8 giây khóa đổi súng nên không phải lúc nào cũng nhanh hơn tiếp tục nạp. Nếu băng rỗng, quy tắc ưu tiên nạp súng chính và sử dụng sidearm ở cự ly gần vẫn được giữ.
- **Peek không theo chu kỳ cứng:** lựa chọn bên trái/phải dựa trên mức nguy hiểm và lịch sử gần đây, có thể lặp một bên hoặc đổi bên thay vì luân phiên bắt buộc. Thời gian ẩn nấp, di chuyển ra góc bắn và rút về biến thiên độc lập, đôi khi chờ dài 2,2–8 giây. Chỉ peek ở vị trí có đường bắn và cover phù hợp.
- **Phản ứng theo súng địch:** đánh giá vũ khí đối thủ qua ID được server gửi. Tránh khoảng cách shotgun/SMG áp sát; ưu tiên đi ngang hoặc tìm vật cản nếu bị sniper ngắm ở xa; tìm cover trước khi lộ trên đường bắn LMG. Sử dụng thông tin hướng camera yaw/pitch, không giả định biết đạn còn lại trong băng địch.
- **Battle Royale nhặt đồ khi có cơ hội:** không bỏ mọi crate khi kẻ địch chỉ xuất hiện ở xa. Nhưng tránh nhặt khi gần địch, bị sniper/DMR/LMG quan sát, ở ngoài bo, hoặc cần di chuyển vào bo kế tiếp. Khi cả hai slot đầy, so điểm vũ khí mới với cả hai khẩu đang cầm và tự chuyển sang slot yếu hơn trước khi nhặt, không vô tình vứt súng chính tốt.
- **Kiểm thử:** 403/403 bài tự động đạt và 41/41 kiểm tra cấu trúc API đối chiếu với mã game người dùng gửi. Popup Chromium được kiểm thử nhưng chưa xác nhận trực tiếp trận multiplayer trên LibreWolf.

## Bản v2.6.5 — Chọn súng Zombies và Match Recorder

Trong Zombies, súng primary là pistol yếu không còn buộc bot ưu tiên hơn rifle/LMG tốt ở slot secondary. Match Recorder là tùy chọn độc lập (mặc định tắt), ghi JSON vị trí, góc nhìn, vũ khí, quyết định Autopilot và các sự kiện chiến đấu, có thể xuất từ popup. Trước v2.6.7 tối đa 3 trận; hiện đã nâng lên 30 trận, 1800 mẫu và 800 sự kiện/trận. Không ghi video hoặc âm thanh.

## Mới trong v2.6.3 — Ưu tiên vũ khí hoạt động trực tiếp

- Đưa thuật toán đánh giá từ v2.6.2 vào Autopilot: tính điểm tình huống từ khoảng cách, nhịp bắn, đạn trong băng, áp lực địch và chế độ chơi. Điểm chỉ điều chỉnh **chiến thuật/giữ khoảng cách**, không quyết định cho phép bắn nếu game không cho.
- Sniper/DMR giữ khoảng cách; SMG/shotgun có thể chủ động tiếp cận hơn khi khả năng giao tranh tốt, nhưng vẫn tôn trọng khoảng cách zombie.
- Trong BR/Zombies, khi cả hai slot đã có súng, server sẽ **thay súng đang cầm** nếu nhặt súng rơi. Auto Loot bảo vệ súng chính: không nhặt súng rơi khi đang giữ súng chính và cả hai slot đều có vũ khí. Khi đang cầm súng phụ, chỉ xét thay thế khi mô hình đánh giá khẩu mới mạnh hơn đủ rõ ràng.
- Giữ chính sách **súng chính luôn ưu tiên**, nạp đạn súng chính hết băng, sidearm chỉ cứu nguy khi địch áp sát, chạy bo khẩn cấp cao hơn loot/giao tranh.
- Trong popup, dùng checkbox **Chiến thuật động theo từng khẩu súng và tình huống (Autopilot)** để bật/tắt; mặc định bật nhưng chỉ hoạt động khi bạn chủ động bật Autopilot.

## Trước đó: v2.6.2 — Bộ đánh giá độ ưu tiên vũ khí

- Tạo **32 tình huống chiến đấu riêng cho từng khẩu trong 75 vũ khí có thể dùng/loot**, tổng **2.400 đánh giá**, và so sánh từng cặp trong **2.775 cặp súng**.
- Đánh giá Classic, Zombies, BR; cự ly 2–180 m, số lượng kẻ địch, lượng máu, băng đạn/trữ đạn, tường chắn, khả năng nạp đạn, chạy bo và đi crate.
- Kiểm thử trực tiếp `manageResources()` + `stepWeapons()` cho 75 khẩu qua ba chế độ, kèm 75 test riêng cho nhịp bắn và lượng đạn: giữ súng chính, nạp khi cạn băng, dùng súng phụ khi áp sát, quay về súng chính và không bắn khi tường che.
- Mở `reports/WEAPON_PRIORITY_REPORT.md` để đọc bảng tổng kết; `reports/weapon-priority-scenarios.csv` cho từng súng/từng case; `reports/weapon-pairwise.csv` để so cặp; `reports/weapon-priority-results.json` để nạp vào công cụ phân tích.
- **Điểm xếp hạng là heuristic mô phỏng, chưa được đo trong trận thật và không phải win rate.** Bản này chưa thay đổi logic chọn/đổi súng đang chạy để không phá ưu tiên súng chính.

## Bản vá nóng v2.6.1 — sửa lỗi game dừng do định tuyến

- Sửa lỗi `state.goal is null` trong `Input.sample()` khi sniper tìm góc bắn nhưng không có điểm ngắm hợp lệ. Lỗi v2.6.0 đã được tái hiện bằng kiểm thử tích hợp.
- Tách bộ nhớ đường đi của sniper và đường đuổi mục tiêu, kiểm tra điểm đích trước khi đọc tọa độ; bổ sung bảo vệ cho đường chạy bo.
- Nếu extension phát sinh lỗi mới, tự tạm dừng bộ điều khiển và **trả về input gốc** của game, không làm hỏng vòng mô phỏng. Có thể bật lại từ popup sau khi kiểm tra lỗi.
- Lỗi `annihilator.glb` trả 404 là lỗi thiếu asset ở website game, độc lập với extension này.
- Chưa kiểm chứng trận multiplayer trực tiếp trên LibreWolf.

## Mới: dự đoán địch và tìm đường né đạn (v2.5.8)

- Bật **Tự động né nguy hiểm** + **Threat-Aware Routing** trong mục Auto Evade. Trong Autopilot, bot tìm đường qua những vị trí có cover, chấm điểm cả toàn bộ tuyến thay vì chỉ xét hướng né tức thời. Tùy chọn phân tích nhịp bắn của đối thủ được bật mặc định.
- Đối thủ di chuyển được dự đoán bằng hai snapshot gần nhất; tính thêm góc nhìn, đường bắn, tường che, lựu đạn và khoảng cách; tuyến sẽ tính lại khoảng 0,42 giây/lần hoặc nếu bị kẹt.
- Khi đi loot hoặc xoay bo **chưa khẩn cấp**, A* sẽ tránh tuyến phơi nhiễm nếu có lựa chọn. Khi ngoài bo hoặc nguy cơ mất bo, ưu tiên chạy vào bo trước.
- **Không có dữ liệu số đạn chính xác của đối thủ.** Bot chỉ đếm các sự kiện bắn mà client quan sát được và ước lượng mức áp lực, không thể khẳng định đối thủ đã hết đạn/nạp lại.
- Vẫn có giới hạn A* 2D, chỉ dùng được vật cản tĩnh ở độ cao tương ứng, không bảo đảm tránh hết hitscan hoặc tìm được lối thoát khi bị vây kín.

## Tính năng mới v2.6.6

**Chọn súng theo hiệu quả Zombies:** Nếu súng primary là pistol yếu nhưng secondary là rifle/SMG/LMG tốt hơn, bot được phép chiến đấu bằng slot thứ hai. Khi nhặt súng mới mà đã đủ hai khẩu, bot xác định slot yếu hơn rồi chuyển sang slot đó trước khi nhấn F. Không còn bắt buộc bảo vệ một khẩu pistol yếu chỉ vì nằm trong slot primary. Quy tắc súng chính của Classic/BR không đổi.

**Match Recorder:** Trong popup, bật **Ghi trận đấu (telemetry)** rồi tham gia một trận. Có thể bật dù Combat Suite và Autopilot đang tắt. Sau khi chơi, mở popup → **Xuất JSON trận mới nhất** để nhận dữ liệu vị trí, vũ khí, đạn, các quyết định, mục tiêu, các sự kiện bắn/trúng đạn và tuyến nhặt đồ. Gửi tệp JSON trong cuộc trò chuyện để phân tích diễn biến và tìm nguyên nhân lỗi. Dữ liệu chỉ lưu trong trình duyệt, không truyền tới dịch vụ bên ngoài. Nút **Xóa bản ghi** xóa dữ liệu đã lưu.

Từ v2.6.7 lưu tối đa 30 trận, 2 mẫu/giây, 1800 mẫu và 800 sự kiện mỗi trận. Đây là **telemetry**, không phải video hay âm thanh. Nếu cần video, quay riêng bằng công cụ ghi màn hình. Một số bản ghi cuối trận có thể mất nếu trình duyệt bị tắt đột ngột trước khi kịp lưu.

## Cài đặt nhanh

1. Giải nén `FPS-Arena-Combat-Suite-v2.6.8.zip` ra một thư mục riêng.
2. Mở LibreWolf → `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → chọn file `manifest.json` trong thư mục vừa giải nén.
3. Mở **https://fps-arena-rosy.vercel.app/** hoặc bản FPS Arena nội bộ chạy tại `http://localhost:3000/` / `http://127.0.0.1:3000/`.
4. Tải lại tab game sau khi cài tiện ích. Bấm biểu tượng extension → kiểm tra trạng thái nhận diện game và chọn tính năng muốn bật.
5. Trong trận, click để khóa chuột vào game. Phím **F8** bật/tắt riêng bộ điều khiển chính.

**Chú ý:** Extension tạm trong `about:debugging` sẽ bị gỡ khi LibreWolf khởi động lại. Nếu web đã mở trước khi cài, tải lại tab.

## Thêm tên miền riêng

Tại popup → **Tên miền trò chơi**:

- Tên miền mặc định: `https://fps-arena-rosy.vercel.app`, `http://localhost` và `http://127.0.0.1`. Với localhost hỗ trợ các cổng bất kỳ.
- Nhập URL HTTPS hoặc tên miền, ví dụ `https://arena.example.org/play`, bấm **Thêm** và chấp thuận yêu cầu quyền truy cập cho hostname đó.
- Nhấn **Lấy từ tab đang mở** để tự điền URL hiện tại; sau đó bấm **Thêm**.
- Có thể xóa domain đã thêm trong danh sách. Tải lại tab khi thêm/xóa để cập nhật đầy đủ.
- Giới hạn 25 origin tự chọn. Các host công khai yêu cầu HTTPS; HTTP chỉ dành cho loopback/LAN.
- Extension chỉ nhận diện bản web FPS Arena với `/client/main.js` và cấu trúc DOM chuẩn của game. Nó không chạy trên web khác chỉ vì được cấp quyền.

## Các nhóm tính năng

- **Aim:** Aimbot, dự đoán di chuyển, lọc vật cản, ưu tiên mục tiêu, Triggerbot, bù giật camera.
- **ESP / radar:** Khung vị trí mục tiêu qua tường, tên, khoảng cách và radar 360°.
- **Movement:** Auto Evade (dự đoán nguy hiểm), Tactical Movement, peek/retreat và A* 2D để tìm đường vòng.
- **Resources:** Thay đạn, đổi súng, sử dụng giáp và gợi ý góc ném lựu đạn.
- **Autopilot:** Hợp nhất các hệ thống trên, chỉ hoạt động khi game nhận input của người chơi.

Các tính năng tự động **tắt mặc định**. Dùng preset **Bật bộ tính năng** khi chủ động kiểm thử, hoặc **Tắt bộ tính năng** để trở về trạng thái thường.

## Tương thích với bản game 09/10/2026

- Lọc theo `you.tm` do server gửi, bao gồm **4 đội Battle Royale**; không khóa đồng đội cùng squad.
- Bảo toàn input scorestreak (`streak` và Digit1/2/3). **Không can thiệp** vào góc nhìn và điều khiển trong camera trực thăng/tên lửa, khi hồi sinh/nhảy dù hoặc đang bị hạ gục.
- `Game.remotes`, `Game.zremotes`, `CameraRig.look`, `Game.simTick`, `Input.sample` được đối chiếu với source ZIP mới.
- Các hệ thống cũ không còn trong game (ví dụ body-remotes) là tùy chọn, không gây lỗi khi vắng mặt.

## Giới hạn và kiểm thử

- Aimbot/ESP chỉ sử dụng dữ liệu mà trình duyệt đã nhận. Không mở khóa dữ liệu server không gửi; không sửa sát thương/va chạm.
- Auto Evade không thể né các viên đạn hitscan đã trúng; nó cố gắng dự báo nguy cơ.
- A* chỉ hoạch định 2D; vị trí nhiều tầng, zipline và phương tiện không được xử lý đầy đủ.
- Hỗ trợ game **web**, không tác động bản Electron desktop.
- Đã chạy unit/integration, cấu trúc API nguồn mới và smoke test popup Chromium. Chưa có kiểm thử end-to-end trong trận multiplayer bằng LibreWolf thực tế.

## Kiểm thử / build lại

```bash
node scripts/build.mjs
node --test tests/*.mjs
node tools/check-game-compat.mjs /path/to/fps-arena-main
python scripts/package.py
```


## Thay đổi trong v2.3 — Nạp đạn và chiến thuật theo súng

- **Bản v2.3** từng tự nạp ngay khi băng trống; quy tắc v2.5.0–v2.5.9 yêu cầu chờ an toàn. **Từ v2.6.0**, súng chính hết băng và còn đạn dự trữ sẽ nạp ngay, trừ khi phải đổi sang sidearm để tự vệ cực gần.
- **Nạp đạn chủ động** khi tương đối an toàn, theo ngưỡng băng đạn từng nhóm súng.
- **Đổi súng phụ** nếu đang bị áp sát và băng đạn chính trống; ưu tiên nạp đạn khi không nguy hiểm.
- **Shotgun nạp từng viên** tiếp tục nạp nếu an toàn, nhưng có thể ngắt để bắn khi đối thủ gần.
- **Bắn bán tự động** nhấn–nhả cò đúng chu kỳ cho pistol, DMR và sniper.
- **Chiến thuật theo nhóm súng:** shotgun áp sát; SMG flank; rifle giữ tầm trung; sniper/DMR giữ tầm xa; LMG giữ góc và cover; pistol đánh tầm gần. Tham số vẫn được điều chỉnh từ các số liệu của từng khẩu súng.
- **Chiến thuật tự động theo từng loại súng:** tùy chọn trong popup, bật mặc định. Tắt tùy chọn này để dùng khoảng cách thủ công.

**Giới hạn:** Chưa có navmesh 3D và chưa kiểm chứng trận trực tiếp trên LibreWolf. Trong v2.5.8, nếu cả hai súng không còn viên đạn nào và hết dự trữ, bot chủ động tìm đạn tương thích hoặc crate thay vì tiếp tục ngắm bắn giả. Không bảo đảm né hết đạn hay chiến thắng.


## Cập nhật v2.5.0 — sinh tồn & nhặt đồ

- **Nạp súng chính trước (v2.6.0):** khi băng đạn súng chính rỗng và còn đạn dự trữ, nạp ngay bằng lệnh R thực tế. Chỉ dùng súng phụ nếu địch áp quá gần (ngưỡng cấu hình, mặc định 10 m); khi an toàn lại chuyển về súng chính để nạp. Mốc 3,5 giây yên giao tranh chỉ dành cho nạp bổ sung băng còn đạn, không chặn nạp súng chính rỗng.
- **Áo giáp:** không thay khi có địch ở gần/đường bắn có thể bị lộ, hoặc khi vừa bắn/trúng sát thương. Mỗi lần thay giáp kéo dài 3 giây; game không cho hủy giữa chừng.
- **Zombie:** giữ khoảng cách mặc định 22 m với zombie gần nhất, tránh chạy lùi vào bầy và kiểm tra vật cản. Tự nhặt đồ chỉ khi khu vực đủ an toàn; không nhặt đồ đang bị zombie bao vây.
- **Battle Royale & Zombies:** tự tìm rương, súng rơi, đạn, giáp, vật phẩm bằng dữ liệu server gửi cho client. Rương/súng cần tới gần + tự ngắm + nhấn F; đạn/giáp nhặt bằng cách đi qua. Có thể bật tìm đường A* 2D.
- **Popup:** `Auto Loot`, `Bán kính tìm đồ`, `Giữ khoảng cách zombie`, `Thời gian yên giao tranh trước nạp đạn`.
- **Giới hạn:** Autopilot vẫn là thuật toán heuristic, không bảo đảm thắng pro player. Việc đi đường nhiều tầng và an toàn tại vị trí gần địch đang chuyển động chưa được kiểm chứng trong trận multiplayer LibreWolf.

- **BR vòng bo:** ưu tiên di chuyển vào trong khi ở sát mép vòng hoặc đang mất máu vì gas; khi đường thẳng bị chắn hoàn toàn, hệ thống có thể chưa tìm được đường vòng nhiều tầng.


## Tư thế di chuyển Autopilot (2.5.0)

- **Auto Slide**: Trượt theo hướng chạy khi đường phía trước trống khoảng 6,5 m,
  không bắn/ngắm/nạp/giáp/tương tác. Không trượt liên tục hoặc sát zombie.
- **Auto Crouch**: Cúi giữ tại cover/góc bắn; vẫn có thể bắn khi cúi. Khi phải
  rút lui hoặc chạy đường dài thì đứng dậy để lấy lại tốc độ.
- Tích/bỏ từng mục trong **TACTICAL MOVEMENT** để điều chỉnh.
- Tự đổi tư thế chỉ hoạt động ở chế độ **Autopilot**. Trượt là xung đầu vào
  theo cơ chế vật lý game (không dịch chuyển/teleport).


## Bản v2.5.0 — Né bằng cúi/trượt và phản ứng ngắm bắn nhanh

- **Auto Slide**: trượt theo hướng rút lui, đổi vị trí hoặc né nguy hiểm khi
  đường trước mặt trống 6,5 m, ở mặt đất, hết hồi chiêu. Nếu nguy hiểm nghiêm
  trọng, Autopilot có thể ngừng bắn/ADS **1 tick** để bắt đầu trượt rồi tiếp tục
  bắn trong lúc đang trượt. Không trượt đang nạp, thay giáp hoặc bấm F.
- **Evasive Crouch**: cúi nhanh theo nhịp khi dự đoán đang nằm trong đường bắn;
  có thể tiếp tục ngắm/bắn trong lúc cúi. Tự đứng khi phải di chuyển thật nhanh.
- **Zombie Kiting**: có thể trượt để thoát zombie ở gần nếu vị trí cuối trượt
  an toàn hơn trước **đối với mọi zombie gần đó**, tránh trượt vào bầy.
- **Fast Target Acquisition**: quét chọn đối thủ đã lộ diện trên mỗi tick game
  (dự kiến 60 tick/giây) và xoay góc ngắm trước khi game gửi input bắn. Mục tiêu
  khuất tường chỉ được dùng tìm đường, không được ưu tiên hơn mục tiêu thấy rõ.
- Các tùy chọn mới có thể tắt độc lập trong popup: **Auto Slide, Auto Crouch,
  Evasive Crouch, Fast Target Acquisition**.

**Giới hạn:** vị trí kẻ địch là dữ liệu nhận từ server ở snapshot 30 Hz; đường
bắn, spread, ping, tốc độ đạn và xác thực trúng đạn vẫn phụ thuộc game/server.
Không có cam kết 100% bắn trúng hay né được hitscan. Chưa kiểm thử trận
multiplayer thực tế trên LibreWolf.


## Thay đổi v2.5.2: Tìm súng, chạy bo, nạp súng phụ

1. **Tay không (BR / Zombies)**: bot tìm súng, crate; không ngắm hay bắn giả, không cúi/strafe quanh kẻ địch như đang cầm súng. Có thể tìm các khu vực mới nếu không có đồ rơi gần đó. Nếu zombie sát người, ưu tiên thoát hiểm ngắn.
2. **Battle Royale**: khi sát mép/ngoài vòng bo, hoặc sắp bị bo tiếp theo cắt, bot chạy tới vùng an toàn (có tìm đường qua vật cản bằng A* 2D). Ưu tiên cao hơn loot, nạp đạn, thay giáp và giao tranh; điều kiện địa hình nhiều tầng vẫn có giới hạn.
3. **Nạp súng phụ**: trong khoảng yên giao tranh, nếu súng chính có đạn và súng phụ còn ít đạn nhưng có reserve, bot đổi sang súng phụ, đợi hết thời gian chuyển súng, nạp xong và chuyển lại súng chính. Khi gặp địch, nó hủy nạp và ưu tiên súng còn đạn. Không đổi sang fists để chiến đấu. Chế độ Assist vẫn tôn trọng thao tác của người chơi.

Sau khi cập nhật extension tạm, tải lại tab game trên tên miền mặc định `https://fps-arena-rosy.vercel.app/` hoặc tên miền tùy chỉnh đã cấp quyền.

## Bản v2.5.3 — Né góc tường trong Zombies và hồi phục súng chính Classic

- **Zombies:** thuật toán tìm đường mới duyệt các ô đất *thực sự đi tới được*,
  phạt đường cụt, khu vực gần nhiều zombie và các lối quá hẹp. Khi bị dồn vào
  góc, bot có thể đi men theo tường, vòng qua đầu tường trước khi tăng
  khoảng cách với đàn zombie thay vì tiếp tục đâm vào tường.
- **Chống kẹt:** lưu waypoint, ghi nhận tiến độ dịch chuyển thật từ `stepMove`,
  buộc lập tuyến khác nếu không tiến được; khống chế tần suất tính toán lại để
  giảm giật/lag khi bị nhốt hoàn toàn. Planner Zombies chạy ngay cả khi chưa bật
  tùy chọn A* dành cho việc đuổi mục tiêu.
- **Classic:** súng chính hết băng → dùng súng phụ còn đạn trong giao tranh →
  khi thực sự an toàn, quay về súng chính → chờ đổi súng xong → nạp đầy →
  tiếp tục dùng súng chính. Nếu bị tấn công trong lúc nạp, bot có thể quay về
  súng phụ còn đạn và nạp lại súng chính vào thời điểm an toàn tiếp theo.
- **Không thay đổi:** vẫn khóa nạp đạn/thay giáp giữa giao tranh; Zombies/BR
  tiếp tục có tính năng loot, và BR vẫn ưu tiên chạy bo.

**Giới hạn:** dự đoán 2D, không bảo đảm thoát được phòng bị bịt kín hoặc
địa hình nhiều tầng. Cần kiểm thử thêm trong trận Zombies/Classic thật trên
LibreWolf để đánh giá chuyển động và độ ổn định trên mạng.

## Bản v2.5.4 — Khắc phục nạp đạn Zombies, nhặt crate, né và phản ứng khai hỏa

- **Nạp đạn Zombies:** Không còn khóa nạp đạn chỉ vì còn nhìn thấy zombie ở xa.
  Bot ước tính thời gian nạp của súng đang cầm và khoảng cách đến zombie còn
  sống gần nhất; chỉ bắt đầu nạp nếu khoảng đệm đủ an toàn. Zombie ở sát người
  vẫn khiến bot ưu tiên chạy thoát hoặc chuyển sang vũ khí đã có đạn.
- **Tìm crate:** Đánh giá tuyến đường đến tối đa 5 crate/vật phẩm có triển vọng,
  loại đường quá gần zombie, xét vòng qua tường và thời gian di chuyển. Có phát
  hiện kẹt, tính lại lộ trình và tránh tạm crate không thể tới. Điều hướng loot
  Zombies hoạt động dù tắt pathfinding giao tranh thông thường.
- **Bắn ngay:** Di chuyển để nhặt crate không còn vô hiệu hóa việc bắn khi
  có mục tiêu rõ ràng; chỉ tạm ngừng khi đang tương tác F với crate. Không
  chuyển súng để tự bảo dưỡng súng phụ khi đang khai hỏa.
- **Evade:** Tăng lựa chọn hướng né và kiểm tra vật cản tại nhiều vị trí
  chiều cao/chiều rộng; không giữ nhầm trạng thái né từ tick trước.
- Vẫn giữ nguyên tính năng Classic, Battle Royale, Vercel, và các host tùy chỉnh.

**Giới hạn:** Chưa chạy thử multiplayer thực tế trên LibreWolf. Những dự đoán
này không thể bảo đảm né trúng mọi hitscan, cũng không thể bảo đảm thoát khỏi
vị trí không có lối đi an toàn trong mọi bản đồ.


## Bản v2.5.8 — Battle Royale: tiếp cận chủ động và chạy bo sớm

- **Áp sát quyết đoán:** Khi vũ khí còn đạn, đủ máu/giáp và đối thủ nằm
  ngoài tầm giao tranh tối ưu, bot có thể chủ động tiến lên thay vì đứng
  strafe liên tục. SMG/shotgun chủ động áp sát; rifle giữ tầm trung;
  DMR, sniper và LMG tiếp tục ưu tiên tầm bắn hiệu quả.
- **Không đuổi địch ra ngoài bo:** Tuyến đến đối thủ hoặc waypoint đuổi theo
  sẽ bị từ chối nếu mục tiêu nằm ngoài vòng an toàn, đặc biệt khi bo
  tiếp theo sắp thu.
- **Xoay bo chủ động:** Tính thời gian tối thiểu để đến bo kế tiếp từ
  vòng bo do server thông báo, cộng thời gian đệm cho địa hình và bị
  cản đường. Xoay bo sớm vẫn được ngắm/bắn mục tiêu đang lộ diện.
  Nếu đã ở ngoài bo, bo đang thu hoặc đang vào giai đoạn kết thúc,
  chạy vào bo có ưu tiên cao nhất, tạm bỏ loot và khai hỏa.
- **Cài đặt mới (popup):** `Battle Royale — mức độ chủ động giao tranh`
  mặc định 80/100; `Battle Royale — thời gian dự phòng chạy bo` mặc định 24s.
  Giảm mức chủ động khi cần sinh tồn; tăng thời gian dự phòng khi gặp
  nhiều vật cản hoặc ping cao.

Lưu ý: BO gây 5 HP/giây ban đầu, tăng gấp ba mỗi 5 giây liên tiếp
ở ngoài vòng theo server. Không bảo đảm thoát bo ở địa hình bất khả thi;
chưa kiểm chứng trận đấu trực tiếp trên LibreWolf.


## v2.5.8 — Sniper proactive engagement

- Quét mục tiêu xa hơn theo tầm bắn thực tế của sniper/DMR, giữ giới hạn cho vũ khí tầm gần.
- Không chặn phát bắn chỉ để giảm tốc độ di chuyển khi súng ngắm đã khóa mục tiêu; bắn sau khi ADS sẵn sàng.
- Có thể tìm điểm nhìn thông thoáng quanh vật cản bằng A* 2D có cache; không ép di chuyển xuyên tường.
- Khi đang chuẩn bị chạy bo (chưa nguy cấp), vẫn duy trì tự động khóa mục tiêu và ADS; khi bo nguy cấp thì chạy bo trước.
- Chưa xác minh trực tiếp một trận LibreWolf; các bài kiểm thử không bảo đảm mọi viên đạn sẽ trúng.


## Cập nhật v2.5.8 — Reload, crate Zombies và chọn chiến thuật súng

- **Zombies tự nạp đạn:** khi đang vừa chạy tránh zombie vừa nạp, thuật toán tính khoảng cách đóng thực tế (tốc độ zombie trừ vận tốc rút lui của nhân vật), thay vì yêu cầu mọi zombie phải biến mất. Khi hai súng hết băng, nếu đã thoát phạm vi cận chiến sẽ thử nạp thay vì né vô hạn. Không đảm bảo an toàn nếu địa hình chặn lối thoát.
- **Đi nhặt crate chủ động hơn:** giảm bộ lọc loại crate quá xa; ưu tiên đường tới crate có thể đi vòng tường và tránh hướng zombie tiến đến. Chỉ hủy mục tiêu loot khi nguy hiểm trực tiếp hoặc điểm đến/đường đi bị chặn.
- **Hết sạch ammo:** tự chuyển sang tìm đạn tương thích, súng rơi và crate, không ngắm bắn giả khi không còn viên nào có thể sử dụng.
- **Classic:** nếu súng chính mạnh đã nạp xong, Autopilot sẽ chuyển lại từ sidearm. Nếu còn đạn dự trữ nhưng súng chính trống, đợi đủ thời gian yên giao tranh hoặc có cover thật, nạp súng chính rồi tiếp tục sử dụng.
- **Sniper / DMR:** không còn áp sát không cần thiết ở cự ly 20–80 m; ưu tiên giữ khoảng cách, di chuyển sang góc có đường bắn, chỉ tiếp cận khi mục tiêu ở ngoài tầm hiệu quả.
- Các cấu hình tên miền tùy chỉnh và tính năng phiên bản trước vẫn được giữ. Toàn bộ tính năng Autopilot chỉ áp dụng khi người dùng chủ động bật.

**Giới hạn:** Không bảo đảm toàn bộ crate đều nhặt được, mọi vòng bo đều sống sót hoặc bot đạt kỹ năng vận động viên chuyên nghiệp. Phải thử thực tế trên LibreWolf và bản game đang deploy để xác minh hiệu quả.


## v2.5.9 — Primary-first weapon selection / Ưu tiên súng chính

- Autopilot ưu tiên **slot 0 (súng chính)** khi có đạn; không đổi sang súng phụ chỉ vì một đối thủ ở xa đang nhìn thấy được.
- **Sidearm emergency:** chỉ được chuyển sang súng phụ khi súng chính không thể bắn (hết đạn/đang nạp) và đối thủ/zombie tới gần hơn ngưỡng cấu hình (mặc định 10 m).
- Nếu đối thủ còn xa, giữ khoảng cách hoặc tìm che chắn; phục hồi/nạp súng chính khi có cửa sổ an toàn. Khi súng chính sẵn sàng, lập tức quay lại.
- Không tự đổi sang súng phụ để bảo dưỡng/nạp định kỳ. Nếu người chơi đang dùng súng phụ trong Assist, lệnh thủ công vẫn có quyền ưu tiên.
- Nếu đang cầm sidearm tạm thời, chiến thuật di chuyển vẫn dùng khoảng cách của súng chính; Battle Royale không chủ động áp sát chỉ vì sidearm có tầm bắn ngắn.
- Ngưỡng sidearm chỉ tính từ đối thủ thực sự gần, không dùng độ nguy hiểm chung hoặc tầm nhìn xa.
- Chú ý: không bắt đầu reload trong giao tranh nguy hiểm; khi không có đạn dự trữ, cần loot tiếp tế (ở chế độ hỗ trợ).


## v2.6.0: Primary Reload First + Zombie Pincer Routing

- Khi súng chính hết băng mà còn đạn dự trữ, Autopilot ngừng bóp cò và bắt đầu nạp ngay, không chờ hết giao tranh. Trường hợp có địch áp sát trong ngưỡng sidearm sẽ đổi sang súng phụ còn đạn; khi có khoảng trống sẽ quay lại súng chính để nạp.
- Route loot Zombies đánh giá khả năng bị chặn theo thời gian, sử dụng vận tốc zombie suy ra từ hai snapshot gần nhất, A* có trọng số rủi ro, và tự cập nhật khi đối thủ cắt ngang tuyến. Giữ kiểm tra vật cản tĩnh/giới hạn bản đồ.
- Thuật toán 2D mang tính dự đoán, chưa bảo đảm thoát khỏi vòng vây hoàn toàn kín hay địa hình nhiều tầng.

## Bản 2.6.9: nạp sau đổi súng, ưu tiên zombie gần và Replay Lab

- Khi bot vừa đổi sang khẩu súng hết băng mà còn đạn dự trữ, nó sẽ phát lệnh reload sau khi thời gian đổi súng (0,4 giây) kết thúc. Trong Classic/BR vẫn ưu tiên súng chính; Zombies ưu tiên khẩu mạnh hơn dù nằm ở slot phụ.
- Nếu zombie sát bên đang có đường bắn, bot ưu tiên mối nguy này hơn zombie xa, ngay cả khi zombie xa ở gần tâm ngắm hơn. Mục tiêu bị tường chắn không được khai hỏa xuyên tường.
- Trong popup, mục **Match Recorder → Mở Combat Replay Lab**, chọn file JSON bạn đã xuất. Có thể xem timeline, vị trí, hướng nhìn, súng và các quyết định chiến đấu. Công cụ chỉ đọc tệp trên máy.
- Chạy thử tất cả 5 mode bằng `node tools/simulate-all-modes.mjs --record duong-dan-record.json` trong thư mục mã nguồn của extension. Báo cáo sinh ra ở `reports/`.

**Quan trọng:** Bài đo 90% headshot là mục tiêu đánh giá. Kết quả của phòng mô phỏng ngoại tuyến không phải độ chính xác đã được kiểm chứng trong trận online. File record được gửi chưa chứa dữ liệu Zombies và nhãn xác nhận headshot.


## PHÒNG TẬP MÔ PHỎNG TỪ GAME GỐC (v2.7.0)

Chạy offline bằng Node.js: `node lab/arena/train.mjs --episodes 3 --seconds 60 --bots 6 --opponents official`. Có đủ năm mode, bot game gốc và `page-agent.js` thực, xuất JSON kết quả và Replay Lab. Xem `TRAINING_GUIDE_VI.md`; tuỳ chọn phối hợp đồng đội có ở popup. `--opponents stress` tạo bot có thêm các thao tác hợp lệ nhưng không bảo đảm tái hiện mọi hành vi người chơi.

## HUẤN LUYỆN v2.7.1

Autopilot sử dụng dữ liệu objective công khai để tiến tới khu vực đặt/gỡ bom S&D và Hardpoint; có kiểm soát ưu tiên giữa objective và peek. Phòng tập và báo cáo có trong `lab/arena/` và `reports/training-v271/`.

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


## v2.7.5 — TDM lag-compensated aim & full-match evaluation

TDM Autopilot uses rewind-aligned aiming without a fixed 65 ms extra lead. Other modes and assist mode retain their original prediction policy. Full-match paired evaluation and how to reproduce: see `CHANGELOG-v2.7.5.md` and `lab/arena/compare-tdm-aim.mjs`.


## Phiên bản 2.7.6 — Kỹ năng (Skill) tự động
Chọn skill trong lobby FPS Arena như bình thường trước khi vào trận. Trong popup, bật Autopilot và **Tự kích hoạt skill (T)**. Bot tự sử dụng skill đã chọn nếu đủ năng lượng và điều kiện phù hợp, không tự đổi skill trong loadout. Các skill gồm Hook, Exoskeleton, Kinetic Armor, Poltergeist, PAD, Annihilator và Scout Pulse. Ưu tiên an toàn: không dùng khi đang ở trực thăng/đang lượn, không phá tác vụ nhặt đồ hay đặt/gỡ bom, không spam phím T. Nếu bỏ chọn Auto Skills, bạn vẫn có thể dùng T bằng tay. Match Recorder ghi skill, năng lượng và yêu cầu kích hoạt để phân tích sau trận.


## v2.7.7 — Huấn luyện đường đi, bắn, né TDM
Bật **Autopilot**, **Tìm đường vòng** và ô **TDM: theo tuyến tới góc bắn khi an toàn** trong popup. Khi đối thủ mất khỏi tầm bắn do tường, bot có thể giữ một đường đi vòng ngắn thay vì lặp lại peek vô hạn, nhưng chỉ khi máu/giáp đủ và có thời gian an toàn, đoạn đi tiếp theo không tăng nguy cơ lộ đáng kể và không có đối thủ ADS gần. Bỏ dấu tích ô mới để trở về chiến thuật mặc định cũ. Đây là nâng cấp dựa trên 12 trận TDM full-match xác minh riêng, không đảm bảo thắng người chơi thật. Các chiến thuật né theo ADS và dẫn đường tới vị trí mới rộng hơn chưa qua mọi tiêu chí nên chỉ dùng trong phòng tập.
