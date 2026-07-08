## 1. Setup & Khởi tạo

- [ ] 1.1 Khởi tạo file `test/user-journey.e2e-spec.ts`.
- [ ] 1.2 Import `AppModule`, khởi tạo `Test.createTestingModule` giống file E2E hiện có.
- [ ] 1.3 Tạo biến mock cho `LLMService` với 2 method: `embed()` trả về vector giả, và `complete()` trả về chuỗi text mẫu.
- [ ] 1.4 Sử dụng `overrideProvider(LLMService).useValue(...)` khi compile module.
- [ ] 1.5 Khởi chạy ứng dụng (app.init) trong `beforeAll`.

## 2. Các Bước Test E2E

- [ ] 2.1 **Step 1 - Authentication**: Gọi API `POST /api/v1/auth/login` với account `user@farmy.com` và password mặc định. Verify HTTP 201, lấy và lưu trữ `accessToken`.
- [ ] 2.2 **Step 2 - Farm Setup**: Gọi API `POST /api/v1/plots` tạo vườn. Lưu lại `plotId`. Verify HTTP 201.
- [ ] 2.3 **Step 3 - Diary Setup**: Gọi API `POST /api/v1/diaries` tạo một vụ mùa dưa lưới trên Plot vừa tạo. Lưu lại `diaryId`. Verify HTTP 201.
- [ ] 2.4 **Step 4 - Activity Logging**: Gọi API `POST /api/v1/diaries/:diaryId/logs` ghi lại hoạt động "Bón phân trùn quế". Verify HTTP 201.
- [ ] 2.5 *(Optional)* Chờ hoặc trigger đồng bộ dữ liệu vào Vector DB nếu luồng Embedding đang được thiết kế dạng bất đồng bộ.
- [ ] 2.6 **Step 5 - AI Chat Interaction**: Gọi API `POST /api/v1/chat/message` với câu hỏi "Tôi đã bón phân gì cho dưa lưới?". Verify HTTP 200, kiểm tra nội dung text trả về từ Mock xem RAG có hoạt động không, và lưu lại `sessionId` nếu API trả về session tạo mới.

## 3. Dọn dẹp (Teardown)

- [ ] 3.1 Gắn các API Delete vào block `afterAll` hoặc tạo test case Cleanup cuối cùng.
- [ ] 3.2 Gọi API xóa Chat Session vừa tạo.
- [ ] 3.3 Gọi API xóa Diary Log và Diary.
- [ ] 3.4 Gọi API xóa Farm Plot.
- [ ] 3.5 Gọi `app.close()` để dọn dẹp kết nối Database và Server.
