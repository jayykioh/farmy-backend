## Bối cảnh (Context)

Backend có các module phân mảnh như `Auth`, `Farm`, `Ai` và `Knowledge`. Các E2E tests hiện tại là các CRUD test độc lập, gọi endpoint và kiểm tra DB, không đảm bảo rằng khi kết nối thành chuỗi, các luồng dữ liệu (ví dụ: User tạo log -> RAG lấy log -> Prompt service ráp log) có hoạt động trơn tru hay không.

## Mục tiêu / Ngoài phạm vi (Goals / Non-Goals)

**Mục tiêu:**
- Viết 1 file E2E kết hợp nhiều endpoint đại diện cho một "Journey" đầy đủ.
- Dùng Test Database thật để test việc lưu và fetch dữ liệu của RAG (MongoDB + PgVector).
- Đảm bảo thời gian chạy test đủ nhanh bằng cách mock Gemini (LLMService).

**Ngoài phạm vi:**
- Test UI/Frontend.
- Test các logic edge cases lẻ tẻ (đã có Unit Tests và CRUD E2E Tests lo).
- Cấu hình lại Database cho E2E (sẽ tiếp tục dùng cấu hình hiện có của `jest-e2e.json`).

## Các quyết định thiết kế (Decisions)

**1. Tạo một End-to-End User Journey file duy nhất (`test/user-journey.e2e-spec.ts`).**
Lý do: Bài test cần chia sẻ state (VD: `accessToken`, `diaryId`) giữa các HTTP request. Gom vào một file giúp trình tự (sequence) chạy đồng bộ, dễ kiểm soát setup/teardown.

**2. Mock (giả lập) LLMService trong Test Context.**
Lý do: Không thể gọi Gemini API thật trong môi trường test vì tốn tiền, tốc độ chậm và độ ổn định không cao.
Giải pháp: Sử dụng `overrideProvider(LLMService).useValue(mockLLMService)` của `@nestjs/testing` khi khởi tạo `TestingModule`. Hàm `complete()` và `embed()` sẽ trả về dữ liệu mẫu cứng (stub data).
Các lựa chọn khác đã cân nhắc:
- *Dùng môi trường thật*: Bị loại vì lý do chi phí.
- *Mock toàn bộ AiModule*: Bị loại vì ta muốn test logic của RAGService và ChatService (gọi DB, tìm kiếm vector), chỉ mock tầng call API ra bên ngoài (LLMService).

**3. Test luồng đăng nhập (Auth) với Seeder data có sẵn.**
Lý do: `db:seed` đã chuẩn bị sẵn một user (`user@farmy.com`), ta có thể tái sử dụng ngay user này cho flow test giống như `farm-crud.e2e-spec.ts` đang làm, thay vì phải chạy toàn bộ luồng Register & Verify Email (gây phức tạp không cần thiết).

**4. Dọn dẹp (Cleanup) sau cùng.**
Lý do: Test E2E cần idempotent. Cuối hàm `afterAll`, code test sẽ dùng DELETE các API hoặc truy vấn Model để xóa Plot, Diary và ChatSession vừa tạo để dọn dẹp Test DB.

## Rủi ro / Trade-offs

- [Rủi ro] Việc Mock LLMService có thể bỏ sót những lỗi về network hay format trả về từ Gemini. → Giảm thiểu: Tạo Mock data bám sát với định dạng TypeScript Interface chuẩn của `LLMService`.
- [Rủi ro] Tính năng RAG (PgVector) thường dùng cơ chế sync ngầm (ví dụ queue hoặc trigger) nên nếu test gọi Chat API ngay sau khi tạo DiaryLog, có thể RAG chưa kịp thấy dữ liệu. → Giảm thiểu: Thiết kế API đồng bộ cho việc embed (nếu có), hoặc dùng độ trễ giả lập nếu cần thiết. *(Ghi chú: hệ thống hiện tại có nhúng nội dung ngay lập tức trong quá trình tạo Log không? Kiểm tra lại khi code test).*

## Kế hoạch triển khai

1. Khởi tạo file `test/user-journey.e2e-spec.ts`.
2. Khởi tạo `TestingModule` và override `LLMService` bằng mock object.
3. Viết Test case 1: Login lấy token.
4. Viết Test case 2: Gọi API tạo Plot và Diary.
5. Viết Test case 3: Gọi API tạo DiaryLog (ghi lại hoạt động trồng trọt).
6. Viết Test case 4: Gọi API tạo Session chat và nhắn tin. Verify API trả về text dựa trên mock.
7. Viết block `afterAll` dọn dẹp sạch sẽ tài nguyên.

## Câu hỏi còn mở

- Luồng nhúng (embedding) của `DiaryLog` vào PgVector hiện tại là Async (qua Queue) hay Sync? Nếu là Async, E2E test phải mock queue hoặc delay một khoảng thời gian trước khi gọi API Chat để RAG có thể tìm ra kết quả.
