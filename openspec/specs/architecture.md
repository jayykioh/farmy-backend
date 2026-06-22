# FarmDiaries AI — Core Architecture Design Document (ADD)
### System Design · MongoDB Primary · pgvector Search Index · AI Pipeline · Security Blueprint

| Thuộc tính | Giá trị |
|---|---|
| **Dự án** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tài liệu** | Core Architecture Design Document (ADD) |
| **Phiên bản** | v2.0 (MongoDB-primary · pgvector search index) |
| **Tác giả** | Team 4 - Antigravity Agentic Assistant |
| **Trạng thái** | Active · specs folder |

---

> **Architecture Decision:** MongoDB is the **primary database** for ALL application data. pgvector (PostgreSQL extension) is used **ONLY as a vector search index** — it stores `(embedding, source_id, source_type, minimal metadata)` and nothing else. No business data lives in pgvector. See `openspec/specs/embedding_spec.md` for full RAG architecture.

## 1. Bản đồ tổng quan Kiến trúc Hệ thống (System Architecture)

Hệ thống tuân thủ mô hình **Decoupled Modern Web PWA / Hybrid Cloud**, kết nối thông qua RESTful API tốc độ cao viết trên NestJS. Dưới đây là sơ đồ luồng dữ liệu và tương tác giữa các thành phần:

```mermaid
graph TD
    %% Clients
    subgraph Client_Layer [PWA & Client Layer]
        PWA[React Vite PWA Client]
        ZaloApp[Zalo Chat Client / Webview]
    end

    %% API Gateway & Backend
    subgraph Backend_App [NestJS Backend Engine]
        API_GW[NestJS Gateway / Controller Router]
        Auth_G[JwtAuthGuard / Supabase Auth Verifier]
        
        subgraph Core_Modules [Core Business Modules]
            Diary[DiaryModule]
            Chat[ChatModule]
            Plant[PlantScanModule]
            Pet[PetModule]
            Reminder[ReminderModule]
            Insight[InsightModule]
        end
        
        subgraph AI_Engine [AI & RAG Engine]
            LLM[LLMModule - Gemini Agent]
            RAG[RAGModule - Vector Query]
            Embed[EmbeddingModule - Vector Generator]
        end
    end

    %% Database & Cache
    subgraph Data_Storage [Database & Storage Layer]
        MongoDB[(MongoDB Atlas - PRIMARY DB)]
        PGVector[(pgvector - Vector Search Index ONLY)]
        Redis[(Redis - Rate Limiting & Queue Cache)]
        BullMQ[BullMQ - Distributed Scheduler]
        R2[Cloudflare R2 Object Storage]
    end

    %% External Services
    subgraph External_Services [External Cloud APIs]
        SupaAuth[Supabase Auth Service]
        GeminiAPI[Google Gemini Flash & Vision API]
        ZaloAPI[Zalo OA ZNS Gateway]
    end

    %% Connections
    PWA -->|HTTPS / JSON| API_GW
    ZaloApp -->|Webhook / OAuth| API_GW
    API_GW --> Auth_G
    Auth_G -->|Verify JWT| SupaAuth
    
    %% Module routes
    Auth_G --> Core_Modules
    Diary -->|Upload Images| R2
    Plant -->|Laplacian Blur Check & Upload| R2
    
    %% AI Interactions
    Chat --> RAG
    RAG -->|1. ANN search - returns IDs only| PGVector
    RAG -->|2. Fetch full docs by ID| MongoDB
    RAG --> Embed
    Embed -->|text-embedding-004| GeminiAPI
    Embed -->|Write embedding + source_id| PGVector
    Chat --> LLM
    LLM -->|Redis Counter Check| Redis
    LLM -->|Gemini Flash API| GeminiAPI
    
    %% Queue & Scheduler
    Reminder -->|Push job| BullMQ
    Insight -->|Spread cron jobs| BullMQ
    BullMQ -->|Broker| Redis
    BullMQ -->|Execute job| Core_Modules
    
    %% ALL business data → MongoDB (primary DB)
    Core_Modules -->|All CRUD - users/diary/chat/pet/reminders| MongoDB
    
    %% Notification Output
    Reminder -->|Send ZNS| ZaloAPI
```

