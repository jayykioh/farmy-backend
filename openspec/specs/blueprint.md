# FarmDiaries AI — Technical Blueprint v6.0
### Production-Grade Edition · Source of Truth

| Thuộc tính | Giá trị |
|---|---|
| **Phiên bản** | v6.0 — Production-Grade (nâng từ v5.0 Improved) |
| **Trạng thái** | Source of Truth · Specs folder |
| **Stack** | Node.js + NestJS + MongoDB Atlas (primary) + pgvector (search index) + Redis + Cloudflare R2 |
| **AI Strategy** | Gemini free-first · RAG · Rule-based Feed · Vision Scan |
| **Notification** | Zalo OA (Phase 1–2) → PWA Push (Phase 3+) |
| **Triết lý** | MVP-first · Log everything · Security by default · Scale when ready |
| **Cập nhật** | v6.0 bổ sung: Security, Observability, CI/CD, Testing, DB Migration & Backup, Privacy & Compliance, AI Safety, Production Deployment |

---

> **Database Decision:** MongoDB is the **primary database** for ALL application data. pgvector is used **only as a vector search index** (`embeddings` table: source_id, source_type, vector, metadata). No business data lives in pgvector. See `openspec/specs/embedding_spec.md` for the full RAG architecture.

## Mục lục

