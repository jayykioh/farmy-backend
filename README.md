# 🌾 Farmy Backend — NestJS API Server

> **FarmDiaries AI** — Nền tảng nhật ký canh tác thông minh cho nông dân Việt Nam. Backend được xây dựng với NestJS (TypeScript), MongoDB Atlas, Redis, BullMQ và Cloudflare R2.

---

## 📋 Mục lục

1. [Tổng quan Dự án](#1-tổng-quan-dự-án)
2. [Tech Stack](#2-tech-stack)
3. [Cấu trúc Thư mục](#3-cấu-trúc-thư-mục)
4. [Yêu cầu Hệ thống](#4-yêu-cầu-hệ-thống)
5. [Cài đặt & Chạy Local](#5-cài-đặt--chạy-local)
6. [Biến Môi trường (.env)](#6-biến-môi-trường-env)
7. [API Endpoints](#7-api-endpoints)
8. [Database: MongoDB + pgvector](#8-database-mongodb--pgvector)
9. [Database Migration & Seeding](#9-database-migration--seeding)
10. [Cloudflare R2 Storage](#10-cloudflare-r2-storage)
11. [Authentication & Security](#11-authentication--security)
12. [BullMQ: Queue & Background Jobs](#12-bullmq-queue--background-jobs)
13. [Testing](#13-testing)
14. [Kiến trúc Tổng quan](#14-kiến-trúc-tổng-quan)

---

## 1. Tổng quan Dự án

**Farmy Backend** là RESTful API server cho hệ thống FarmDiaries AI — ứng dụng giúp nông dân:

- 📓 Ghi nhật ký canh tác hàng ngày (cây trồng, tình trạng, thời tiết)
- 🔬 Chẩn đoán bệnh cây bằng AI (Gemini Vision)
- 🐾 Gamification thông qua thú ảo đồng hành (Pet Mascot)
- ⏰ Nhắc nhở tưới nước, bón phân tự động (BullMQ + Zalo ZNS)
- 📊 Tổng kết insight nông nghiệp hàng tuần (Weekly AI Report)

> **Capstone Project** — SDN392 | Stack: Node.js · NestJS · MongoDB · Redis · Cloudflare R2 · Gemini AI

---

## 2. Tech Stack

| Layer | Công nghệ | Phiên bản | Ghi chú |
|---|---|---|---|
| **Runtime** | Node.js + TypeScript | ≥ 20 LTS | TypeScript-first |
| **Framework** | NestJS | ^11 | Clean Architecture, DI, Guards |
| **Database Primary** | MongoDB Atlas | Mongoose ^9 | Tất cả business data |
| **Vector Search** | Supabase Postgres + pgvector | — | Search index only (`embeddings` table) |
| **Cache / Queue** | Redis + BullMQ | ioredis ^5 | Rate limit AI, job queue |
| **Storage** | Cloudflare R2 | AWS SDK S3 | Ảnh nhật ký, plant scans |
| **Auth** | JWT (Access + Refresh Cookie) | Passport-JWT | Supabase Auth integration |
| **Scheduler** | @nestjs/schedule | ^6 | Cron jobs |
| **HTTP** | @nestjs/platform-express | ^11 | Express adapter |

---

## 3. Cấu trúc Thư mục

```
farmy-backend/
├── src/
│   ├── modules/
│   │   ├── auth/           # JWT Auth, Register/Login/Refresh/Logout, Zalo OAuth
│   │   │   ├── application/    # Use-cases & services
│   │   │   ├── domain/         # Domain models
│   │   │   ├── infrastructure/ # Mongoose schemas, repositories
│   │   │   └── interface/      # Controllers, DTOs
│   │   ├── farm/           # Farm Plots & Diary Logs (CRUD)
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── interface/
│   │   ├── pet/            # Thú ảo — mood, streak, XP, bubble messages
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   └── interface/
│   │   ├── ai/             # LLM integration (Gemini) — WIP
│   │   ├── snap/           # Farm Snap — photo share (Phase 2)
│   │   ├── knowledge/      # Knowledge base docs for RAG
│   │   └── storage/        # Cloudflare R2 service
│   │       ├── r2-storage.service.ts
│   │       └── storage.module.ts
│   ├── common/
│   │   ├── guards/         # JwtAuthGuard, RolesGuard
│   │   ├── filters/        # HttpExceptionFilter (auth errors)
│   │   ├── decorators/     # @Public(), @Roles(), @CurrentUser()
│   │   ├── middleware/     # Request pipeline middleware
│   │   └── health/         # HealthService (DB + Redis check)
│   ├── config/
│   │   └── app.config.ts   # Centralized config loader
│   ├── db/
│   │   ├── migrations/     # Chronological migration scripts
│   │   ├── database-migration.service.ts
│   │   ├── database-seed.service.ts
│   │   ├── db.module.ts
│   │   ├── migrate.ts      # CLI: npm run db:migrate
│   │   ├── seed.ts         # CLI: npm run db:seed
│   │   └── verify.ts       # CLI: npm run db:verify
│   ├── app.module.ts
│   └── main.ts
├── test/                   # E2E tests (Jest + Supertest)
├── specs/                  # (Thư mục specs backend)
├── .env.example            # Template biến môi trường
├── BACKEND_CONTRACT.md     # API contract cho Frontend
├── R2_STORAGE_GUIDE.md     # Hướng dẫn sử dụng Cloudflare R2
└── package.json
```

---

## 4. Yêu cầu Hệ thống

| Công cụ | Phiên bản tối thiểu |
|---|---|
| Node.js | ≥ 20.x LTS |
| npm | ≥ 10 |
| MongoDB | Atlas hoặc Local 7.x |
| Redis | ≥ 7.x (hoặc Upstash Redis) |

> **Gợi ý local:** Dùng Docker để chạy MongoDB và Redis nhanh chóng.
> ```bash
> docker run -d -p 27017:27017 --name mongo mongo:7
> docker run -d -p 6379:6379 --name redis redis:7-alpine
> ```

---

## 5. Cài đặt & Chạy Local

### 5.1 Clone & Install

```bash
git clone <repo-url>
cd farmy-backend
npm install
```

### 5.2 Cấu hình Môi trường

```bash
cp .env.example .env
# Điền các giá trị thật vào .env (xem mục 6 bên dưới)
```

### 5.3 Chạy Database Migration & Seeding

```bash
# Tạo các indexes trong MongoDB
npm run db:migrate

# Seed dữ liệu mẫu (admin@farmy.com / user@farmy.com)
npm run db:seed

# Xem thống kê dữ liệu trong DB
npm run db:verify
```

### 5.4 Khởi động Server

```bash
# Development (hot-reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

Server mặc định chạy tại: `http://localhost:3000`

API base URL: `http://localhost:3000/api/v1`

Health check: `http://localhost:3000/health`

---

## 6. Biến Môi trường (.env)

Tạo file `.env` từ `.env.example` và điền đầy đủ:

```env
# ── Server ────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── CORS ──────────────────────────────────────
# FE Vite dev thường chạy ở :5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174

# ── Cookie ────────────────────────────────────
# strict | lax | none
COOKIE_SAME_SITE=strict

# ── MongoDB ───────────────────────────────────
# Local:
MONGO_URI=mongodb://127.0.0.1:27017/farmy
# Atlas (production):
# MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?appName=FarmDiaries

# ── JWT ───────────────────────────────────────
JWT_SECRET=your_jwt_access_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# ── Redis (BullMQ + Cache) ─────────────────────
REDIS_URL=redis://127.0.0.1:6379
# Hoặc dùng từng field:
# REDIS_HOST=127.0.0.1
# REDIS_PORT=6379
# REDIS_PASSWORD=

# ── Supabase Postgres + pgvector (search index only, NOT primary DB) ──
SUPABASE_DB_URL=postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# ── Cloudflare R2 Storage ─────────────────────
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

> **Bảo mật:** Không commit file `.env` thật lên Git. File `.gitignore` đã cấu hình sẵn.

---

## 7. API Endpoints

Tất cả endpoints đều có prefix `/api/v1`. Các endpoint yêu cầu xác thực (`🔐`) phải gửi kèm `Authorization: Bearer <accessToken>`.

### 7.1 Auth — `/api/v1/auth`

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| `POST` | `/auth/register` | 🔓 Public | Đăng ký tài khoản mới |
| `POST` | `/auth/login` | 🔓 Public | Đăng nhập, nhận `accessToken` + set `refresh_token` cookie |
| `POST` | `/auth/refresh` | 🍪 Cookie | Làm mới `accessToken` (rotate Refresh Token) |
| `POST` | `/auth/logout` | 🔐 Bearer | Đăng xuất, thu hồi Refresh Token |
| `GET` | `/auth/me` | 🔐 Bearer | Lấy thông tin user hiện tại |

**Register — Request body:**
```json
{ "email": "string", "password": "string", "name": "string" }
```

**Login — Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "expiresIn": 900,
    "user": { "id": "...", "email": "...", "name": "...", "role": "user" }
  }
}
```
> Cookie: `Set-Cookie: refresh_token=<JWT>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000`

---

### 7.2 Farm Plots — `/api/v1/plots` 🔐

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/plots` | Tạo mảnh vườn mới |
| `GET` | `/plots` | Danh sách mảnh vườn của user |
| `GET` | `/plots/:id` | Chi tiết mảnh vườn |
| `PUT` | `/plots/:id` | Cập nhật mảnh vườn |
| `DELETE` | `/plots/:id` | Xóa mảnh vườn (204) |

**Request body (POST/PUT):**
```json
{ "name": "string", "area_size": 1500, "description": "string (optional)" }
```

**Response data:**
```json
{ "_id": "...", "user_id": "...", "name": "...", "area_size": 1500, "description": "...", "created_at": "..." }
```

---

### 7.3 Diaries & Logs — `/api/v1/diaries` 🔐

Nhật ký canh tác theo từng mảnh vườn. Mỗi diary có nhiều log hoạt động hàng ngày.

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/diaries` | Tạo nhật ký mới |
| `GET` | `/diaries` | Danh sách nhật ký |
| `GET` | `/diaries/:id` | Chi tiết nhật ký |
| `PUT` | `/diaries/:id` | Cập nhật nhật ký |
| `DELETE` | `/diaries/:id` | Xóa nhật ký |
| `POST` | `/diaries/:diaryId/logs` | Thêm log hoạt động vào diary |
| `GET` | `/diaries/:diaryId/logs` | Danh sách logs của diary |
| `GET` | `/diaries/logs/:id` | Chi tiết một log |
| `PUT` | `/diaries/logs/:id` | Cập nhật log |
| `DELETE` | `/diaries/logs/:id` | Xóa log |

**Tạo diary (POST /diaries):**
```json
{ "plot_id": "string", "crop_type": "Lúa", "start_date": "2026-06-01" }
```

**Tạo log (POST /diaries/:id/logs):**
```json
{ "activity_type": "watering", "content": "Tưới 2 lít/m²", "image_url": "string (optional)" }
```

---

### 7.4 Reminders — `/api/v1/reminders` 🔐

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/reminders` | Tạo nhắc nhở mới |
| `GET` | `/reminders` | Tất cả nhắc nhở |
| `GET` | `/reminders/pending` | Nhắc nhở đang chờ xử lý |
| `GET` | `/reminders/:id` | Chi tiết |
| `PUT` | `/reminders/:id` | Cập nhật |
| `PATCH` | `/reminders/:id/complete` | Đánh dấu hoàn thành (kích mood Pet) |
| `PATCH` | `/reminders/:id/cancel` | Hủy nhắc nhở |
| `DELETE` | `/reminders/:id` | Xóa |

**Request body (POST):**
```json
{
  "title": "Tưới cây",
  "remind_at": "2026-06-10T08:00:00Z",
  "diary_id": "string (optional)",
  "type": "water | fertilize | diary | streak_milestone | plant_alert",
  "schedule_slot": "morning | noon | afternoon | evening",
  "repeat": "none | daily | weekly"
}
```

---

### 7.5 Pet Mascot — `/api/v1/pet` 🔐

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/pet/state` | Lấy trạng thái thú ảo hiện tại |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "user_id": "...",
    "mood": "happy | excited | neutral | sad | worried",
    "streak_count": 7,
    "level": 3,
    "xp": 420,
    "mood_reason": "Bạn đã ghi nhật ký 7 ngày liên tiếp!",
    "last_diary_at": "2026-06-09T18:30:00Z",
    "bubble_message": "Hôm qua bạn đã tưới nước cho Lúa, hãy kiểm tra độ ẩm đất hôm nay nhé! 🌾",
    "updated_at": "..."
  }
}
```

**Mood mapping:**
| Mood | Trạng thái | Trigger |
|---|---|---|
| `excited` | Phấn khích 🎉 | Streak 7/14/30 ngày |
| `happy` | Vui vẻ 🌱 | Ghi nhật ký hàng ngày |
| `neutral` | Bình thường | Chưa ghi trong 24h |
| `sad` | Buồn bã 😢 | Quá 36h chưa ghi |
| `worried` | Lo lắng 😰 | Nhận cảnh báo sâu bệnh |

---

### 7.6 System — Public

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/health` | Health check (MongoDB + Redis status) |
| `GET` | `/` | Hello endpoint |

---

### 7.7 Response Format Chuẩn

Tất cả API responses đều theo format:

```typescript
// Thành công có data
{ "success": true, "data": T }

// Thành công chỉ message
{ "success": true, "message": "string" }

// Lỗi
{ "errorCode": "string", "message": "string" }
```

### 7.8 Auth Error Codes

| `errorCode` | HTTP | Tình huống |
|---|---|---|
| `AUTH_MISSING_ACCESS_TOKEN` | 401 | Không có Bearer token |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token hết hạn → trigger refresh |
| `AUTH_INVALID_TOKEN` | 401 | Token sai chữ ký |
| `AUTH_INVALID_CREDENTIALS` | 401 | Sai email/password |
| `AUTH_EMAIL_EXISTS` | 409 | Email đã tồn tại |
| `AUTH_REFRESH_FAILED` | 401 | Refresh token không hợp lệ → force logout |
| `AUTH_TOKEN_REUSED` | 401 | Token theft detected — toàn bộ session bị revoke |
| `AUTH_FORBIDDEN` | 403 | Không đủ quyền (RBAC) |

---

## 8. Database: MongoDB + pgvector

### 8.1 Nguyên tắc MongoDB-first

> **Quy tắc:** MongoDB là **primary database duy nhất** (source of truth) cho tất cả business data (users, diaries, pet_states, reminders, plant_scans, chat_sessions, knowledge_chunks, weekly_insights). Supabase Postgres + pgvector chỉ dùng làm **managed vector search index** (bảng `embeddings`).

| Database | Vai trò | Dữ liệu |
|---|---|---|
| **MongoDB Atlas** | Source of Truth | users, diaries, pets, reminders, chat, scans, snaps, insights (tất cả business data) |
| **Supabase Postgres** | Vector Search Index | `embeddings(source_id, source_type, chunk_index, embedding, metadata)` |

### 8.2 MongoDB Collections

| Collection | Lưu trữ | Indexes chính |
|---|---|---|
| `users` | User profile, Zalo/push prefs, role | `email`, `zaloUserId` |
| `refresh_tokens` | Token hash, family, expiry, device | `tokenHash` unique, `expiresAt` TTL |
| `farm_plots` | Mảnh vườn, diện tích, mô tả | `userId+createdAt` |
| `diaries` | Nhật ký cây trồng, vòng đời | `userId+createdAt`, `plotId` |
| `diary_logs` | Log hoạt động hàng ngày | `diaryId+createdAt` |
| `pet_states` | Mood, streak, XP, level | `userId` unique |
| `reminders` | Nhắc nhở, status, retry, channel | `status+scheduledAt`, `userId` |
| `plant_scans` | Ảnh, pHash, chẩn đoán AI | `userId+createdAt`, `pHash` |
| `chat_sessions` | Lịch sử chat AI, TTL 90 ngày | `userId+updatedAt`, `sessionId` unique |
| `knowledge_chunks` | Tài liệu kỹ thuật nông nghiệp | `cropType+qualityScore` |
| `weekly_insights` | Báo cáo tuần, delivery state | `userId+weekStartDate` |
| `audit_logs` | Compliance records (append-only) | `userId+createdAt` |
| `user_events` | Analytics events, TTL 30 ngày | `eventType+createdAt` |

### 8.3 pgvector — Embeddings Only

```sql
-- Chỉ có 1 table duy nhất trong pgvector (Supabase Postgres)
CREATE TABLE embeddings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   TEXT        NOT NULL,   -- MongoDB ObjectId as string
  source_type TEXT        NOT NULL,   -- 'diary_entry' | 'knowledge_chunk'
  chunk_index INT         NOT NULL DEFAULT 0,  -- index của chunk trong document
  embedding   vector(768) NOT NULL,   -- text-embedding-004
  metadata    JSONB,      -- { cropType, userId, chunkIndex } — minimal only
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- UNIQUE per source + chunk — cho phép multi-chunk per document
CREATE UNIQUE INDEX uq_embeddings_source_chunk
  ON embeddings (source_id, source_type, chunk_index);

-- HNSW index — ANN search < 10ms p99
CREATE INDEX idx_embeddings_hnsw
  ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Active-only filter index — dùng trong mọi RAG query
CREATE INDEX idx_embeddings_active
  ON embeddings (source_type, is_active)
  WHERE is_active = TRUE;

-- Lookup by source_id — dùng cho deactivate/rebuild
CREATE INDEX idx_embeddings_source
  ON embeddings (source_id, source_type);
```

---

## 9. Database Migration & Seeding

Hệ thống migration/seeding tùy chỉnh sử dụng NestJS Standalone Application Context (không cần khởi động HTTP server).

### 9.1 Commands

```bash
# Chạy tất cả pending migrations
npm run db:migrate

# Seed dữ liệu mẫu (idempotent — chạy nhiều lần không bị trùng)
npm run db:seed

# Xem thống kê dữ liệu hiện tại trong DB
npm run db:verify
```

### 9.2 Tạo Migration mới

Tạo file trong `src/db/migrations/` với prefix timestamp:

```typescript
// src/db/migrations/1717500000000-add-pet-xp-index.ts
import * as mongoose from 'mongoose';

export default {
  name: '1717500000000-add-pet-xp-index',

  async up(connection: mongoose.Connection): Promise<void> {
    const db = connection.db;
    if (db) {
      await db.collection('pet_states').createIndex({ xp: -1 });
    }
  },

  async down(connection: mongoose.Connection): Promise<void> {
    const db = connection.db;
    if (db) {
      await db.collection('pet_states').dropIndex('xp_-1');
    }
  }
};
```

### 9.3 Seed Data mặc định

| Account | Email | Password | Role |
|---|---|---|---|
| Admin | `admin@farmy.com` | `Admin@1234` | admin |
| User test | `user@farmy.com` | `User@1234` | user |

---

## 10. Cloudflare R2 Storage

Backend sử dụng `R2StorageService` (AWS SDK S3-compatible) để upload/xóa ảnh và tạo pre-signed URLs.

### 10.1 Sử dụng R2StorageService

```typescript
import { R2StorageService } from '../storage/r2-storage.service';

// Upload ảnh
const key = `diary/photos/${userId}/${Date.now()}-photo.jpg`;
const fileKey = await this.r2StorageService.uploadFile(buffer, key, 'image/jpeg');

// Tạo signed URL (TTL 1 giờ)
const signedUrl = await this.r2StorageService.getSignedUrl(fileKey, 3600);

// Xóa ảnh
await this.r2StorageService.deleteFile(fileKey);
```

### 10.2 Import vào Module khác

```typescript
@Module({
  imports: [StorageModule], // Import StorageModule để dùng R2StorageService
  ...
})
export class FarmModule {}
```

### 10.3 Quy tắc bảo mật Upload

- **File size:** Tối đa 5MB
- **Định dạng:** Chỉ JPEG, PNG, WebP
- **Magic bytes:** Verify binary header bằng `file-type` (tránh bypass Content-Type)
- **Private bucket:** Không dùng public URL — luôn dùng pre-signed URL (TTL 1h)
- **Safe filename:** `{userId}/{Date.now()}-{randomUUID()}.{ext}` — tránh path traversal

---

## 11. Authentication & Security

### 11.1 JWT Flow

```
1. Login → accessToken (15 phút, JSON body) + refreshToken (30 ngày, HttpOnly Cookie)
2. Client gửi Bearer Token trong mọi request
3. Token hết hạn (401 AUTH_TOKEN_EXPIRED) → client gọi POST /auth/refresh
4. Refresh Token rotate: token cũ bị revoke, token mới được cấp
5. Logout → Refresh Token bị revoke, cookie bị xóa
```

### 11.2 NestJS Guards & Decorators

```typescript
// Bảo vệ endpoint — mặc định JwtAuthGuard áp dụng toàn app
// Dùng @Public() để bypass
@Public()
@Post('register')
register() { ... }

// RBAC — chỉ admin mới truy cập
@Roles('admin')
@Delete(':id')
remove() { ... }

// Lấy user hiện tại trong controller
@Get('me')
getProfile(@CurrentUser() user: JwtPayload) {
  return user;
}
```

### 11.3 Token Theft Detection

Hệ thống tự động phát hiện token bị đánh cắp thông qua cơ chế **Refresh Token Family**:
- Mỗi lần refresh, token cũ được đánh dấu `replacedBy = newTokenId`
- Nếu token cũ (đã revoked) được dùng lại → toàn bộ tokens cùng `familyId` bị thu hồi
- User bị force logout trên tất cả thiết bị trong cùng family

### 11.4 CORS Configuration

```
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

Cấu hình trong `.env`. Production cần cập nhật đúng domain FE.

---

## 12. BullMQ: Queue & Background Jobs

### 12.1 Queues

| Queue | Mục đích | Priority | Concurrency |
|---|---|---|---|
| `llm_queue` | AI Chat + Plant Scan calls | High (1-2) | 1 worker |
| `reminder_queue` | Gửi thông báo nhắc nhở | Medium (5) | 2 workers |
| `insight_queue` | Weekly insight generation | Low (10) | 2 workers |

### 12.2 Reminder Scheduler

- **Cron:** Chạy mỗi giờ, quét `reminders` collection tìm job `pending` có `scheduled_at <= now()`
- **Flow:** MongoDB → BullMQ → Worker → Web Push / Zalo ZNS / Email fallback
- **Retry:** Tối đa 3 lần, sau đó `status = 'failed'`

### 12.3 Weekly Insight (Cron Chủ nhật 6:00 AM)

Phân rải đều tải Gemini API bằng **Delay Spreading Algorithm**:

```
Delay(i) = i × (14400000ms / totalUsers)
```

Với 500 users → mỗi user cách nhau ~28.8s → toàn bộ trong 4 tiếng → dưới 10 RPM (an toàn Gemini free tier).

---

## 13. Testing

### 13.1 Unit Tests

```bash
# Chạy tất cả unit tests
npm run test

# Chạy với coverage report
npm run test:cov

# Watch mode
npm run test:watch
```

### 13.2 E2E Tests

```bash
npm run test:e2e
```

### 13.3 Test Coverage Targets

| Module | Checklist |
|---|---|
| **Auth** | TC-AUTH-01 đến TC-AUTH-09 (xem `auth_spec.md`) |
| **Core Features** | TC-CORE-01 đến TC-CORE-07 (xem `core_features_spec.md`) |
| **Storage** | R2StorageService: 8/8 tests pass |

---

## 14. Kiến trúc Tổng quan

```
                    ┌─────────────────────────┐
                    │   React Vite PWA Client  │
                    └───────────┬─────────────┘
                                │ HTTPS / JSON
                                ▼
                    ┌─────────────────────────┐
                    │  NestJS Backend (API)    │
                    │  ─────────────────────  │
                    │  JwtAuthGuard            │
                    │  RolesGuard              │
                    │  HttpExceptionFilter     │
                    │  ─────────────────────  │
                    │  AuthModule              │
                    │  FarmModule (Plots+Diary)│
                    │  PetModule               │
                    │  StorageModule (R2)      │
                    │  AI/LLM (WIP)            │
                    └──┬────────┬────────┬────┘
                       │        │        │
            ┌──────────┘   ┌────┘   ┌───┘
            ▼              ▼        ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────────────┐
    │ MongoDB Atlas│ │  Redis   │ │  Cloudflare R2   │
    │ (Primary DB) │ │ + BullMQ │ │  (Object Store)  │
    └──────────────┘ └──────────┘ └──────────────────┘
            │
    ┌───────▼───────┐
    │   pgvector    │
    │ (Search Index)│
    │ embeddings    │
    └───────────────┘
```

### Module phụ thuộc

| Module | Phụ thuộc | Phase |
|---|---|---|
| `AuthModule` | MongoDB (users, refresh_tokens) | Phase 1 ✅ |
| `FarmModule` | MongoDB (plots, diaries, logs), StorageModule | Phase 1 ✅ |
| `PetModule` | MongoDB (pet_states), FarmModule events | Phase 1 ✅ |
| `StorageModule` | Cloudflare R2 | Phase 1 ✅ |
| `ReminderModule` | BullMQ, NotificationModule | Phase 1 🔧 |
| `AIModule` | Gemini API, Redis rate limit | Phase 2 🔧 |
| `SnapModule` | R2, PetModule | Phase 2 📋 |
| `KnowledgeModule` | EmbeddingModule, pgvector | Phase 2 📋 |
| `PlantScanModule` | AIModule, R2, Redis (rate limit) | Phase 3 📋 |

> Legend: ✅ Done · 🔧 In Progress · 📋 Planned

---

## 📚 Tài liệu Bổ sung

| Tài liệu | Mô tả |
|---|---|
| [`BACKEND_CONTRACT.md`](./BACKEND_CONTRACT.md) | API contract đầy đủ cho Frontend team |
| [`R2_STORAGE_GUIDE.md`](./R2_STORAGE_GUIDE.md) | Hướng dẫn sử dụng Cloudflare R2 service |
| [`src/database_migrations_seeding_spec.md`](./src/database_migrations_seeding_spec.md) | Spec hệ thống migration & seeding |
| [`farmy-fe/openspec/specs/blueprint.md`](../farmy-fe/openspec/specs/blueprint.md) | Technical Blueprint v6.0 (source of truth) |
| [`farmy-fe/openspec/specs/architecture.md`](../farmy-fe/openspec/specs/architecture.md) | Core Architecture Design Document |
| [`farmy-fe/openspec/specs/auth_spec.md`](../farmy-fe/openspec/specs/auth_spec.md) | Auth & Authorization Specification |

---

## 🤝 Contributing

1. Tạo branch từ `main`: `git checkout -b feature/ten-tinh-nang`
2. Commit theo conventional commits: `feat: add plant scan endpoint`
3. Chạy `npm run lint` và `npm run test` trước khi push
4. Tạo PR với mô tả rõ ràng

---

*FarmDiaries AI — Giúp nông dân Việt Nam canh tác thông minh hơn 🌾*