---

## 2. Request Lifecycle & Trình tự xử lý chính (Sequence Diagrams)

### 2.1 Luồng Xác thực & Quay vòng Access/Refresh Token (JWT Cookie Rotation)
Hệ thống sử dụng **Supabase Auth** để quản lý Identity, nhưng tự xoay vòng JWT thông qua HTTP-Only Cookie nhằm đảm bảo tính an toàn tối đa cho môi trường Web/PWA:

```mermaid
sequenceDiagram
    autonumber
    actor User as Nông dân (Client)
    participant Nest as NestJS Backend (AuthModule)
    participant Supa as Supabase Auth Service
    participant DB as PostgreSQL (refresh_tokens)

    User->>Nest: POST /auth/login (Credentials / OIDC Token)
    Nest->>Supa: Verify user credentials
    Supa-->>Nest: OK (User Info, Auth Tokens)
    
    rect rgb(240, 248, 255)
        Note over Nest: Tạo Access Token (15m, payload signed)
        Note over Nest: Tạo Refresh Token mã hóa mạnh (30 ngày)
    end
    
    Nest->>DB: Lưu hash(Refresh Token) + Device Info + Expires
    Nest-->>User: Trả Access Token trong JSON & set HTTP-Only, Secure, SameSite=Strict Cookie cho Refresh Token
    
    Note over User, Nest: Access Token hết hạn (sau 15 phút)
    
    User->>Nest: Request API bất kỳ mang Access Token (Expired)
    Nest-->>User: Trả lỗi 401 + errorCode: AUTH_TOKEN_EXPIRED
    
    User->>Nest: POST /auth/refresh (Gửi HTTP-Only Refresh Token tự động)
    Nest->>DB: Truy vấn & verify hash(Refresh Token) còn hạn & chưa revoke
    
    alt Refresh Token hợp lệ
        DB-->>Nest: OK
        Nest->>Nest: Tạo Access Token mới
        Nest-->>User: Trả Access Token mới
    else Refresh Token bị thu hồi / hết hạn
        DB-->>Nest: Token Invalid / Revoked
        Nest->>DB: Đánh dấu Revoked tất cả token liên quan (Token Theft Detection)
        Nest-->>User: Trả lỗi 401, xóa Cookie (Yêu cầu đăng nhập lại)
    end
```

---

### 2.2 Quy trình Quét bệnh cây trồng (Plant Scan Validation & Vision Pipeline)
Để tránh spam API và đảm bảo chất lượng chẩn đoán từ ảnh chụp của nông dân, hệ thống triển khai pipeline kiểm chuẩn hình ảnh vô cùng nghiêm ngặt:

```mermaid
sequenceDiagram
    autonumber
    actor User as Nông dân
    participant Gate as Rate Limiter (Redis)
    participant Nest as NestJS (PlantScanModule)
    participant Sharp as Sharp.js Image Processor
    participant R2 as Cloudflare R2 Store
    participant Gemini as Gemini Vision API
    participant Mongo as MongoDB Atlas (plant_scans)

    User->>Nest: POST /plant-scan/diagnose (File + Crop Type)
    Nest->>Gate: Check scan count: scan:limit:{userId}:{date}
    
    alt Đã đạt giới hạn ngày (3 scans với Free user)
        Gate-->>Nest: Rate Limit Exceeded
        Nest-->>User: Trả lỗi 429 (Bạn đã hết lượt quét miễn phí hôm nay 🌱)
    else Còn lượt quét
        Gate-->>Nest: Lượt quét hợp lệ
    end
    
    rect rgb(245, 245, 245)
        Note over Nest: Validate File Size (<= 5MB)
        Note over Nest: Validate Magic Bytes (Chỉ nhận JPG, PNG, WebP thật)
    end
    
    Nest->>Sharp: Đọc ảnh buffer & tính Laplacian Variance (Độ mờ/Blur)
    
    alt Laplacian Variance < 100 (Ảnh bị mờ)
        Sharp-->>Nest: Blur detected (Variance = X)
        Nest-->>User: Trả lỗi 422 (Ảnh bị mờ hoặc thiếu sáng, vui lòng chụp lại rõ nét hơn 📸)
    else Ảnh đạt độ nét (Variance >= 100)
        Sharp-->>Nest: Passed blur validation
    end

    Nest->>Sharp: Tính Perceptual Hash (pHash) của ảnh
    Nest->>Mongo: Truy vấn pHash trong vòng 7 ngày qua (Mức độ sai lệch Hamming Distance < 10)
    
    alt Phát hiện trùng khớp trong cache (pHash match)
        Mongo-->>Nest: Trả về kết quả chẩn đoán đã lưu
        Nest-->>User: Trả kết quả ngay lập tức (Không cần gọi Gemini - Tiết kiệm chi phí!)
    else Ảnh mới hoàn toàn
        Nest->>R2: Stream buffer lên Cloudflare R2 (Signed URL)
        R2-->>Nest: Trả về safe Key / Image URL
        Nest->>Gemini: Gọi Gemini Vision với custom System Prompt & Image Buffer
        Note over Gemini: Phân tích đốm lá, độ vàng, đề xuất thuốc điều trị (PHI warning)
        Gemini-->>Nest: Trả JSON Kết quả chẩn đoán bệnh
        Nest->>Mongo: Lưu bản ghi plant_scans mới (bao gồm pHash, chẩn đoán, imageUrl)
        Nest-->>User: Trả về Kết quả chẩn đoán bệnh chi tiết
    end
```

