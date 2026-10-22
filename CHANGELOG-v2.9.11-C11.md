## C11 — Server-Confirmed Calibration & Multi-seed Rejection

## Thay đổi mã nguồn

- `lab/arena/server-shot-harness-c11.mjs`: thu thập `observedDamageStdError`, CI 95% xấp xỉ, số trigger trúng, max damage per trigger, head event count và head multiplier. Miss có damage 0; pellet shotgun chỉ đóng góp vào cùng trigger.
- `engagement-calibration.mjs`: kiểm tra tính ổn định phần đuôi phân phối, abstention khi thiếu headshot đủ đại diện, cơ chế fallback không tác động gameplay; thêm `assessCalibrationReplicates` yêu cầu cải thiện ổn định MAE và RMSE trên mọi seed.
- `scripts/audit-c11-replicates.mjs`: audit các seed và bootstrap theo geometry có ghép cặp. Chỉ tạo báo cáo, không tạo model sản xuất.
- `tests/engagement-calibration-c11.test.mjs`: tổng cộng 10 kiểm thử chuyên biệt, kể cả nguy cơ đếm pellet sai, tail hiếm, fallbacks và duplicate firing seed.
- `scripts/evaluate-c11-server.mjs`: giữ thử nghiệm với đúng `server/combat.js` và dữ liệu train/holdout tách rõ.

