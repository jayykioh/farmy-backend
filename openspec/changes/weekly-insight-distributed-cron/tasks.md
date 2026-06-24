## 1. Schema & Repository

- [x] 1.1 Tạo `src/modules/farm/infrastructure/persistence/weekly-insight.schema.ts` với các trường: `user_id`, `week_start_date`, `insight_text`, `model_used`, `tokens_used`, `created_at` và unique compound index trên `(user_id, week_start_date)`
- [x] 1.2 Tạo `src/modules/farm/infrastructure/persistence/weekly-insight.repository.ts` với phương thức `upsert(userId, weekStartDate, data)`
- [x] 1.3 Đăng ký schema vào `FarmModule` qua `MongooseModule.forFeature`

## 2. Đăng ký Queue

- [x] 2.1 Đăng ký `insight_queue` vào `FarmModule` qua `BullModule.registerQueue`
- [x] 2.2 Export queue để `WeeklyInsightSchedulerService` có thể inject

## 3. Scheduler Service

- [x] 3.1 Tạo `src/modules/farm/application/services/weekly-insight.scheduler.ts`
- [x] 3.2 Implement `onModuleInit` xóa Repeatable Job cũ (nếu cùng key) rồi đăng ký lại với cron `0 6 * * 0` và timezone `Asia/Ho_Chi_Minh`

## 4. Orchestrator Processor

- [x] 4.1 Tạo `src/modules/farm/application/processors/weekly-insight-orchestrator.processor.ts`
- [x] 4.2 Query danh sách user đang hoạt động (có ít nhất một diary log trong 7 ngày qua)
- [x] 4.3 Tính `weekStartDate` là thứ Hai đầu tuần ISO hiện tại
- [x] 4.4 Xây dựng payload `addBulk`: một job `generate_insight` mỗi user với `delay = Math.floor(Math.random() * INSIGHT_SPREAD_WINDOW_MS)`
- [x] 4.5 Gọi `insightQueue.addBulk(jobs)` và log tổng số job đã enqueue

## 5. Per-User Insight Processor

- [x] 5.1 Tạo `src/modules/farm/application/processors/weekly-insight.processor.ts`
- [x] 5.2 Fetch diary log 7 ngày qua của user từ `DiaryRepository`
- [x] 5.3 Return sớm (job completed không làm gì) nếu `diaries.length === 0`
- [x] 5.4 Gọi `RAGService.retrieveContext` với chuỗi query tổng hợp tuần cho user
- [x] 5.5 Gọi `PromptService.buildWeeklyInsightPrompt({ diaries, ragContext })`
- [x] 5.6 Gọi `LLMService.complete({ ...builtPrompt, maxTokens: 500, onRateLimit: 'throw' })`
- [x] 5.7 Gọi `WeeklyInsightRepository.upsert` để lưu kết quả
- [x] 5.8 Log `{ userId, tokens_used, week_start_date }` khi thành công

## 6. Kiểm thử

- [x] 6.1 Viết unit test cho orchestrator: mock query active-user và assert mỗi job trong `addBulk` có `delay` nằm trong `[0, INSIGHT_SPREAD_WINDOW_MS)`
- [x] 6.2 Viết unit test cho per-user processor: mock `DiaryRepository`, `RAGService`, `PromptService`, `LLMService`; assert return sớm khi diary rỗng; assert upsert được gọi với đúng data
- [x] 6.3 Xác minh key Repeatable Job là idempotent bằng cách gọi `onModuleInit` hai lần và kiểm tra Redis chỉ chứa một repeatable entry