---

### 2.3 Luồng Trò chuyện RAG & Bảo vệ Quota (Gemini API Free-Tier Guard)
Cơ chế bảo vệ Quota miễn phí (15 RPM) của Gemini. RAG flow: embed query → pgvector search (returns IDs) → MongoDB fetch (full content) → assemble context → LLM.

```mermaid
sequenceDiagram
    autonumber
    actor User as Nông dân
    participant Nest as NestJS (ChatModule)
    participant Redis as Redis Quota Counter
    participant RAG as RAGModule
    participant Embed as EmbeddingModule
    participant PGVector as pgvector (Search Index)
    participant Mongo as MongoDB Atlas (PRIMARY DB)
    participant Bull as BullMQ Delay Queue
    participant Gemini as Gemini Flash API

    User->>Nest: Gửi tin nhắn chat ("Lúa bị rầy nâu phun gì?")
    Nest->>Redis: Increment & Get Counter "llm:rpm:limit" (TTL 60s)
    
    alt Counter > 14 (Chạm ngưỡng giới hạn)
        Nest->>Bull: Đưa request vào llm_queue (High priority)
        Bull-->>Nest: Enqueued (User nhận: "AI đang bận, sẽ trả lời sau giây lát...")
        Note over Nest, Bull: Chờ worker trống để xử lý tiếp
    else Counter <= 14 (Hoạt động bình thường)
        Redis-->>Nest: OK
    end

    Nest->>RAG: Truy vấn tài liệu bổ trợ (Context Retrieval)
    
    RAG->>Embed: Embed tin nhắn người dùng (text-embedding-004)
    Embed->>Gemini: Gọi API sinh vector 768 chiều
    Gemini-->>Embed: vector[768]
    
    RAG->>PGVector: ANN search — ORDER BY embedding <=> $queryVector LIMIT 10
    Note over PGVector: Chỉ trả về source_id, source_type, score (NO content)
    PGVector-->>RAG: [{ source_id, source_type, score }] — IDs only
    
    RAG->>Mongo: findByIds(diaryIds) + findByIds(knowledgeIds)
    Note over Mongo: MongoDB là nguồn nội dung thật — fetch full text
    Mongo-->>RAG: Full documents (notes, chunkText, metadata)
    
    RAG->>Nest: Kết hợp [System Prompt] + [User message] + [Context từ MongoDB]
    Nest->>Gemini: Gọi Gemini Flash sinh câu trả lời
    Gemini-->>Nest: Trả về text câu trả lời
    
    Nest->>Mongo: Lưu lượt chat vào chat_sessions (MongoDB)
    Nest-->>User: Trả về câu trả lời hướng dẫn chuẩn kỹ thuật nông nghiệp 🌱
```

---

## 3. Database Architecture — MongoDB Primary + pgvector Search Index

