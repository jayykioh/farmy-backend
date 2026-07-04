## Lý do (Why)

Hệ thống hiện tại (như ở file `farm-crud.e2e-spec.ts`) mới chỉ có các test E2E cho từng REST resource riêng lẻ (tạo Plot, tạo Diary, v.v.). Tuy nhiên, Farmy Backend là một hệ thống AI tích hợp: dữ liệu Diary từ user cần được hệ thống RAG quét và đưa vào LLM để tư vấn ngữ cảnh hóa. Việc thiếu các bài test luồng tổng hợp (từ Đăng nhập ➔ Viết nhật ký ➔ RAG ➔ Chat AI) tạo rủi ro lớn khi có những cập nhật chéo giữa các module `FarmModule`, `KnowledgeModule` và `AiModule`.

## Thay đổi (What Changes)

- Khởi tạo file E2E test suite mới: `test/user-journey.e2e-spec.ts`.
- Áp dụng kỹ thuật Mocking cho `LLMService` trong test E2E để tránh việc gọi thật (real request) lên Gemini API. Tránh tốn phí và tránh tình trạng flaky test khi mạng chập chờn.
- Tổ chức các Test Case tuần tự thành một **Luồng (Flow)**: 
  1. Đăng nhập hệ thống (Auth).
  2. Tạo Plot và Diary, log một vài hoạt động (Farm/Diary).
  3. Gửi tin nhắn qua Chat endpoint (AI), chờ RAG quét dữ liệu vừa log và kiểm tra output của LLM mock.
  4. Cleanup dữ liệu.

## Các năng lực (Capabilities)

### Tính năng mới
- `integration-tests-flow`: Kịch bản test E2E hoàn chỉnh chứng minh sự tương tác mượt mà giữa các hệ thống cốt lõi của Backend.

### Tính năng thay đổi
- Không thay đổi source code ở `/src`, chỉ nâng cao hạ tầng `/test`.

## Ảnh hưởng (Impact)

- **Code:** Thêm file test mới, không ảnh hưởng production code. Có thể cần setup thêm module giả lập (MockModule) trong thư mục test.
- **APIs:** Gọi lần lượt các API thực tế: `/api/v1/auth/login`, `/api/v1/plots`, `/api/v1/diaries`, `/api/v1/chat/message`.
- **Dependencies:** Sử dụng Jest và Supertest hiện tại, không thêm thư viện mới.
- **Systems:** Hệ thống test gọi trực tiếp vào Test DB (MongoDB, PgVector) như thông thường. Không ảnh hưởng R2/Redis.
