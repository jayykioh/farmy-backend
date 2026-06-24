## Lý do

Codebase đã có sẵn `PromptService`, `LLMService`, `RAGService` và hạ tầng BullMQ dùng chung, nhưng chưa có luồng tổng hợp hàng tuần tự động. Người dùng ghi nhật ký đều đặn không có cơ chế nào để nhận bản tóm tắt AI cuối tuần. Chúng ta cần một `WeeklyInsightModule` chạy theo lịch phân tán và phân bổ các job sinh insight đến từng người dùng, mà không gây áp lực thundering-herd lên Gemini API cũng như không tạo job trùng lặp khi backend chạy nhiều instance.

## Những thay đổi

- Thêm luồng orchestration weekly insight chạy lúc 06:00 sáng Chủ Nhật (Asia/Ho_Chi_Minh) bằng BullMQ Repeatable Job thay vì decorator `@Cron` thuần, đảm bảo trigger chỉ chạy đúng một lần dù có bao nhiêu NestJS instance đang hoạt động.
- Áp dụng Delay Spreading: orchestrator fan-out một job BullMQ `generate_insight` cho mỗi user đang hoạt động, mỗi job được gán `delay` ngẫu nhiên trải đều trong cửa sổ 2 tiếng, giữ cho tải Gemini API luôn ổn định thay vì spike.
- Giới thiệu Mongoose schema `WeeklyInsight` để lưu từng insight đã sinh ra, khóa duy nhất theo `(user_id, week_start_date)`.
- Tái sử dụng `RAGService`, `PromptService` và `LLMService` hiện có mà không sửa đổi.
- Kết nối module mới vào `FarmModule` để dùng chung quyền truy cập diary và user.

## Tính năng

### Tính năng mới
- `weekly-insight-distributed-cron`: sinh AI insight hàng tuần có điều phối, tạo ra một tài liệu insight cho mỗi user đang hoạt động mỗi tuần, thực thi qua BullMQ với delay-spreading.

### Tính năng thay đổi
- `FarmModule`: đăng ký thêm `insight_queue` và các provider scheduler, processor mới.

## Ảnh hưởng

- **Code:** Thêm scheduler service, hai BullMQ processor (orchestrator + worker theo từng user), Mongoose schema và repository trong `src/modules/farm`.
- **APIs:** Không có endpoint HTTP mới. Tài liệu insight được lưu vào MongoDB và có thể truy vấn bởi endpoint thông báo hoặc hiển thị sau này.
- **Dependencies:** Tiếp tục dùng BullMQ, Redis, MongoDB và các AI service contract hiện có. Không cần thêm package bên thứ ba.
- **Systems:** Không thay đổi embedding pipeline, logic RAG retrieval hay prompt template. Dùng `onRateLimit: 'throw'` cho LLM call để BullMQ exponential backoff xử lý Gemini rate limit tự động.
