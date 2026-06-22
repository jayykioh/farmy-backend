## 1. Database & Infrastructure Setup

- [ ] 1.1 Thêm thư viện `"pg": "^8.12.0"` và `@types/pg` vào `package.json` và chạy cài đặt.
- [ ] 1.2 Viết file cấu hình Postgres client `src/db/pg-client.ts` sử dụng connection pool kết nối tới biến `SUPABASE_DB_URL`.
- [ ] 1.3 Tạo script migration Postgres `src/db/migrate-pg.ts` để khởi tạo extension `vector` và bảng `embeddings` trên Supabase Postgres.
- [ ] 1.4 Khai báo script chạy migration `"db:migrate-pg"` trong `package.json`.

## 2. Ingestion & Embedding Pipeline (EmbeddingModule)

- [ ] 2.1 Viết hàm tiện ích preprocessing và chunking văn bản `chunkKnowledge` tại `src/modules/embedding/domain/chunk.util.ts`.
- [ ] 2.2 Viết bộ kiểm thử unit test cho `chunk.util.ts` để xác thực cơ chế chồng lấp (sliding window overlap) hoạt động đúng.
- [ ] 2.3 Viết `PgvectorRepository` tại `src/modules/embedding/infrastructure/persistence/pgvector.repository.ts` với các hàm `upsert`, `deactivateBySourceId` và `deleteBySourceId`.
- [ ] 2.4 Viết `EmbedWorker` tại `src/modules/embedding/application/workers/embed.worker.ts` lắng nghe job `embed_knowledge` từ hàng đợi BullMQ `embed_queue`.
- [ ] 2.5 Khai báo `EmbeddingModule` tại `src/modules/embedding/embedding.module.ts` kết nối BullMQ và đăng ký Worker.

## 3. Knowledge Document Admin CRUD (KnowledgeModule)

- [ ] 3.1 Thiết kế và viết các DTOs: `CreateKnowledgeDto`, `UpdateKnowledgeDto` và `BatchEmbedKnowledgeDto` dưới thư mục `src/modules/knowledge/domain/dtos/`.
- [ ] 3.2 Viết `KnowledgeService` tại `src/modules/knowledge/application/services/knowledge.service.ts` quản lý CRUD Mongoose và đẩy job vào hàng đợi embedding.
- [ ] 3.3 Viết `AdminKnowledgeController` tại `src/modules/knowledge/interface/controllers/admin-knowledge.controller.ts` cung cấp các API được phân quyền `@Roles('admin')`.
- [ ] 3.4 Khai báo `KnowledgeModule` tại `src/modules/knowledge/knowledge.module.ts`.
- [ ] 3.5 Đăng ký `KnowledgeModule` và `EmbeddingModule` vào `AppModule` chính của dự án.

## 4. Verification & Testing

- [ ] 4.1 Chạy migration Postgres và xác thực bảng `embeddings` được tạo thành công trên Supabase.
- [ ] 4.2 Viết unit test cho `KnowledgeService` để kiểm tra luồng tạo mới, cập nhật, xóa và kích hoạt batch embedding.
- [ ] 4.3 Thực hiện gọi REST API Admin CRUD qua Postman/cURL, kiểm tra phản hồi đúng định dạng `{ success: true, data }` và sử dụng `snake_case`.
- [ ] 4.4 Xác minh các vector embeddings đã được tạo thành công trên cơ sở dữ liệu Supabase Postgres với đúng 768 chiều.
