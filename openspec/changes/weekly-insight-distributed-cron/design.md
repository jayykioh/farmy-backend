## Bối cảnh

Backend đã lên lịch thông báo nhắc nhở bằng decorator `@Cron` trên `ReminderSchedulerService`. Cách đó hoạt động tốt với reminder vì chạy mỗi phút và trigger trùng lặp không gây hại. Weekly insight generation thì khác: gọi Gemini API một lần mỗi tuần cho từng user, nên trigger trùng trên nhiều pod sẽ tạo tài liệu trùng lặp và cạn kiệt quota API. `AiModule` hiện có đã cung cấp `LLMService`, `PromptService` và `RAGService` — đây là các contract ổn định module mới có thể sử dụng mà không cần thay đổi.

## Mục tiêu / Ngoài phạm vi

**Mục tiêu:**
- Đảm bảo cron hàng tuần chỉ trigger đúng một lần dù nhiều NestJS instance đang chạy.
- Phân bổ Gemini API call trong cửa sổ 2 tiếng để không vượt rate limit ở bất kỳ số lượng user nào.
- Lưu đúng một tài liệu `WeeklyInsight` cho mỗi cặp `(user_id, week_start_date)` để rerun có thể idempotent.
- Tái sử dụng `RAGService`, `PromptService` và `LLMService` hiện có mà không sửa đổi.

**Ngoài phạm vi:**
- Thêm HTTP endpoint để xem tài liệu insight (nằm ngoài change này).
- Thay đổi embedding pipeline hay RAG retrieval logic.
- Giao nhận push notification (tích hợp notification là change riêng sau này).
- Sinh insight đa ngôn ngữ.

## Các quyết định thiết kế

**1. Dùng BullMQ Repeatable Jobs thay vì `@Cron` cho orchestrator trigger.**
Lý do: `@Cron` trong NestJS lên lịch chạy bên trong mỗi process. Deployment 3 pod sẽ fire 3 orchestrator cùng lúc, tạo job trùng lặp ba lần. BullMQ Repeatable Jobs lưu lịch trình trong Redis; chỉ worker nào giành được Redis lock mới xử lý job.
Các lựa chọn khác đã cân nhắc:
- Dùng scheduler ngoài (VD: Kubernetes CronJob). Bị loại vì đòi hỏi thay đổi infrastructure ngoài codebase Node.js và thêm dependency vận hành mới.
- Dùng Redis distributed lock quanh `@Cron` hiện tại. Bị loại vì phải viết thêm lock logic thủ công mà BullMQ Repeatable Jobs đã xử lý sẵn.

**2. Áp dụng random delay spreading trong cửa sổ 2 tiếng.**
Lý do: nếu không spreading, tất cả job theo user sẽ có thể chạy ngay khi orchestrator enqueue. Concurrency worker và throughput BullMQ sẽ chạm giới hạn requests-per-minute của Gemini trong vài giây. Delay ngẫu nhiên `(0–7.200.000 ms)` phân bổ tải đều trong 2 tiếng, giữ áp lực API ổn định và dưới ngưỡng rate limit.
Công thức: `delay = Math.floor(Math.random() * 7_200_000)`.
Các lựa chọn khác đã cân nhắc:
- Delay đều `(i / total) * windowMs`. Bị loại vì tạo ramp dự đoán được, có thể vẫn spike đầu, và phụ thuộc vào danh sách user được sắp xếp theo thứ tự.
- Xử lý theo batch cố định với sleep giữa các batch. Bị loại vì chặn event loop và làm retry logic phức tạp hơn.

**3. Dùng `addBulk` để enqueue tất cả job theo user trong một round-trip Redis duy nhất.**
Lý do: enqueue 10.000 job riêng lẻ sẽ mất vài giây và giữ open event loop loop lâu. `addBulk` batch các Redis command và trả về trong mili giây.

**4. Deduplicate theo `(user_id, week_start_date)` với unique index trong MongoDB.**
Lý do: nếu orchestrator job bị retry do transient failure, fan-out lần hai không được tạo tài liệu insight trùng. Upsert theo khóa compound duy nhất làm cho rerun idempotent.

**5. Dùng `onRateLimit: 'throw'` trong LLM call của per-user worker.**
Lý do: nếu Gemini trả về lỗi rate-limit, worker cần ném `LLMRateLimitedException` để BullMQ đánh dấu job là failed và retry với exponential backoff. Dùng `'fallback'` mặc định sẽ đánh dấu job là completed với insight trống, không thể phân biệt với response hợp lệ thực sự.

## Rủi ro / Trade-offs

- [Rủi ro] BullMQ Repeatable Job có thể không fire nếu Redis restart mà không có persistence. → Giảm thiểu: `onModuleInit` đăng ký lại repeatable job mỗi khi ứng dụng start, nên Redis restart theo sau bởi app restart sẽ tự phục hồi lịch.
- [Rủi ro] Cửa sổ 2 tiếng có thể quá ngắn nếu quota Gemini rất thấp. → Giảm thiểu: hằng số `INSIGHT_SPREAD_WINDOW_MS` được tách ra độc lập để có thể điều chỉnh không cần thay logic. BullMQ retry với exponential backoff xử lý rate-limit failure riêng lẻ bất kể window.
- [Rủi ro] Số lượng user lớn có thể làm payload `addBulk` rất lớn. → Giảm thiểu: phân trang query active-user theo batch 500 và gọi `addBulk` mỗi trang nếu user vượt 5.000.
- [Rủi ro] Tài liệu trùng lặp nếu unique index chưa được tạo trước khi deploy. → Giảm thiểu: index được định nghĩa trong schema và Mongoose `autoIndex` tạo tự động khi ứng dụng khởi động.

## Kế hoạch triển khai

1. Thêm Mongoose schema và repository `WeeklyInsight`.
2. Đăng ký `insight_queue` trong `FarmModule` cạnh `reminder_queue` hiện có.
3. Thêm `WeeklyInsightSchedulerService` đăng ký Repeatable Job khi startup.
4. Thêm `WeeklyInsightOrchestratorProcessor` fan-out job theo từng user.
5. Thêm `WeeklyInsightProcessor` chạy AI pipeline và lưu kết quả.
6. Rollback bằng cách xóa 3 provider mới khỏi `FarmModule` và xóa Repeatable Job khỏi Redis.

## Câu hỏi còn mở

- "User đang hoạt động" nên được định nghĩa là "có ít nhất một diary log trong 7 ngày qua" hay "đã đăng ký và chưa bị vô hiệu hóa"? Định nghĩa chặt hơn tránh sinh insight cho user không dùng app và giảm Gemini call không cần thiết.
- Cửa sổ spreading 2 tiếng có nên cấu hình qua `ConfigService` / biến môi trường không, hay hằng số cứng là đủ cho hiện tại?
- Tài liệu insight cũ hơn 90 ngày có nên tự động xóa qua TTL index để kiểm soát dung lượng MongoDB không?
