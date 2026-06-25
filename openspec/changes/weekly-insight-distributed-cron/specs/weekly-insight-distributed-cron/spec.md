## YÊU CẦU BỔ SUNG

### Yêu cầu: Distributed Cron Trigger (Cron phân tán)
Hệ thống PHẢI dùng BullMQ Repeatable Job để trigger orchestration weekly insight, đảm bảo cron chỉ chạy đúng một lần mỗi tuần bất kể số lượng instance ứng dụng đang hoạt động.

#### Kịch bản: Nhiều instance cùng chạy lúc cron trigger
- **KHI** 06:00 AM Chủ Nhật đến và có ba NestJS pod đang chạy
- **THÌ** chỉ đúng một orchestrator job được dequeue và xử lý, không có fan-out trùng lặp

#### Kịch bản: Ứng dụng khởi động lại sau khi Redis phục hồi
- **KHI** ứng dụng start sau một Redis restart
- **THÌ** `onModuleInit` đăng ký lại Repeatable Job và trigger Chủ Nhật tiếp theo chạy đúng

### Yêu cầu: Delay Spreading (Phân bổ tải theo thời gian)
Hệ thống PHẢI gán cho mỗi job insight theo user một delay ngẫu nhiên trong cửa sổ có thể cấu hình, để các Gemini API call được phân bổ đều theo thời gian và không spike ngay tại thời điểm enqueue.

#### Kịch bản: Fan-out với 1000 user đang hoạt động
- **KHI** orchestrator xử lý trigger và tìm thấy 1000 user đang hoạt động
- **THÌ** 1000 job `generate_insight` được enqueue, mỗi job có delay phân bổ đều trong `[0, INSIGHT_SPREAD_WINDOW_MS)`, và chỉ một phần nhỏ trở nên ready tại bất kỳ thời điểm nào

### Yêu cầu: Lưu trữ Insight Idempotent
Hệ thống PHẢI lưu tối đa một tài liệu weekly insight mỗi user mỗi tuần và PHẢI ghi đè tài liệu hiện có nếu job bị retry.

#### Kịch bản: Orchestrator bị retry sau lỗi tạm thời
- **KHI** orchestrator job bị lỗi và được retry, khiến job `generate_insight` trùng lặp cho cùng user và cùng tuần
- **THÌ** chỉ tồn tại đúng một tài liệu `WeeklyInsight` trong MongoDB cho cặp `(user_id, week_start_date)` đó sau khi cả hai job hoàn thành

### Yêu cầu: Retry khi Rate Limit
Hệ thống PHẢI propagate lỗi Gemini rate-limit thành job failure để BullMQ retry per-user job với exponential backoff.

#### Kịch bản: Gemini trả về lỗi rate-limit
- **KHI** `LLMService.complete` nhận response rate-limit từ Gemini trong một per-user insight job
- **THÌ** processor ném `LLMRateLimitedException`, BullMQ đánh dấu job là failed và job được retry tối đa ba lần với exponential backoff

### Yêu cầu: Bỏ qua User không có nhật ký
Hệ thống PHẢI không sinh hoặc lưu insight cho user không có diary log nào trong 7 ngày qua.

#### Kịch bản: User không có hoạt động diary tuần này
- **KHI** job `generate_insight` chạy cho user có zero diary log trong 7 ngày qua
- **THÌ** processor return mà không gọi `LLMService` và không ghi vào collection `weekly_insights`