### 3.1 MongoDB Collections (Primary Database — Source of Truth)

All business data lives in MongoDB. See `openspec/specs/mongodb_stack_analysis.md` for the complete collection index plan.

| Collection | Stores | Key indexes |
|---|---|---|
| `users` | User profile, Zalo/push prefs, role, soft-delete | `email`, `zaloUserId` |
| `refresh_tokens` | Token hash, family lineage, expiry, device | `tokenHash` unique, `expiresAt` TTL |
| `diary_entries` | Crop log, notes, photos, weather, location, flags | `userId+createdAt`, `userId+cropType` |
| `pet_states` | Current mood, streak, last diary timestamp | `userId` unique |
| `pet_events` | Mood change history, milestones | `userId+createdAt` |
| `plant_scans` | Image metadata, pHash, AI diagnosis JSON | `userId+createdAt`, `pHash` |
| `chat_sessions` | Message array, citations, AI metadata, TTL 90d | `userId+updatedAt`, `sessionId` unique |
| `knowledge_chunks` | Technical content chunks, crop tags, quality score | `cropType+qualityScore`, vector search |
| `memory_embeddings` | (legacy name) — if using pure MongoDB RAG, store here | `userId+sourceId` |
| `reminders` | Scheduled jobs, status, retry, channel | `status+scheduledAt`, `userId` |
| `notification_subscriptions` | Push/Zalo/email destinations | `userId` |
| `notification_logs` | Delivery outcomes | `userId+createdAt` |
| `weekly_insights` | Generated insight, delivery state, user feedback | `userId+weekStartDate` |
| `audit_logs` | Compliance records (append-only) | `userId+createdAt`, `action+createdAt` |
| `user_events` | Product analytics events, TTL 30d | `userId+createdAt`, `eventType` |
| `farm_snaps` | Photo share, condition, reactions, XP | `userId+createdAt`, `isPublic+createdAt` |
| `ai_feedback` | Chat ratings, A/B test data | `userId+createdAt` |

### 3.2 pgvector — Search Index Only

pgvector hosts **one table only**: `embeddings(id, source_id, source_type, embedding vector(768), metadata jsonb, is_active bool, created_at)`.

No business data lives here. See `openspec/specs/embedding_spec.md` for the full schema and RAG flow.

```mermaid
erDiagram
    EMBEDDINGS {
        uuid id PK
        text source_id "MongoDB ObjectId as string"
        text source_type "diary_entry or knowledge_chunk"
        vector embedding "768-dim — text-embedding-004"
        jsonb metadata "cropType, userId, chunkIndex — minimal only"
        boolean is_active "false = soft-deactivated, awaiting cleanup"
        timestamptz created_at
    }
```

> <!-- REVIEWER FLAG: pgvector must NOT contain users, diary_entries, pet_state, reminders, or any other business entity. Only the `embeddings` table is permitted. -->

---

### 3.3 MongoDB Document Examples

Tách biệt các dạng dữ liệu tần suất ghi cực cao, schema linh động và có thể lưu trữ ngắn hạn:

#### 1. Collection `ai_chats` (Lưu lịch sử hội thoại có TTL 90 ngày)
*   **Mục đích:** Lưu tin nhắn dạng mảng lồng nhau, phục vụ giao diện chat dạng thread/session.
*   **Index đề xuất:**
    *   `{ userId: 1, createdAt: -1 }` (Hiển thị danh sách hội thoại của người dùng)
    *   `{ sessionId: 1 }` (Độc nhất, phục vụ lấy chi tiết cuộc hội thoại)
    *   `{ createdAt: 1 }` với thuộc tính `expireAfterSeconds: 7776000` (Tự động xóa tin nhắn cũ sau 90 ngày để tránh làm phình to đĩa).

#### 2. Collection `user_events` (Nhật ký hành vi nông dân với TTL 30 ngày)
*   **Mục đích:** Thu thập dữ liệu phục vụ nghiên cứu hành vi nông dân và cải tiến sản phẩm.
*   **Index đề xuất:**
    *   `{ userId: 1, createdAt: -1 }`
    *   `{ eventType: 1, createdAt: -1 }`
    *   `{ createdAt: 1 }` với thuộc tính `expireAfterSeconds: 2592000` (Dọn dẹp tự động sau 30 ngày).