1. [Thay đổi so với v5.0](#1-thay-đổi-so-với-v50)
2. [Tech Stack tổng quan](#2-tech-stack-tổng-quan)
3. [NestJS vs Express — Phân tích & Đề xuất](#3-nestjs-vs-express--phân-tích--đề-xuất)
4. [Zalo OA Implementation](#4-zalo-oa-implementation)
5. [Notification Strategy](#5-notification-strategy)
6. [Backend Module Structure](#6-backend-module-structure)
7. [AI / LLM Architecture](#7-ai--llm-architecture)
8. [Plant Scan — Input Validation](#8-plant-scan--input-validation)
9. [Research Data Retention Policy](#9-research-data-retention-policy)
10. [Weekly Insight Distributed Scheduling](#10-weekly-insight-distributed-scheduling)
11. [Database Architecture](#11-database-architecture)
12. [Security](#12-security)
13. [Observability & Monitoring](#13-observability--monitoring)
14. [Testing Strategy](#14-testing-strategy)
15. [CI/CD Pipeline](#15-cicd-pipeline)
16. [Database Migration & Backup](#16-database-migration--backup)
17. [Privacy & Compliance](#17-privacy--compliance)
18. [AI Safety & Guardrails](#18-ai-safety--guardrails)
19. [Scalability & Performance](#19-scalability--performance)
20. [MVP Build Order](#20-mvp-build-order)
21. [Không build trong MVP](#21-không-build-trong-mvp)
22. [Production Readiness Checklist](#22-production-readiness-checklist)

---

## 1. Thay đổi so với v5.0 (Tóm tắt nhanh)

v6.0 nâng cấp toàn diện từ v5.0 để đạt tiêu chuẩn **Production-Grade**: bổ sung **Security** (Helmet, CORS, CSRF, Magic Bytes), **Observability** (Pino, Sentry), **Testing** (Jest unit & integration), **DB Migration & Backup**, **Privacy & Compliance** (GDPR/Consent), và **AI Safety** (Guardrails & Rate limiting).

---

## 2. Tech Stack tổng quan & Biện luận kiến trúc

### 2.1 Bảng Tech Stack MVP
| Layer | Công nghệ chọn | Chi phí dự kiến | Ghi chú & Rationale |
|---|---|---|---|
| **Frontend** | React + Vite + TypeScript | Free | **PWA-first** via `vite-plugin-pwa` |
| **Styling** | Tailwind CSS + Shadcn/UI | Free | Giao diện hiện đại, tối ưu UX, responsive |
| **State** | Zustand + React Query | Free | Quản lý state gọn nhẹ, cache API mạnh mẽ |
| **Backend** | Node.js + NestJS | Free (Railway) | Hệ khung vững chắc, Clean Architecture, DI |
| **DB Primary** | MongoDB Atlas | Free Tier / Shared Cluster | Lưu dữ liệu ứng dụng chính, chat, scan, diary, reminders, events |
| **Vector Search** | pgvector (PostgreSQL extension) | Free — self-hosted | Search index only: `embeddings(source_id, source_type, vector(768), metadata)`. No business data. |
| **Cache/Queue** | Redis + BullMQ | Free | Xử lý rate limit AI & lập lịch gửi ZNS/Push |
| **Storage** | Cloudflare R2 | Free Tier (10GB) | Lưu trữ ảnh nhật ký & ảnh quét bệnh (S3 API) |
| **Auth** | Supabase Auth | Free (50k MAU) | Authentication an toàn, nhanh gọn |
| **Notification** | Zalo OA ZNS & Web Push | Free template | Tối ưu tiếp cận nông dân Việt Nam |
| **LLM / RAG** | Gemini Flash & Embedding-004 | Free Tier | Tốc độ cao, chi phí tối ưu, quota miễn phí lớn |

### 2.2 Biện luận và So sánh Kiến trúc (Architecture Decision Rationale)

#### A. Chiến lược MongoDB-first Database (Trọng tâm)
**MongoDB là primary database duy nhất** cho tất cả dữ liệu ứng dụng: users, diary entries, chat sessions, pet states, farm snaps, reminders, weekly insights, audit logs, knowledge chunks.

pgvector (được chạy như một PostgreSQL extension) được dùng **chỉ như một search index**: nó lưu `(embedding vector, source_id, source_type, metadata tối thiểu)`. Không có business data nào ở pgvector. MongoDB là source of truth; pgvector là derived index có thể rebuild hoàn toàn từ MongoDB bất cứ lúc nào.


#### B. Nền tảng ứng dụng: Web PWA (React + Vite) vs. Mobile App Native
*   **Web PWA (React + Vite + TypeScript):** Được chọn làm nền tảng cốt lõi cho giai đoạn MVP.
*   **Lý do chọn:**
    *   *Không rào cản cài đặt:* Nông dân có thể sử dụng ngay lập tức qua liên kết hoặc quét mã QR.
    *   *Tối ưu hóa dung lượng & Băng thông:* PWA cực nhẹ, hỗ trợ offline-first qua Service Workers.
    *   *Tốc độ phát triển:* Đồng bộ 100% codebase, dễ dàng cập nhật tính năng mới.

#### C. Lựa chọn AI & RAG: Gemini API + pgvector Search Index
> **RAG decision:** pgvector được dùng làm vector search index (không phải database). Embedding được ghi vào bảng `embeddings` trong pgvector; nội dung thật được fetch từ MongoDB bằng IDs. Xem `openspec/specs/embedding_spec.md`.
*   **Gemini Flash & text-embedding-004:** Được lựa chọn vì gói Free Tier cực kỳ hào phóng (15 RPM đối với Flash và 100 RPM đối với Embedding), đáp ứng dư dả quy mô MVP mà không phát sinh chi phí ban đầu. Khả năng đọc hiểu hình ảnh (Gemini Vision) cực tốt giúp triển khai tính năng Quét bệnh cây trồng ([PlantScanModule](file:///d:/coding/farmdiary/project/backend/src/modules/plant-scan/plant-scan.service.ts)) một cách mượt mà.
*   **pgvector (HNSW Index) vs. Atlas Vector Search:** pgvector được chọn vì latency < 10ms (HNSW in-process) so với Atlas Vector Search 50–200ms (Lucene layer + round trip) và miễn phí (Atlas Vector Search cần cluster M10+ tối thiểu $57/tháng). Xem mục "Why pgvector" trong `embedding_spec.md` để biết chi tiết đầy đủ.

---

## 3. NestJS vs Express — Phân tích & Đề xuất

Câu trả lời ngắn: **NestJS được đề xuất** cho FarmDiaries. App có nhiều module phức tạp, cần TypeScript consistency, plan scale sau. NestJS enforce structure từ đầu — tránh technical debt khi codebase lớn.

| Tiêu chí | Express | NestJS | Winner |
|---|---|---|---|
| Learning curve | Thấp | Cao hơn — decorator, DI, module system | Express |
| Boilerplate | Viết tay — linh hoạt nhưng không nhất quán | Có sẵn scaffold — nhất quán từ đầu | NestJS |
| TypeScript | Support nhưng cần config thêm | TypeScript-first, built-in type safety | NestJS |
| Module hóa | Tự tổ chức folder — dễ messy khi scale | Module system bắt buộc — clean arch | NestJS |
| Dependency Injection | Không có | Built-in DI container — test-friendly | NestJS |
| Guards / Pipes | Tự implement | Guards, Interceptors, Pipes — out of the box | NestJS |
| Background Jobs | Tích hợp BullMQ tốt nhưng cần config tay | NestJS BullMQ module — declarative | NestJS |
| Test | Jest + Supertest tự setup | Built-in testing module — dễ mock DI | NestJS |
| Migrate lên microservice | Khó — refactor lớn | Dễ hơn — tách module là tách service | NestJS |

### Cấu trúc thư mục — NestJS (chuẩn)

```
src/
├── modules/
│   ├── auth/                    # JWT, refresh token, Supabase
│   ├── users/                   # User profile, preferences
│   ├── diary/                   # CRUD diary entries, photo upload
│   ├── chat/                    # Nhận message, điều phối AI
│   ├── llm/                     # Single point Gemini calls
│   ├── prompt/                  # System prompt builder, versioning
│   ├── rag/                     # pgvector search, context building
│   ├── embedding/               # Tạo embedding, lưu pgvector
│   ├── pet/                     # Rule-based mood, streak, bubble
│   ├── reminder/                # BullMQ jobs, schedule
│   ├── notification/            # Orchestrate ZNS / Push / Email
│   ├── zalo/                    # Zalo OA API, webhook, OAuth
│   ├── plant-scan/              # Upload, validate, Gemini Vision
│   ├── insight/                 # Weekly insight cron, distributed
│   ├── knowledge/               # CRUD knowledge docs, admin
│   └── feedback/                # AI feedback logging
├── common/
│   ├── guards/                  # JwtAuthGuard, RolesGuard
│   ├── interceptors/            # LoggingInterceptor, ResponseInterceptor
│   ├── pipes/                   # ValidationPipe, ParseIntPipe
│   ├── filters/                 # GlobalExceptionFilter
│   ├── decorators/              # @CurrentUser, @Roles, @Public
│   └── middleware/              # RequestIdMiddleware, RateLimitMiddleware
├── config/                      # database, redis, gemini, zalo config
├── shared/                      # DTOs, interfaces, constants, utils
└── main.ts                      # Bootstrap, Helmet, CORS, Swagger
```

---

## 4. Zalo OA Implementation

### 4.1 Tại sao Zalo OA?

- Zalo là app nhắn tin số 1 tại nông thôn Việt Nam — penetration rate cao hơn email
- ZNS template message có tỷ lệ đọc ~80% vs email ~20%
- ZNS miễn phí cho OA đã được xác minh
- Không cần user cài thêm app

### 4.2 Zalo OA Setup

1. Đăng ký Zalo Official Account tại `oa.zalo.me`
2. Xác minh OA để gửi ZNS (cần CMND/GPKD) — mất 3–5 ngày làm việc
3. Tạo ZNS template tại Zalo for Business — approve 1–3 ngày
4. Tạo Zalo App tại `developers.zalo.me` → App ID, Secret Key
5. Implement OAuth: user login Zalo → lấy access_token → lưu zalo_user_id
6. Tạo webhook endpoint nhận event từ Zalo

### 4.3 Backend Integration Flow

```
1. User đăng ký app → Zalo OAuth → lấy access_token + user_id
2. Lưu vào users: zalo_user_id, zalo_access_token (encrypted AES-256), zalo_notification_enabled
3. Reminder scheduler tính đến schedule → push job vào reminder_queue (BullMQ)
4. Worker xử lý job → gọi ZNS API: POST https://business.openapi.zalo.me/message/template
5. ZNS API trả về message_id → lưu vào reminders: delivered_at, zns_message_id
6. Webhook nhận event từ Zalo (user block OA) → cập nhật zalo_notification_enabled = false
7. Fallback: nếu ZNS fail → gửi email qua Resend
```

### 4.4 ZNS Template

| Template ID | Nội dung | Trigger |
|---|---|---|
| REMINDER_DIARY | `{{farm_name}}`: Hôm nay bạn chưa ghi nhật ký. Cây `{{crop}}` đang ở giai đoạn `{{stage}}`. | Không có entry sau 8PM |
| REMINDER_WATER | `{{farm_name}}`: Nhắc tưới cây `{{crop}}` hôm nay. | Lịch tưới đã cài |
| WEEKLY_INSIGHT | `{{farm_name}}`: Tổng kết tuần — `{{streak}}` ngày ghi nhật ký. `{{summary_short}}` | Cron Chủ nhật 8AM |
| STREAK_MILESTONE | `{{farm_name}}`: Chúc mừng `{{streak}}` ngày liên tục! | Streak 7/14/30 ngày |
| PLANT_ALERT | `{{farm_name}}`: AI phát hiện dấu hiệu bất thường trên `{{crop}}`. Kiểm tra ngay. | Plant scan có warning |

> **Lưu ý:** ZNS template phải được Zalo approve trước khi launch. Nộp template ít nhất 1 tuần trước ngày dự kiến go-live.

---

## 5. Notification Strategy

| Giai đoạn | Kênh chính | Kênh fallback | Điều kiện |
|---|---|---|---|
| Phase 1 (tháng 1–2) | Zalo ZNS | Email (Resend) | User đã connect Zalo OA → ZNS. Chưa → Email |
| Phase 3 (tháng 3+) | Web Push (PWA) | Zalo ZNS | User đã install PWA → Push. Chưa → ZNS |
| Phase 4 (optional) | React Native Push | Web Push → Zalo | User cài app → native push. Chưa → fallback chain |

### Notification Preference Logic

```typescript
// NotificationService.send()
async send(userId: string, template: NotificationTemplate, data: Record<string, string>) {
  const user = await this.usersService.findById(userId);

  // Priority 1: Web Push (PWA installed)
  if (user.push_subscription) {
    const ok = await this.webPushService.send(user.push_subscription, template, data);
    if (ok) return;
  }

  // Priority 2: Zalo ZNS
  if (user.zalo_notification_enabled && user.zalo_user_id) {
    const ok = await this.zaloService.sendZNS(user.zalo_user_id, template, data);
    if (ok) return;
  }

  // Priority 3: Email fallback
  if (user.email) {
    await this.emailService.send(user.email, template, data);
    return;
  }

  // All failed — log for retry
  this.logger.warn({ userId, template }, 'All notification channels failed');
}
```

---

## 6. Backend Module Structure

| Module | Trách nhiệm duy nhất | Phụ thuộc vào | Phase |
|---|---|---|---|
| DiaryModule | CRUD diary entries, photo upload R2 | UsersModule | 1 |
| ChatModule | Nhận message, điều phối các service, trả response | LLMModule, RAGModule, PetModule | 1 |
| **LLMModule** | Gọi Gemini API, retry logic, rate limit queue, log tokens | — | 1 |
| **PromptModule** | Build system prompt, inject context, version prompt | — | 1 |
| RAGModule | Retrieve context, pgvector ANN search (IDs) → MongoDB fetch | AiModule (Shared) | 2 |
| AiModule (Embedding) | Shared AI Infra: Tạo vector, ghi pgvector, Generic Worker xử lý đa source | LLMModule | 2 |
| PetModule | Rule-based mood, streak, bubble message | DiaryModule | 1 |
| ReminderModule | Tạo jobs BullMQ, xử lý schedule, gửi qua Notification | NotificationModule | 1 |
| **NotificationModule** | Orchestrate ZNS / Web Push / Email, fallback chain | — | 1 |
| **ZaloModule** | Zalo OA API, ZNS template, webhook handler, OAuth | — | 1 |
| PlantScanModule | Upload ảnh, validate, Gemini Vision, lưu kết quả | LLMModule | 3 |
| InsightModule | Weekly insight cron, distributed schedule BullMQ | RAGModule, LLMModule | 1 |
| FeedbackModule | Log AI feedback, rating, A/B test data | — | 1 |
| KnowledgeModule | CRUD knowledge docs, admin, embedding trigger | EmbeddingModule | 2 |
| **SnapModule** | Farm Snap instant photo share, AI training data flywheel, community feed, XP trigger | DiaryModule, PetModule | 2 |
| *SocialModule* | *Post, follow, comment — CHỈ sau khi đủ metrics* | DiaryModule, SnapModule | 4+ |Farm Snap
Update version: v3.0 → v3.1
Specs xong rồi. Bạn duyệt để mình bắt đầu implement không? 🚀

2:42 PM


---

## 7. AI / LLM Architecture

### LLMModule — Single point mọi Gemini call

```
1. Caller (ChatModule, InsightModule, PlantScanModule) gọi llmService.complete(options)
2. LLMModule check Redis counter: RPM < 14? (buffer 1 dưới 15 RPM limit)
3. Nếu gần limit → push vào llm_queue (BullMQ) với priority — không reject user
4. Nếu còn quota → gọi Gemini API, increment Redis counter (TTL 60s)
5. Gemini trả về → LLMModule log: model, latency_ms, prompt_tokens, completion_tokens, prompt_version
6. Trả kết quả về caller. Nếu 429 từ Gemini → retry exponential backoff (1s, 2s, 4s, max 3 lần)
7. Nếu retry hết → trả về fallback: 'AI đang bận, thử lại sau vài giây nhé 🌱'
```

### Rate Limit Handling

| Scenario | Xử lý | Implementation |
|---|---|---|
| Bình thường (< 14 RPM) | Gọi trực tiếp | Redis counter check |
| Gần limit (13–14 RPM) | Enqueue, response async | BullMQ + WebSocket hoặc polling |
| Hit limit (429) | Retry 3 lần backoff | BullMQ attempts=3, backoff exponential |
| Retry hết vẫn fail | Fallback message | Constants trong LLMModule |
| Weekly insight batch | Spread trong 4 tiếng | BullMQ delay: i * (14400000/userCount) ms |
| Token daily limit | Alert khi 800k, switch Gemini Pro | Cron check mỗi giờ |

### pgvector HNSW Index (Search Index Only)

```sql
-- pgvector: ONE TABLE ONLY. No business data lives here.
-- Source of truth is MongoDB.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   TEXT NOT NULL,        -- MongoDB ObjectId as string
  source_type TEXT NOT NULL,        -- 'diary_entry' | 'knowledge_chunk'
  embedding   vector(768) NOT NULL,
  metadata    JSONB,                -- minimal: { cropType, userId, chunkIndex }
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast ANN search (< 10ms p99)
CREATE INDEX ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Active-only composite index
CREATE INDEX idx_embeddings_active
  ON embeddings (source_type, is_active)
  WHERE is_active = TRUE;
```

<!-- REVIEWER FLAG: If you see any pgvector table other than `embeddings`, or if `embeddings` contains columns like `email`, `notes`, `user_id` (business columns), that is a spec violation. -->

---

## 8. Plant Scan — Input Validation

### Validation Layer (thứ tự kiểm tra)

```
1. Rate limit: tối đa 3 scans/user/ngày (free) / 10 scans (premium) — Redis counter
2. File size: tối đa 5MB — Multer limits + client Canvas resize
3. Format check: chỉ accept image/jpeg, image/png, image/webp — mime-type check
4. Perceptual hash (pHash): nếu hash distance < 10 → trả cached result
5. Blur detection: Laplacian variance < 100 → yêu cầu chụp lại
6. Pass tất cả → upload lên R2 (với signed URL) → gọi Gemini Vision
```

| Rule | Giá trị | Implementation |
|---|---|---|
| Max scans/user/ngày | 3 (free) / 10 (premium) | Redis: `scan:limit:{userId}:{date}`, TTL đến 0h |
| Max file size | 5MB | Multer limits + client Canvas resize |
| Accepted formats | JPEG, PNG, WebP | Multer fileFilter + mime-type |
| Cache kết quả | pHash similarity — cache 7 ngày | Redis: `scan:cache:{pHash}`, TTL 7 ngày |
| Blur threshold | Laplacian variance < 100 | Sharp.js |
| Timeout Gemini Vision | 30 giây → retry 1 lần → fail gracefully | axios timeout |

---

## 9. Research Data Retention Policy

| Table | Retention | Action sau retention |
|---|---|---|
| chat_sessions (MongoDB) | Active: 90 ngày (TTL index). Archive: 1 năm | Xóa content, giữ metadata (tokens, latency) |
| ai_feedback (MongoDB) | Vĩnh viễn | Không xóa — valuable for research |
| embeddings (pgvector) | Theo diary entry lifecycle | is_active=false khi diary bị xóa; DELETE sau 24h |
| plant_scans (MongoDB) | Metadata: 1 năm. Ảnh R2: 6 tháng | Xóa ảnh R2, giữ metadata + prediction |
| user_events (MongoDB) | Raw: 30 ngày (TTL index). Aggregated: vĩnh viễn | Aggregate vào analytics trước khi drop |
| reminders (MongoDB) | Delivered: 30 ngày | Hard delete sau 30 ngày |

### Retention Strategy cho chat_sessions (MongoDB)

Chat sessions được quản lý hoàn toàn trong MongoDB với TTL index tự động xóa sau 90 ngày:

```javascript
// chat_sessions collection — TTL index tự động cleanup
db.chat_sessions.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 } // 90 ngày
);

// Index tìm kiếm session của user
db.chat_sessions.createIndex({ userId: 1, updatedAt: -1 });
db.chat_sessions.createIndex({ sessionId: 1 }, { unique: true });
```

### Archive Strategy (MongoDB)

```javascript
// archived_chat_metadata collection — chỉ giữ metadata sau khi content xóa
// Schema:
// {
//   _id: ObjectId,
//   originalSessionId: String, // reference tới chat_sessions._id (đã xóa)
//   userId: String,
//   tokensUsed: Number,
//   modelUsed: String,
//   promptVersion: String,
//   messageCount: Number,
//   archivedAt: ISODate
// }
db.archived_chat_metadata.createIndex({ userId: 1, archivedAt: -1 });
```

---

## 10. Weekly Insight Distributed Scheduling

```
1. Chủ nhật 6:00 AM — Master cron: lấy danh sách users có activity trong 7 ngày
2. Với mỗi user, tính delay = userIndex * (baseDelayMs / totalUsers)
   Ví dụ 500 users → spread trong 2 tiếng = 14.4s/user
3. Enqueue job vào insight_queue với delay tương ứng
4. BullMQ worker xử lý: load diary 7 ngày → RAG → build prompt → Gemini Flash
5. Generate insight → gửi qua NotificationModule (ZNS template WEEKLY_INSIGHT)
6. Log: insight_id, model, tokens, delivery_status, user_rating
7. Thứ Hai 10:00 AM: check delivery rate — nếu < 80% → alert
```

| Config | Giá trị | Lý do |
|---|---|---|
| Queue name | insight_queue | Tách riêng với llm_queue — không block AI chat |
| Concurrency | 2 workers | An toàn với 15 RPM Gemini |
| Job attempts | 3 | Retry nếu Gemini fail |
| Backoff | exponential, 2s base | Tránh thundering herd |
| Remove on complete | true, after 24h | Giữ log nhẹ |
| Priority | low (10) | AI chat (priority 1) luôn ưu tiên hơn |

---

## 11. Database Architecture

### Nguyên tắc phân chia

> **Quy tắc MongoDB-first:** Mặc định mọi dữ liệu ứng dụng mới dùng MongoDB collection. pgvector chỉ chứa bảng `embeddings` (vector search index). Không có business data nào trong pgvector.

| Tiêu chí | → pgvector (search index only) | → MongoDB (primary — all business data) |
|---|---|---|
| Loại dữ liệu | Vector embedding + source_id | Tất cả: users, diary, chat, pet, reminder, snap, insight, audit |
| Vai trò | Derived, rebuildable index | Source of truth |
| Query | ANN similarity search | CRUD, aggregation, TTL cleanup |
| Nếu mất | Chỉ mất search coverage; rebuild từ MongoDB | Dữ liệu mất hoàn toàn |

### Legacy PostgreSQL Schema Reference
<!-- REVIEWER FLAG: The SQL below is LEGACY reference only. All these entities now live in MongoDB collections as defined in mongodb_stack_analysis.md. The only pgvector/SQL table in active use is `embeddings` in embedding_spec.md. -->

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role user_role_enum DEFAULT 'user',
  zalo_user_id TEXT,
  zalo_access_token_encrypted TEXT,
  zalo_notification_enabled BOOLEAN DEFAULT false,
  push_subscription JSONB,
  notification_preference notification_pref_enum DEFAULT 'auto',
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TYPE user_role_enum AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE notification_pref_enum AS ENUM ('auto', 'push', 'zalo', 'email', 'none');

-- Diary entries
CREATE TABLE diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  growth_stage TEXT,
  notes TEXT,
  photo_urls TEXT[],
  watered BOOLEAN DEFAULT false,
  fertilized BOOLEAN DEFAULT false,
  weather JSONB,
  location_text TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON diary_entries (user_id, created_at DESC);

-- Pet state
CREATE TABLE pet_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mood mood_enum DEFAULT 'neutral',
  streak_count INT DEFAULT 0,
  last_diary_at TIMESTAMPTZ,
  mood_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TYPE mood_enum AS ENUM ('happy', 'neutral', 'sad', 'worried', 'excited');

-- Reminders
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type reminder_type_enum NOT NULL,
  channel notification_pref_enum,
  scheduled_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  zns_message_id TEXT,
  status reminder_status_enum DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TYPE reminder_type_enum AS ENUM ('diary', 'water', 'fertilize', 'weekly_insight', 'streak_milestone', 'plant_alert');
CREATE TYPE reminder_status_enum AS ENUM ('pending', 'delivered', 'failed', 'cancelled');
CREATE INDEX ON reminders (user_id, scheduled_at);
CREATE INDEX ON reminders (status, scheduled_at) WHERE status = 'pending';

-- AI Feedback
CREATE TABLE ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_chat_id VARCHAR(24),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  helpful BOOLEAN,
  comment TEXT,
  model_used TEXT,
  prompt_version VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Memory embeddings (pgvector)
CREATE TABLE memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL, -- 'diary_entry' | 'diary_summary'
  source_model VARCHAR(50) DEFAULT 'gemini-embedding-004',
  embedding vector(768) NOT NULL,
  chunk_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON memory_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ON memory_embeddings (source_id, source_type);

-- Knowledge docs (pgvector)
CREATE TABLE knowledge_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT,
  chunk_text TEXT NOT NULL,
  source_model VARCHAR(50) DEFAULT 'gemini-embedding-004',
  embedding vector(768) NOT NULL,
  verified_by UUID REFERENCES users(id),
  quality_score SMALLINT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON knowledge_docs USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Weekly insights
CREATE TABLE weekly_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_text TEXT,
  model_used TEXT,
  tokens_used INT,
  delivery_status TEXT,
  user_rating SMALLINT,
  week_start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON weekly_insights (user_id, week_start_date DESC);

-- Audit log (security)
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON audit_log (user_id, created_at DESC);
CREATE INDEX ON audit_log (action, created_at DESC);

-- Zalo webhook audit
CREATE TABLE zalo_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Farm Snaps (Phase 2) — Instant photo sharing + AI training data
CREATE TYPE snap_condition_enum AS ENUM ('healthy', 'issue', 'harvest', 'other');
CREATE TYPE snap_reaction_enum AS ENUM ('like', 'helpful', 'worry', 'celebrate');

CREATE TABLE farm_snaps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url      TEXT NOT NULL,
  image_key      TEXT NOT NULL,
  caption        TEXT CHECK (char_length(caption) <= 100),
  crop_type      TEXT NOT NULL,
  condition      snap_condition_enum NOT NULL,
  condition_note TEXT CHECK (char_length(condition_note) <= 200),
  location       JSONB,
  weather        JSONB,
  captured_at    TIMESTAMPTZ NOT NULL,
  is_public      BOOLEAN DEFAULT true,
  is_flagged     BOOLEAN DEFAULT false,
  quality_score  SMALLINT,
  xp_earned      SMALLINT DEFAULT 10,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON farm_snaps (user_id, created_at DESC);
CREATE INDEX ON farm_snaps (created_at DESC) WHERE is_public = true AND is_flagged = false;
CREATE INDEX ON farm_snaps (crop_type, condition) WHERE quality_score IS NOT NULL;

CREATE TABLE snap_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snap_id    UUID NOT NULL REFERENCES farm_snaps(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       snap_reaction_enum NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (snap_id, user_id, type)
);

-- Social (Phase 4+)
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  diary_entry_id UUID REFERENCES diary_entries(id),
  caption TEXT,
  photo_urls TEXT[],
  visibility post_visibility_enum DEFAULT 'public',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TYPE post_visibility_enum AS ENUM ('public', 'followers', 'private');
CREATE TABLE follows (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (follower_id, following_id));
CREATE TABLE comments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE reactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (post_id, user_id));
```

### MongoDB — Primary Database (All Application Data)

**ai_chats:**
```json
{
  "_id": "ObjectId",
  "userId": "UUID string",
  "sessionId": "UUID string",
  "messages": [
    {
      "role": "user | assistant",
      "content": "string",
      "model": "gemini-flash",
      "tokens": 120,
      "latency": 850,
      "promptVersion": "v2.1",
      "timestamp": "ISODate"
    }
  ],
  "metadata": { "cropContext": "lúa", "stage": "trổ bông" },
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

**user_events:**
```json
{
  "_id": "ObjectId",
  "userId": "UUID string",
  "eventType": "diary_created | chat_sent | scan_done | feed_scroll",
  "payload": { "postId": "...", "cropType": "...", "scrollDepth": 340 },
  "sessionId": "UUID string",
  "platform": "web | mobile",
  "createdAt": "ISODate"
}
```

**plant_scans:**
```json
{
  "_id": "ObjectId",
  "userId": "UUID string",
  "imageUrl": "string (R2 signed URL)",
  "pHash": "string",
  "cropType": "string",
  "diagnosis": {
    "disease": "string",
    "confidence": 0.87,
    "symptoms": ["vàng lá", "đốm nâu"],
    "treatment": ["phun thuốc X", "giảm tưới"],
    "phiWarning": "Ngừng thu hoạch 14 ngày sau khi phun",
    "similarCases": []
  },
  "modelUsed": "gemini-flash-vision",
  "visionPromptVersion": "v1.3",
  "userConfirmed": true,
  "feedback": "accurate",
  "createdAt": "ISODate"
}
```

**MongoDB indexes:**

```javascript
// ai_chats
db.ai_chats.createIndex({ userId: 1, createdAt: -1 });
db.ai_chats.createIndex({ sessionId: 1 }, { unique: true });
db.ai_chats.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // TTL 90 ngày

// user_events
db.user_events.createIndex({ userId: 1, createdAt: -1 });
db.user_events.createIndex({ eventType: 1, createdAt: -1 });
db.user_events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // TTL 30 ngày

// plant_scans
db.plant_scans.createIndex({ userId: 1, createdAt: -1 });
db.plant_scans.createIndex({ pHash: 1 });
```

---

## 12. Security

> **Nguyên tắc:** Security by default — không phải add-on sau. Mọi endpoint cần auth; mọi upload cần validate; mọi secret cần encrypt.

### 12.1 Authentication & Authorization

**JWT Strategy với Refresh Token:**

```typescript
// Auth flow
// 1. Login → issue access_token (15 phút) + refresh_token (30 ngày, httpOnly cookie)
// 2. Access token hết hạn → client call /auth/refresh → issue access_token mới
// 3. Refresh token hết hạn hoặc revoked → force login lại

// JWT Refresh Token — stored in MongoDB `refresh_tokens` collection
// See mongodb_stack_analysis.md for the full index plan.
// Fields: userId, tokenHash (unique), familyId, replacedBy, deviceInfo, ipAddress, expiresAt, revokedAt, createdAt
```

**RBAC — Role-Based Access Control:**

```typescript
// Roles: user | admin | moderator
// Guards áp dụng ở controller level

@Controller('knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeController {

  @Get()
  @Roles('user', 'admin')    // tất cả user đã login
  findAll() { ... }

  @Post()
  @Roles('admin')            // chỉ admin
  create() { ... }

  @Delete(':id')
  @Roles('admin')
  remove() { ... }
}
```

**Supabase Auth Integration:**

```typescript
// Dùng Supabase làm identity provider, validate JWT trong NestJS
// Không trust client-side userId — luôn lấy từ verified JWT payload

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  validate(payload: SupabaseJwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

### 12.2 CSRF Protection

```typescript
// Dùng cookie → cần CSRF protection
// NestJS + csurf middleware
import * as csurf from 'csurf';
app.use(csurf({ cookie: { httpOnly: true, secure: true, sameSite: 'strict' } }));

// Hoặc dùng Double Submit Cookie pattern
// Hoặc SameSite=Strict cookie (đủ cho most cases nếu không support cross-site)
```

### 12.3 File Upload Security

```typescript
// Multer config an toàn
const multerConfig = {
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB hard limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestException('Invalid file type'), false);
  }
};

// Không lưu file lên server — stream thẳng lên R2
// Không trust Content-Type header — verify với magic bytes
import fileType from 'file-type';
const type = await fileType.fromBuffer(buffer);
if (!['jpg', 'png', 'webp'].includes(type?.ext)) throw new BadRequestException();

// Rename file trước khi upload (tránh path traversal)
const safeFilename = `${userId}/${Date.now()}-${randomUUID()}.${ext}`;
```

### 12.4 Cloudflare R2 — Signed URL

```typescript
// KHÔNG dùng public URL cho ảnh private
// Luôn generate pre-signed URL với TTL ngắn

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
  return getSignedUrl(this.client, command, { expiresIn }); // 1 giờ mặc định
}

// Public assets (thumbnail, avatar) → dùng Cloudflare CDN public bucket riêng
// Private assets (diary photos, scan images) → luôn signed URL
```

### 12.5 Secret Management

```
# Không commit bất kỳ secret nào vào git
# Dùng .env.example (không có value) thay vì .env thật

# Railway: set env vars trong dashboard
# Local dev: .env (trong .gitignore)
# CI/CD: GitHub Actions secrets

# Các secrets cần quản lý:
DATABASE_URL=           # pgvector PostgreSQL connection — search index only (NOT primary DB)
MONGODB_URI=            # MongoDB Atlas — PRIMARY DATABASE (all business data)
REDIS_URL=
GEMINI_API_KEY=
ZALO_APP_ID=
ZALO_SECRET_KEY=
SUPABASE_JWT_SECRET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
RESEND_API_KEY=
JWT_REFRESH_SECRET=
ENCRYPTION_KEY=           # AES-256 cho zalo_access_token
```

### 12.6 Security Headers

```typescript
// main.ts — Helmet + security headers
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'strict-dynamic'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "*.r2.cloudflarestorage.com"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

// Rate limiting global
import { ThrottlerModule } from '@nestjs/throttler';
ThrottlerModule.forRoot([
  { name: 'short', ttl: 60000, limit: 30 },   // 30 req/phút
  { name: 'long',  ttl: 3600000, limit: 500 }, // 500 req/giờ
]);
```

### 12.7 Audit Log

```typescript
// Log mọi action quan trọng: login, delete, admin action, scan, payment
@Injectable()
export class AuditService {
  async log(params: {
    userId: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    req?: Request;
  }) {
    await this.db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        ipAddress: params.req?.ip,
        userAgent: params.req?.headers['user-agent'],
        metadata: params.metadata,
      }
    });
  }
}

// Các action cần audit:
// user.login, user.logout, user.delete_account, user.export_data
// diary.delete, scan.create, admin.*, payment.*
```

### 12.8 Input Validation

```typescript
// Dùng class-validator + class-transformer cho mọi DTO
// ValidationPipe global trong main.ts

app.useGlobalPipes(new ValidationPipe({
  whitelist: true,        // Strip unknown properties
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true }
}));

// Ví dụ DTO
export class CreateDiaryDto {
  @IsString() @MaxLength(100)
  cropType: string;

  @IsString() @IsOptional() @MaxLength(5000)
  notes?: string;

  @IsEnum(GrowthStage)
  growthStage: GrowthStage;
}
```

---

## 13. Observability & Monitoring

> **Nguyên tắc:** Không thể fix những gì bạn không thể thấy. Logging + Metrics + Tracing + Alerting phải có trước khi launch.

### 13.1 Structured Logging (Pino)

```typescript
// logger.module.ts — Pino structured JSON logging
import { Logger } from 'nestjs-pino';
import pino from 'pino';

// Config
const pinoConfig = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
    serializers: {
      req: (req) => ({ method: req.method, url: req.url, id: req.id }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
  }
};

// Mọi log phải có context:
this.logger.log({ userId, action: 'diary.created', entryId }, 'Diary entry created');
this.logger.error({ userId, error: err.message, stack: err.stack }, 'LLM call failed');
this.logger.warn({ userId, rpm: currentRpm }, 'Approaching Gemini rate limit');
```

**Log levels:**
- `error`: Exceptions, failed jobs, unrecoverable errors
- `warn`: Rate limit approach, fallback triggered, retry attempts
- `info`: Request lifecycle, job started/completed, user actions
- `debug`: Query params, payload details (chỉ development)

### 13.2 Error Tracking (Sentry)

```typescript
// sentry.config.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% transactions
  beforeSend(event) {
    // Redact PII trước khi gửi Sentry
    if (event.user) delete event.user.email;
    return event;
  }
});

// GlobalExceptionFilter — catch mọi unhandled exception
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    Sentry.captureException(exception);
    // ... format và return error response
  }
}
```

### 13.3 Metrics (Prometheus)

```typescript
// metrics.service.ts — expose /metrics endpoint cho Prometheus scrape
import { collectDefaultMetrics, Counter, Histogram, Gauge, register } from 'prom-client';

collectDefaultMetrics(); // CPU, memory, event loop lag

// Custom metrics
export const llmCallsTotal = new Counter({
  name: 'llm_calls_total',
  help: 'Total Gemini API calls',
  labelNames: ['model', 'status', 'caller_module'],
});

export const llmLatencyMs = new Histogram({
  name: 'llm_latency_ms',
  help: 'Gemini API latency in milliseconds',
  buckets: [100, 500, 1000, 2000, 5000, 10000],
  labelNames: ['model'],
});

export const llmTokensUsed = new Counter({
  name: 'llm_tokens_used_total',
  help: 'Total tokens consumed',
  labelNames: ['model', 'type'], // type: prompt | completion
});

export const queueDepth = new Gauge({
  name: 'bullmq_queue_depth',
  help: 'BullMQ queue depth',
  labelNames: ['queue_name'],
});

export const activeUsers = new Gauge({
  name: 'active_users_daily',
  help: 'DAU — active users in last 24h',
});
```

### 13.4 Alerting Rules

| Alert | Condition | Severity | Action |
|---|---|---|---|
| High error rate | Error rate > 5% trong 5 phút | Critical | PagerDuty / Zalo group |
| Gemini quota | Token usage > 800k/ngày | Warning | Auto email, slow down |
| Queue lag | BullMQ depth > 100 jobs > 10 phút | Warning | Scale worker |
| DB slow query | Query > 1s xuất hiện > 10 lần/phút | Warning | Review index |
| Memory | Heap usage > 85% | Critical | Restart pod |
| Disk | Disk usage > 80% | Warning | Cleanup or expand |
| Failed delivery | Notification delivery rate < 80% | Warning | Review ZNS / fallback |

### 13.5 Distributed Tracing (OpenTelemetry)

```typescript
// tracing.ts — khởi tạo trước app bootstrap
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';

const sdk = new NodeSDK({
  serviceName: 'farmdiaries-api',
  instrumentations: [
    new HttpInstrumentation(),
    new MongoDBInstrumentation(), // MongoDB primary DB tracing
  ],
});
sdk.start();
```

**Healthcheck endpoint:**

```typescript
// /health — Railway, Render sẽ hit endpoint này
@Get('/health')
@Public()
async health() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: await this.checkDb(),
    redis: await this.checkRedis(),
    mongo: await this.checkMongo(),
  };
}
```

---

## 14. Testing Strategy

> **Nguyên tắc:** Test đủ để tự tin deploy, không test để đạt coverage số. Tập trung vào happy path + critical edge case của các flow quan trọng nhất.

### 14.1 Test Pyramid

```
        /\
       /e2e\      E2E: 10–15 test — critical user journeys
      /------\
     / integ  \   Integration: 30–50 test — module integration
    /----------\
   /  unit      \  Unit: 100+ test — services, utilities, validators
  /--------------\
```

### 14.2 Unit Tests

```typescript
// llm.service.spec.ts — test retry logic, fallback, rate limit
describe('LLMService', () => {
  it('should return fallback message after 3 retries', async () => {
    geminiMock.generateContent.mockRejectedValue({ status: 429 });
    const result = await llmService.complete({ prompt: 'test' });
    expect(result.text).toContain('AI đang bận');
    expect(geminiMock.generateContent).toHaveBeenCalledTimes(3);
  });

  it('should increment Redis counter on each call', async () => {
    await llmService.complete({ prompt: 'test' });
    expect(redisMock.incr).toHaveBeenCalledWith(expect.stringContaining('rpm:'));
  });
});

// notification.service.spec.ts — test fallback chain
describe('NotificationService', () => {
  it('should fallback to email when ZNS fails', async () => {
    zaloMock.sendZNS.mockResolvedValue(false);
    emailMock.send.mockResolvedValue(true);
    await notificationService.send(userId, template, data);
    expect(emailMock.send).toHaveBeenCalled();
  });
});

// plant-scan.validator.spec.ts — test validation layer
describe('PlantScanValidator', () => {
  it('should reject oversized files', async () => {
    await expect(validator.validate(largeBuffer)).rejects.toThrow('File too large');
  });
  it('should reject blurry images', async () => {
    await expect(validator.validate(blurryBuffer)).rejects.toThrow('Image too blurry');
  });
});
```

**Unit test cho:**
- LLMService: retry, backoff, fallback, rate limit counter
- NotificationService: fallback chain, preference logic
- ReminderService: scheduling, delay calculation
- PlantScanValidator: file size, format, blur detection, pHash
- RAGService: cosine similarity threshold, context building
- PromptService: prompt versioning, context injection
- All DTOs: validation rules

### 14.3 Integration Tests

```typescript
// diary.integration.spec.ts
describe('Diary CRUD integration', () => {
  it('POST /diary → creates entry + triggers embedding job', async () => {
    const res = await request(app.getHttpServer())
      .post('/diary')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ cropType: 'lúa', notes: 'Hôm nay tưới nước', growthStage: 'tillering' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    // Verify embedding job was queued
    expect(bullMQ.add).toHaveBeenCalledWith('embed-diary', { entryId: res.body.id });
  });
});

// auth.integration.spec.ts
describe('Auth flow', () => {
  it('POST /auth/login → returns access + refresh token', async () => { ... });
  it('POST /auth/refresh → rotates refresh token', async () => { ... });
  it('POST /auth/refresh with revoked token → 401', async () => { ... });
});
```

**Integration test cho:**
- Auth flow: login, refresh token, logout, revoke
- Diary: CRUD + photo upload + embedding trigger
- Chat: message → LLM call → response + log
- Reminder: create → schedule → deliver → mark delivered
- Plant scan: upload → validate → scan → save result
- RAG: embed query → cosine search → context injection

### 14.4 E2E Tests (Playwright)

```typescript
// e2e/diary-flow.spec.ts
test('Complete diary workflow', async ({ page }) => {
  await page.goto('/login');
  await loginWithTestUser(page);

  await page.click('[data-testid="new-diary"]');
  await page.fill('[data-testid="crop-type"]', 'Lúa IR50404');
  await page.fill('[data-testid="notes"]', 'Hôm nay phát hiện sâu cuốn lá...');
  await page.click('[data-testid="save-diary"]');

  await expect(page.locator('[data-testid="diary-list"]')).toContainText('Lúa IR50404');
  await expect(page.locator('[data-testid="pet-bubble"]')).toBeVisible();
});
```

**E2E test cho:**
- User đăng ký + login + ghi nhật ký đầu tiên
- Chat với AI và nhận response
- Upload ảnh plant scan và nhận kết quả
- Nhận reminder notification

### 14.5 Test Configuration

```typescript
// jest.config.ts
export default {
  projects: [
    { displayName: 'unit', testMatch: ['**/*.spec.ts'], exclude: ['**/*.integration.spec.ts', '**/*.e2e.spec.ts'] },
    { displayName: 'integration', testMatch: ['**/*.integration.spec.ts'] },
  ],
  coverage: {
    provider: 'v8',
    thresholds: { lines: 70, functions: 70, branches: 60 }, // thực tế, không ảo
    exclude: ['**/*.dto.ts', '**/*.config.ts', 'src/main.ts'],
  }
};
```

---

## 15. CI/CD Pipeline

> **Nguyên tắc:** Mọi push đều chạy qua pipeline. Không deploy thủ công lên production.

### 15.1 GitHub Actions — Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check   # tsc --noEmit

  unit-tests:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v4

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: farmdiaries_test }
        options: --health-cmd pg_isready
      redis:
        image: redis:7-alpine
        options: --health-cmd "redis-cli ping"
      mongodb:
        image: mongo:7
        options: --health-cmd "mongosh --eval 'db.adminCommand(\"ping\")'"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run migration:run:test   # chạy migration trên test DB
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/farmdiaries_test
          REDIS_URL: redis://localhost:6379
          MONGODB_URI: mongodb://localhost:27017/farmdiaries_test

  migration-check:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: migration_check }
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run migration:validate  # kiểm tra migration không có lỗi
        env: { DATABASE_URL: postgresql://postgres:test@localhost:5432/migration_check }

  build:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests, migration-check]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist/ }
```

### 15.2 Deploy Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    needs: [build]  # reference CI pipeline
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Railway staging
        run: railway up --service farmdiaries-staging
        env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN_STAGING }} }

      - name: Run smoke tests on staging
        run: npm run test:smoke -- --base-url https://staging.farmdiaries.app

      - name: Run DB migration on staging
        run: railway run --service farmdiaries-staging npm run migration:run

  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment:
      name: production
      url: https://farmdiaries.app
    steps:
      - name: Deploy to Railway production
        run: railway up --service farmdiaries-prod
        env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN_PROD }} }

      - name: Run DB migration on production
        run: railway run --service farmdiaries-prod npm run migration:run

      - name: Notify deployment
        run: |
          curl -X POST ${{ secrets.ZALO_WEBHOOK_DEPLOY }} \
            -d '{"message": "Deployed to production: ${{ github.sha }}"}'
```

### 15.3 Rollback Strategy

```bash
# Railway instant rollback
railway rollback --service farmdiaries-prod --deployment <previous-deployment-id>

# DB rollback (nếu migration có vấn đề)
npm run migration:revert

# Hotfix procedure:
# 1. Create hotfix branch từ main
# 2. Fix, push → CI chạy
# 3. Merge vào main → deploy pipeline
# 4. Không bypass CI dù urgent
```

### 15.4 Branching Strategy

```
main          → production (protected, require PR + CI pass)
develop       → staging auto-deploy
feature/*     → PR vào develop
hotfix/*      → PR vào main (bypass develop khi emergency)
```

---

## 16. Database Migration & Backup

> **Nguyên tắc:** Schema thay đổi phải được version control. Không chạy ALTER TABLE thủ công trên production.

### 16.1 Migration Strategy (TypeORM)

```typescript
// typeorm.config.ts
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  migrations: ['dist/migrations/*.js'],
  migrationsTableName: 'schema_migrations',
  migrationsRun: false, // KHÔNG auto-run — chạy explicit trong deploy
});

// Tạo migration
npx typeorm migration:generate src/migrations/AddUserZaloFields -d src/config/typeorm.config.ts

// Chạy migration
npx typeorm migration:run -d src/config/typeorm.config.ts

// Rollback 1 migration
npx typeorm migration:revert -d src/config/typeorm.config.ts
```

**Quy tắc migration:**

```typescript
// ĐÚNG: Backward-compatible migrations
export class AddZaloFieldsToUsers1700000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    // Thêm column có DEFAULT hoặc nullable — không break existing data
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS zalo_user_id TEXT`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS zalo_notification_enabled BOOLEAN DEFAULT false`);
  }
  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS zalo_user_id`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS zalo_notification_enabled`);
  }
}

// SAI: Rename hoặc drop column trực tiếp (sẽ break production)
// Thay vào đó: expand-contract pattern
// Step 1: Add new_column (nullable)
// Step 2: Migrate data
// Step 3: Drop old_column (bước separate, sau khi confirm ok)
```

### 16.2 Seed Strategy

```typescript
// seeds/seed.ts — chạy riêng với npm run seed
// Không chạy seed trong migration

async function seed() {
  // 1. Knowledge docs cơ bản (cây trồng phổ biến VN)
  await seedKnowledgeDocs();

  // 2. Admin user
  await seedAdminUser();

  // 3. Test user (chỉ development)
  if (process.env.NODE_ENV === 'development') {
    await seedTestData();
  }
}

// Seed idempotent — chạy nhiều lần không tạo duplicate
await db.knowledgeDoc.upsert({
  where: { title: 'Bệnh đạo ôn lúa' },
  update: {},
  create: { title: '...', content: '...' }
});
```

### 16.3 Backup Strategy

**PostgreSQL:**

```bash
# Tự động backup hàng ngày — cron Railway hoặc script riêng
# pg_dump → compress → upload lên R2 backup bucket

#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="farmdiaries_${TIMESTAMP}.sql.gz"

pg_dump $DATABASE_URL | gzip > /tmp/$BACKUP_FILE
aws s3 cp /tmp/$BACKUP_FILE s3://farmdiaries-backup/$BACKUP_FILE \
  --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com

# Xóa backup cũ hơn 30 ngày
aws s3 ls s3://farmdiaries-backup/ | awk '{print $4}' | \
  while read f; do
    age=$(( ($(date +%s) - $(date -d "$(echo $f | grep -oP '\d{8}')" +%s)) / 86400 ))
    [ $age -gt 30 ] && aws s3 rm s3://farmdiaries-backup/$f
  done
```

**MongoDB:**

```bash
# mongodump → compress → upload R2
mongodump --uri $MONGODB_URI --archive=/tmp/mongo_backup_$(date +%Y%m%d).gz --gzip
```

**Backup schedule:**

| Loại | Frequency | Retention | Storage |
|---|---|---|---|
| PostgreSQL full | Daily 2AM | 30 ngày | R2 backup bucket |
| PostgreSQL incremental | Hourly WAL | 7 ngày | Railway built-in hoặc R2 |
| MongoDB | Daily 3AM | 30 ngày | R2 backup bucket |
| R2 media files | Versioning | 90 ngày | R2 Object Lock |

### 16.4 Restore & Disaster Recovery

```bash
# PostgreSQL restore
gunzip -c farmdiaries_20250101_020000.sql.gz | psql $DATABASE_URL_NEW

# MongoDB restore
mongorestore --uri $MONGODB_URI_NEW --archive=/tmp/mongo_backup.gz --gzip

# RTO target: < 2 giờ
# RPO target: < 1 giờ (mất tối đa 1 giờ data)
```

**Disaster Recovery Drill — thực hiện mỗi 3 tháng:**
1. Restore backup vào môi trường staging riêng
2. Verify data integrity (row count, sample queries)
3. Verify app boot được với data restored
4. Document thời gian thực tế

---

## 17. Privacy & Compliance

> **Nguyên tắc:** App lưu nhật ký nông nghiệp, ảnh, GPS, chat AI của người dùng. Đây là dữ liệu nhạy cảm — cần được xử lý có trách nhiệm.

### 17.1 Consent Flow

```typescript
// Khi user đăng ký, cần consent rõ ràng:
// 1. Consent ghi nhật ký + lưu ảnh
// 2. Consent AI phân tích nội dung để đưa gợi ý
// 3. Consent nhận notification (Zalo ZNS / email / push)
// 4. Consent chia sẻ public nếu user bật tính năng social

// Lưu consent với timestamp + version của policy
CREATE TABLE user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type consent_type_enum NOT NULL,
  granted BOOLEAN NOT NULL,
  policy_version VARCHAR(20) NOT NULL,
  ip_address INET,
  granted_at TIMESTAMPTZ DEFAULT now()
);
CREATE TYPE consent_type_enum AS ENUM (
  'data_storage', 'ai_analysis', 'notification_zalo',
  'notification_email', 'notification_push', 'social_sharing'
);

// Không gửi bất kỳ notification nào khi chưa có consent
// Không chạy AI analysis khi user opt-out
```

### 17.2 Delete Account & Data Export

```typescript
// DELETE /users/me — GDPR-style right to erasure
async deleteAccount(userId: string) {
  // 1. Soft delete user record (giữ 30 ngày để undo nếu cần)
  await this.db.users.update({
    where: { id: userId },
    data: { is_deleted: true, deleted_at: new Date(), email: `deleted_${userId}@deleted.invalid` }
  });

  // 2. Queue: xóa data liên quan sau 30 ngày
  await this.queue.add('delete-user-data', { userId }, { delay: 30 * 24 * 60 * 60 * 1000 });

  // 3. Revoke tất cả tokens ngay lập tức
  await this.db.refreshTokens.updateMany({
    where: { user_id: userId },
    data: { revoked_at: new Date() }
  });

  // 4. Audit log
  await this.auditService.log({ userId, action: 'user.delete_account' });
}

// Worker: hard delete sau 30 ngày
async hardDeleteUserData(userId: string) {
  // Xóa ảnh trên R2
  const photos = await this.db.diaryEntries.findMany({ where: { user_id: userId }, select: { photo_urls: true } });
  for (const entry of photos) {
    for (const url of entry.photo_urls) await this.r2.delete(url);
  }

  // Xóa plant scan ảnh trên R2
  // Xóa chat history trên MongoDB
  await this.mongo.ai_chats.deleteMany({ userId });
  await this.mongo.user_events.deleteMany({ userId });
  await this.mongo.plant_scans.deleteMany({ userId });

  // Xóa PostgreSQL data (CASCADE sẽ xóa related records)
  await this.db.users.delete({ where: { id: userId } });
}

// GET /users/me/export — right to data portability
async exportUserData(userId: string): Promise<Buffer> {
  const [user, diaries, chats, scans] = await Promise.all([
    this.db.users.findUnique({ where: { id: userId } }),
    this.db.diaryEntries.findMany({ where: { user_id: userId } }),
    this.mongo.ai_chats.find({ userId }).toArray(),
    this.mongo.plant_scans.find({ userId }).toArray(),
  ]);

  const exportData = { user, diaries, chats, scans, exportedAt: new Date() };
  return Buffer.from(JSON.stringify(exportData, null, 2));
}
```

### 17.3 QR Public Link Privacy

```typescript
// Khi user share QR nhật ký công khai, chỉ expose data user cho phép
// Không expose: email, số điện thoại, GPS chính xác, chat AI, scan results

interface PublicDiaryView {
  farmName: string;          // chỉ tên farm (user định nghĩa)
  cropType: string;
  growthStage: string;
  notes: string;             // chỉ khi user cho phép
  photos: string[];          // chỉ khi user cho phép, dùng public CDN URL
  // KHÔNG có: userId, email, location GPS, AI chats
}
```

### 17.4 Data Minimization

```typescript
// Không log data nhạy cảm
// Pino redact config (đã có trong Section 13)

// Không gửi full user data trong response — chỉ những gì cần
// Dùng DTO transformation
export class UserResponseDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() notification_preference: string;
  // KHÔNG expose: zalo_access_token, refresh_token, ip_address
}
```

---

## 18. AI Safety & Guardrails

> **Nguyên tắc:** AI trong FarmDiaries là công cụ hỗ trợ, không phải chuyên gia thay thế. Đặc biệt với nội dung thuốc bảo vệ thực vật — cần guardrail chặt.

### 18.1 Prompt Injection Defense (RAG)

```typescript
// RAG context injection cần sanitize input
// Ngăn user inject vào system prompt qua diary content

function sanitizeForRAG(userInput: string): string {
  return userInput
    .replace(/\[SYSTEM\]/gi, '[SYS-BLOCKED]')
    .replace(/\[INST\]/gi, '[INST-BLOCKED]')
    .replace(/<\|.*?\|>/g, '')           // llama-style tokens
    .replace(/ignore previous instructions/gi, '[BLOCKED]')
    .substring(0, 2000);                  // truncate
}

// System prompt structure an toàn:
const systemPrompt = `
Bạn là trợ lý nông nghiệp FarmDiaries. Hãy chỉ trả lời các câu hỏi về nông nghiệp.

CONTEXT TỪ NHẬT KÝ:
---
${sanitizeForRAG(ragContext)}
---

USER QUESTION: ${sanitizeForRAG(userMessage)}

Nếu câu hỏi không liên quan đến nông nghiệp, hãy từ chối lịch sự.
`;
```

### 18.2 Source Citation cho AI Answer

```typescript
// Khi RAG trả về câu trả lời, luôn kèm source
interface AIResponse {
  text: string;
  sources: Array<{
    type: 'diary_entry' | 'knowledge_doc';
    title: string;
    date?: string;
    confidence: number;
  }>;
  confidenceScore: number;  // 0–1
  disclaimer?: string;
}

// Ví dụ response:
{
  text: "Dựa trên nhật ký ngày 15/03, cây lúa của bạn đang ở giai đoạn trổ bông...",
  sources: [
    { type: "diary_entry", title: "Nhật ký 15/03", confidence: 0.92 },
    { type: "knowledge_doc", title: "Bệnh đạo ôn lúa — IRRI 2023", confidence: 0.85 }
  ],
  confidenceScore: 0.88
}
```

### 18.3 PHI / BVTV Guardrail

```typescript
// Plant Scan diagnosis — các từ khóa cần xử lý đặc biệt
const PHI_KEYWORDS = ['thuốc', 'phun', 'liều lượng', 'PHI', 'thời gian cách ly'];
const DANGEROUS_PESTICIDES = ['paraquat', 'chlorpyrifos', ...]; // danh sách BVTV hạn chế/cấm VN

// Khi AI gợi ý thuốc BVTV:
function applyBVTVGuardrail(diagnosis: PlantDiagnosis): PlantDiagnosis {
  // 1. Thêm PHI warning nếu có gợi ý phun thuốc
  if (diagnosis.treatment.some(t => PHI_KEYWORDS.some(k => t.includes(k)))) {
    diagnosis.phiWarning = 'Tuân thủ thời gian cách ly PHI trước khi thu hoạch. Tham khảo nhãn thuốc và khuyến cáo địa phương.';
  }

  // 2. Flag thuốc cấm / hạn chế
  const flaggedPesticides = DANGEROUS_PESTICIDES.filter(p =>
    diagnosis.treatment.some(t => t.toLowerCase().includes(p))
  );
  if (flaggedPesticides.length > 0) {
    diagnosis.safetyAlert = `Lưu ý: ${flaggedPesticides.join(', ')} là thuốc hạn chế/cấm tại VN. Tham khảo Chi cục BVTV địa phương.`;
  }

  return diagnosis;
}
```

### 18.4 Disclaimer & Confidence Score

```typescript
// Luôn hiển thị disclaimer với AI answers
const DISCLAIMER = {
  plant_scan: 'Kết quả AI chỉ mang tính tham khảo. Để chẩn đoán chính xác, hãy liên hệ cán bộ khuyến nông địa phương.',
  chat: 'FarmDiaries AI hỗ trợ thông tin nông nghiệp, không thay thế tư vấn chuyên môn.',
  pesticide: 'Việc sử dụng thuốc BVTV cần tuân thủ quy định địa phương và hướng dẫn của cơ quan chức năng.'
};

// Confidence threshold
const MIN_CONFIDENCE_THRESHOLD = 0.6;
if (diagnosis.confidence < MIN_CONFIDENCE_THRESHOLD) {
  diagnosis.lowConfidenceWarning = 'Độ tin cậy thấp. Vui lòng chụp lại ảnh rõ hơn hoặc mô tả thêm triệu chứng.';
}
```

### 18.5 Content Moderation

```typescript
// Không cho phép chat về:
const BLOCKED_TOPICS = ['chính trị', 'bạo lực', 'nội dung người lớn'];

// Prompt system luôn có guardrail
const systemPrompt = `
Bạn chỉ trả lời câu hỏi về nông nghiệp, cây trồng, vật nuôi, và canh tác.
Từ chối lịch sự nếu câu hỏi nằm ngoài phạm vi này.
Không đưa ra tư vấn y tế, pháp lý, tài chính.
`;
```

---

## 19. Scalability & Performance

### 19.1 Caching Strategy

```typescript
// Redis caching layer
// Rule: Cache data ít thay đổi, đọc nhiều, tính toán tốn kém

// User profile (cache 5 phút — user ít khi update)
async getUserProfile(userId: string) {
  const cacheKey = `user:profile:${userId}`;
  const cached = await this.redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const user = await this.db.users.findUnique({ where: { id: userId } });
  await this.redis.setex(cacheKey, 300, JSON.stringify(user)); // TTL 5 phút
  return user;
}

// Knowledge docs embedding (cache 1 ngày — admin ít khi update)
// RAG search results (cache 1 giờ theo query hash)
// Weekly insight (cache 7 ngày — chỉ generate 1 lần/tuần)

// Cache invalidation — luôn invalidate khi data thay đổi
async updateUser(userId: string, data: Partial<User>) {
  const user = await this.db.users.update({ where: { id: userId }, data });
  await this.redis.del(`user:profile:${userId}`); // invalidate cache
  return user;
}
```

### 19.2 Database Connection Pool

```typescript
// typeorm config — connection pool
{
  type: 'postgres',
  url: process.env.DATABASE_URL,
  extra: {
    max: 20,           // tối đa 20 connections (Railway starter: 25 max)
    min: 2,            // giữ ít nhất 2 idle connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,   // kill query > 10 giây
  }
}

// MongoDB connection pool
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
});
```

### 19.3 Pagination — Cursor-based

```typescript
// KHÔNG dùng OFFSET (slow khi table lớn)
// Dùng cursor-based pagination

// ❌ Sai:
SELECT * FROM diary_entries WHERE user_id = $1 LIMIT 20 OFFSET 100;

// ✅ Đúng:
SELECT * FROM diary_entries
WHERE user_id = $1
  AND created_at < $cursor  -- cursor là timestamp của item cuối trong page trước
ORDER BY created_at DESC
LIMIT 20;

// API response
interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;  // timestamp của item cuối, null nếu hết
  hasMore: boolean;
}
```

### 19.4 Image CDN

```typescript
// R2 + Cloudflare CDN cho public images
// Private images → signed URL (xem Section 12.4)
// Public thumbnails → Cloudflare CDN URL trực tiếp

// Image optimization khi upload
import sharp from 'sharp';

async optimizeImage(buffer: Buffer): Promise<{ original: Buffer; thumbnail: Buffer }> {
  const original = await sharp(buffer)
    .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const thumbnail = await sharp(buffer)
    .resize(400, 400, { fit: 'cover' })
    .jpeg({ quality: 75 })
    .toBuffer();

  return { original, thumbnail };
}
```

### 19.5 Horizontal Scaling Plan

| Component | Current (MVP) | Scale trigger | Scale action |
|---|---|---|---|
| API server | 1 instance | CPU > 70% sustained | Add instances (Railway) |
| BullMQ workers | 1 process | Queue depth > 100 sustained | Spawn worker processes |
| PostgreSQL | 1 instance | Read IOPS > 80% | Add read replica |
| MongoDB | Atlas free → shared | 512MB storage limit | Upgrade Atlas tier |
| Redis | Single node | Memory > 80% | Upgrade to Redis Cluster |

### 19.6 Query Optimization

```sql
-- Slow query log: query > 100ms cần review
ALTER SYSTEM SET log_min_duration_statement = 100;

-- Quan trọng: index tất cả foreign keys
CREATE INDEX ON diary_entries (user_id);
CREATE INDEX ON reminders (user_id);
CREATE INDEX ON ai_feedback (user_id);

-- Composite index cho queries phổ biến
CREATE INDEX ON diary_entries (user_id, created_at DESC);
CREATE INDEX ON reminders (user_id, status, scheduled_at);

-- EXPLAIN ANALYZE trước khi release bất kỳ query phức tạp nào
EXPLAIN ANALYZE SELECT ...;
```

---

## 20. MVP Build Order

| # | Feature / Task | Detail | Priority | Tháng |
|---|---|---|---|---|
| 1 | DB Schema + pgvector + MongoDB | PostgreSQL: tất cả tables + HNSW index. MongoDB: 3 collections. TypeORM migration setup. | P0 Must | 1 |
| 2 | Auth + Security cơ bản | Supabase Auth + JWT refresh token + RBAC guards + Helmet | P0 Must | 1 |
| 3 | Zalo OAuth setup | Supabase Auth + Zalo OA setup, lưu zalo_user_id | P0 Must | 1 |
| 4 | Diary CRUD + R2 | Ghi nhật ký, upload ảnh R2 với signed URL, photo_url[] | P0 Must | 1 |
| 5 | LLMModule + Rate Limit | Gemini call, Redis RPM counter, BullMQ retry, fallback | P0 Must | 1 |
| 6 | ChatModule + PromptModule | Tách module rõ, AI chat cơ bản không RAG, prompt versioning | P0 Must | 1 |
| 7 | PetModule — Rule mood | Mood từ streak + diary, không dùng LLM | P0 Must | 1 |
| 8 | NotificationModule + Zalo ZNS | Fallback chain: ZNS → Email. ZNS template approve | P0 Must | 1 |
| 9 | ReminderModule | BullMQ jobs, distributed schedule | P0 Must | 1 |
| 10 | Research Logging + Observability | Pino logging, Sentry, retention cron, archived_chats | P0 Must | 1 |
| 11 | CI Pipeline cơ bản | GitHub Actions: lint + unit test + build | P0 Must | 1 |
| 12 | EmbeddingModule | Diary entry → summary → embed → pgvector | P0 Must | 2 |
| 13 | RAGModule + KnowledgeBase | pgvector search, context building, knowledge docs seed | P0 Must | 2 |
| 14 | AI Safety Guardrails | Prompt injection defense, BVTV guardrail, disclaimer, confidence | P0 Must | 2 |
| 15 | Weekly Insight — Distributed | BullMQ spread 2h, ZNS delivery, log rating | P1 Should | 2 |
| 16 | DB Migration strategy + Backup | TypeORM migration, backup script, restore drill | P1 Should | 2 |
| 17 | PlantScanModule + Validation | Validation layer đầy đủ, pHash cache, Gemini Vision, PHI guardrail | P1 Should | 3 |
| 18 | PWA + Web Push | Vite PWA, Service Worker, upgrade notification channel | P1 Should | 3 |
| 19 | Privacy features | Delete account, data export, consent flow | P1 Should | 3 |
| 20 | Integration tests | Auth/diary/AI flow test đầy đủ | P1 Should | 3 |
| 21 | Deploy pipeline | Staging → Production deploy, rollback | P1 Should | 3 |
| 22 | Metrics Dashboard | Prometheus + Grafana / Railway metrics, alerting rules | P2 Nice | 4 |
| 23 | A/B Test Infrastructure | prompt_version tracking, split test Gemini vs Pro | P2 Nice | 4 |
| 24 | Social Layer | CHỈ khi DAU >= 500 + D7 retention >= 30% | P3 Later | 4+ |

---

## 21. Không build trong MVP

| Không dùng | Lý do | Xem xét lại khi |
|---|---|---|
| MongoDB cho app data chính | PostgreSQL mạnh hơn cho relational — chỉ MongoDB cho 3 AI/event collections | Không áp dụng |
| Pinecone / Weaviate | pgvector HNSW đủ tốt cho MVP → 1M+ vectors | Không cần switch |
| Kafka | BullMQ + Redis đủ cho scale 100k+ user | Chỉ khi > 500k events/phút |
| Kubernetes | Railway/Render PaaS đủ dùng | Khi > 50k DAU |
| GraphQL | REST đủ dùng, GraphQL thêm complexity | Không cần với stack này |
| Custom ML model | Không đủ data, Gemini Vision đủ validate UX | Sau 1000+ confirmed scans |
| OpenAI Embedding | Gemini text-embedding-004 free và đủ tốt | Khi search quality cần cải thiện |
| SMS / Twilio | Zalo OA rẻ hơn và penetration cao hơn ở nông thôn VN | Nếu user yêu cầu + budget |
| Content Moderation AI | Chưa có content, chưa cần moderate | Khi có social feed + > 100 posts/ngày |
| PostGIS geolocation | Text filter region đủ dùng, PostGIS overkill | Khi cần geo-clustering thực sự |
| DM / nhắn tin realtime | Zalo đã làm điều này tốt hơn | Sau social feed stable |
| Vault / Consul | Railway env vars đủ cho MVP | Khi có on-premise hoặc self-host |
| GDPR full compliance | Target user VN — theo dõi Luật ANTT VN | Khi mở rộng sang EU |
| SOC2 / ISO27001 | Quá tốn kém cho MVP | Khi có enterprise customer |

---

## 22. Production Readiness Checklist

Checklist này phải đạt **≥ 80% tick** trước khi launch public. Dùng như gate cho mỗi milestone.

### Security

- [ ] JWT access token (15 phút) + refresh token (30 ngày, httpOnly cookie) implemented
- [ ] RBAC guards áp dụng cho tất cả protected endpoints
- [ ] Supabase Auth JWT verified trong mọi request
- [ ] Signed URL R2 cho mọi private asset (không có public URL)
- [ ] File upload: mime-type check + magic bytes + size limit
- [ ] Helmet headers enabled (CSP, HSTS, X-Frame-Options)
- [ ] Rate limiting global (ThrottlerModule)
- [ ] CSRF protection nếu dùng cookie auth
- [ ] Secret management: không có secret nào trong git
- [ ] zalo_access_token encrypted at rest (AES-256)
- [ ] Input validation: ValidationPipe global + whitelist + forbidNonWhitelisted
- [ ] Audit log cho mọi action quan trọng
- [ ] SQL injection: dùng parameterized query (TypeORM mặc định đúng)

### Observability

- [ ] Pino structured JSON logging trên mọi service
- [ ] Sentry error tracking connected + test error đã xuất hiện
- [ ] /health endpoint return db + redis + mongo status
- [ ] Pino redact config: không log token, password, sensitive data
- [ ] Custom metrics: llm_calls_total, llm_latency_ms, llm_tokens_used, queue_depth
- [ ] Alerting rules: error rate > 5%, queue lag > 100, memory > 85%
- [ ] Log level configurable qua env var LOG_LEVEL
- [ ] Request ID middleware (mỗi request có unique ID)

### Testing

- [ ] Unit test coverage ≥ 70% cho business logic (services, validators)
- [ ] LLMService: retry, fallback, rate limit test
- [ ] NotificationService: fallback chain test
- [ ] Auth flow: login, refresh token, logout test
- [ ] Diary CRUD: create + embedding trigger test
- [ ] Plant scan validator: file size, format, blur test
- [ ] Integration test: auth + diary + chat flow
- [ ] npm test pass trên CI (không có skip hoặc pending)

### CI/CD

- [ ] GitHub Actions CI: lint → type-check → unit test → integration test → build
- [ ] CI fail khi test fail (không bypass)
- [ ] Migration check chạy trong CI
- [ ] Deploy pipeline: staging deploy trước production
- [ ] Smoke test chạy sau staging deploy
- [ ] Rollback procedure documented và tested
- [ ] main branch protected (require PR + CI pass)
- [ ] Environment variables set trong Railway/Render (không dùng .env file)

### Database Migration & Backup

- [ ] TypeORM migration setup — không có ALTER TABLE thủ công
- [ ] Tất cả schema changes đều qua migration file
- [ ] Migration down() function implemented và tested
- [ ] Seed script idempotent (chạy nhiều lần không duplicate)
- [ ] PostgreSQL backup tự động hàng ngày lên R2
- [ ] MongoDB backup tự động hàng ngày lên R2
- [ ] Restore từ backup đã được test ít nhất 1 lần
- [ ] RTO/RPO target documented (< 2h / < 1h)

### Privacy & Compliance

- [ ] Consent flow: user đồng ý trước khi store data + receive notification
- [ ] Delete account flow: soft delete + hard delete sau 30 ngày
- [ ] Data export flow: user có thể download toàn bộ data của mình
- [ ] QR public link: không expose PII (email, phone, GPS, AI chat)
- [ ] Pino redact: không log sensitive user data
- [ ] refresh_token table: revoke immediately khi delete account
- [ ] Privacy policy URL hiển thị khi đăng ký

### AI Safety

- [ ] Prompt injection defense: sanitize user input trước khi inject vào system prompt
- [ ] RAG context: sanitize diary content trước khi dùng làm context
- [ ] Plant scan: disclaimer "không thay thế chuyên gia" hiển thị mọi kết quả
- [ ] PHI warning: hiển thị khi AI gợi ý dùng thuốc BVTV
- [ ] BVTV guardrail: flag thuốc hạn chế/cấm tại VN
- [ ] Source citation: mọi AI answer kèm nguồn (diary entry / knowledge doc)
- [ ] Confidence score: hiển thị và cảnh báo khi score < 0.6
- [ ] Chat guardrail: system prompt restrict chủ đề nông nghiệp only

### Deployment

- [ ] Railway/Render config: health check endpoint set
- [ ] Auto-restart on crash enabled
- [ ] Memory limit set (tránh OOM kill toàn server)
- [ ] DB connection pool config phù hợp với plan (max connections)
- [ ] CORS config: chỉ allow production domain + localhost dev
- [ ] NODE_ENV=production set
- [ ] pgvector extension enabled trên production DB
- [ ] MongoDB Atlas IP whitelist: chỉ Railway server IP
- [ ] R2 bucket permissions: private bucket, không public access
- [ ] ZNS template đã approved trước launch date ít nhất 1 tuần

### Launch Gate

> Đạt **≥ 80% checklist** (≥ 64/80 items) trước khi mở cho user thật.
> Đạt **100% Security + Observability** — không có ngoại lệ.
> Đạt **100% Database backup** — không có ngoại lệ.

---

*FarmDiaries AI — Technical Blueprint v6.0 Production-Grade Edition*
*Internal Specs · Source of Truth · Confidential*

**Build smart. Log everything. Security by default. Scale when ready. 🌱**