#### 3. Collection `plant_scans` (Bản ghi chi tiết lịch sử chẩn đoán hình ảnh)
*   **Mục đích:** Lưu trữ chi tiết các ca bệnh thực tế được quét từ camera.
*   **Index đề xuất:**
    *   `{ userId: 1, createdAt: -1 }` (Lịch sử quét của người dùng)
    *   `{ pHash: 1 }` (Truy vết ảnh trùng lặp để phục vụ bộ đệm cache kết quả 7 ngày).

---

## 4. Kiến trúc phân lớp Backend NestJS (Clean Layered Architecture)

Backend được thiết kế chặt chẽ theo tư tưởng **Hexagonal / Clean Architecture**, phân tách rõ ràng trách nhiệm từ ngoài vào trong:

```
+-------------------------------------------------------------------------+
|                              LAYER 1: GATEWAY                           |
|       (Controllers, WebSockets, Zalo Webhooks, PWA Subscriptions)       |
+------------------------------------+------------------------------------+
                                     |
                                     |  DTOs & HTTP Requests
                                     v
+-------------------------------------------------------------------------+
|                            LAYER 2: APPLICATION                         |
|     (Guards, Pipes, Interceptors, Validation, Exception Filters)       |
+------------------------------------+------------------------------------+
                                     |
                                     |  Validated Data & User Context
                                     v
+-------------------------------------------------------------------------+
|                              LAYER 3: DOMAIN                            |
|             (Business Services, Pet Mood Rules, RAG Prompts)            |
+------------------------------------+------------------------------------+
                                     |
                                     |  Repository Interfaces
                                     v
+-------------------------------------------------------------------------+
|                          LAYER 4: INFRASTRUCTURE                        |
|  (Mongoose MongoDB [primary], pgvector [search index], BullMQ, Redis,   |
|   Cloudflare R2, Gemini API)                                            |
+-------------------------------------------------------------------------+
```

### 4.1 Quy tắc Tổ chức Module Chuẩn
Mỗi module bên trong [src/modules](file:///d:/coding/farmdiary/project/backend/src/modules) bắt buộc phải tuân thủ phân rã file như sau:
1.  `dto/`: Nơi định nghĩa các đối tượng truyền dữ liệu (DTO) với thư viện `class-validator` để kiểm chuẩn payload đầu vào từ client.
2.  `entities/` hoặc `schemas/`: Thực thể TypeORM (cho Postgres) hoặc Schema Mongoose (cho MongoDB).
3.  `controllers/`: Nơi xử lý router HTTP, định nghĩa Swagger, áp dụng Guards phân quyền.
4.  `services/`: Nơi chứa toàn bộ nghiệp vụ cốt lõi (Business Logic), không trực tiếp phụ thuộc vào cơ chế truyền tải HTTP.
5.  `module.ts`: Khai báo import, export rõ ràng các Controller và Service.

---

## 5. Kế hoạch Phòng vệ & Mô hình An ninh (Security Threat Model)

Hệ thống đặt bảo mật làm mặc định để bảo vệ tối đa dữ liệu của nông dân và các tài nguyên Cloud giá trị:

### 5.1 Phòng chống bypass header (Magic Bytes Validation)
Kẻ tấn công có thể đổi đuôi file `.exe` hay `.sh` thành `.jpg` hòng tải mã độc lên R2. Hệ thống kiểm duyệt kép buffer ảnh:
1.  **Multer File Extension Filter:** Kiểm tra Mime-type khai báo bởi client.
2.  **Magic Bytes Verification:** Đọc nội dung nhị phân (Binary Header) của buffer ảnh bằng thư viện `file-type`. Chỉ cho phép luồng chạy tiếp nếu byte mở đầu tương thích với định dạng JPG, PNG hoặc WebP thực thụ.

### 5.2 Ràng buộc quyền truy cập Object Storage (Cloudflare R2)
*   **Private Bucket:** Toàn bộ ảnh nhật ký canh tác (`diary_entries.photo_urls`) và ảnh quét bệnh (`plant_scans.imageUrl`) được lưu trữ tại private bucket của Cloudflare R2.
*   **Pre-signed URLs:** Backend không trả về URL tĩnh của ảnh. Thay vào đó, backend sử dụng thư viện `@aws-sdk/s3-request-presigner` để sinh các URL ký độc quyền có **thời gian hết hạn ngắn (TTL = 1 giờ)**. Sau 1 giờ, các liên kết này hoàn toàn vô hiệu, ngăn chặn rò rỉ dữ liệu nông trại ra internet.

### 5.3 Ngăn ngừa Tấn công chiếm dụng phiên (Token Theft Detection)
Nếu kẻ tấn công đánh cắp được `Refresh Token` từ máy người dùng:
*   Mỗi khi một Refresh Token được sử dụng để lấy Access Token mới, backend tạo token mới và đặt `replaced_by = new_token.id` trên token cũ, sau đó đánh dấu token cũ là `revoked_at = now()`.
*   **Token Theft Detection Logic:** Nếu backend phát hiện một Refresh Token cũ (có `revoked_at IS NOT NULL` hoặc đã có `replaced_by`) đột ngột được gửi lại hệ thống, đây là dấu hiệu chắc chắn bị đánh cắp. Backend kích hoạt **Token Theft Alarm** thông qua `family_id`:
    ```sql
    -- Tìm và revoke toàn bộ token cùng lineage (cùng family_id)
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE family_id = :compromised_family_id
      AND revoked_at IS NULL;
    ```
*   Kết quả: Thu hồi ngay lập tức **toàn bộ các token cùng family** (không revoke token của các phiên khác), bắt buộc đăng nhập lại trên mọi thiết bị trong cùng chuỗi đó.

---

## 6. Giải thuật AI & Điều phối Chi phí (Cost Orchestration)

Vì dự án capstone ưu tiên sử dụng các gói miễn phí (Gemini API Free Tier), thuật toán phân phối tải thông minh được thiết lập nhằm tránh lỗi nghẽn dịch vụ `429 Too Many Requests`:

### 6.1 Giải thuật phân bổ tải Weekly Insight Cron (Chủ nhật 6:00 AM)
Nếu có $N$ người dùng hoạt động trong tuần, việc tạo báo cáo insight đồng thời sẽ gây nghẽn API ngay lập tức. Thuật toán phân bổ thời gian (Delay Spreading Algorithm) được áp dụng để rải đều tải trong vòng 4 tiếng (14,400 giây):

$$\text{Delay}_i = i \times \left( \frac{14400 \times 1000}{N} \right) \text{ miliseconds}$$

*Trong đó:*
*   $i$: Thứ tự của người dùng hoạt động trong mảng danh sách người dùng ($0 \le i < N$).
*   Công thức này giúp đảm bảo tần suất gọi API Gemini Flash luôn giữ ở mức an toàn dưới **10 RPM**, loại bỏ hoàn toàn khả năng chạm ngưỡng giới hạn của Free Tier (15 RPM).

### 6.2 Cấu hình Hàng đợi Phân cấp Ưu tiên (BullMQ Priority Queue)
Sử dụng BullMQ để phân tầng ưu tiên xử lý các request gọi LLM:

| Thứ hạng | Tác vụ | Ưu tiên (Priority) | Queue | Trải nghiệm người dùng |
|---|---|---|---|---|
| **1** | Trò chuyện trực tiếp (AI Chat) | 1 (High) | `llm_queue` | Xử lý ngay lập tức (< 3s) |
| **2** | Quét chẩn đoán bệnh (Plant Scan) | 2 (Medium) | `llm_queue` | Phản hồi trong vòng 5-10s |
| **3** | Nhắc nhở công việc (Reminder) | 5 (Low) | `reminder_queue` | Chấp nhận độ trễ vài phút |
| **4** | Tổng hợp insight tuần (Weekly Cron) | 10 (Lowest) | `insight_queue` | Chạy nền phân tán trong 4 giờ |

---

*Tài liệu Core Architecture Design Document này là Source of Truth cho quá trình lập trình logic chi tiết của nhóm. Hãy tuân thủ nghiêm ngặt các quy chuẩn thiết kế để đảm bảo sản phẩm Capstone đạt tiêu chuẩn cao nhất.* 🌱
