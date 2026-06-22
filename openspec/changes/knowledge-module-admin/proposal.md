# OpenSpec Change Proposal
## E4 (v2): KnowledgeModule — AI Content Validation + Admin Confirm Workflow

| Thuộc tính     | Giá trị                                                   |
|----------------|-----------------------------------------------------------|
| **Change ID**  | knowledge-module-admin                                     |
| **Version**    | v2.0 — AI Validation + Admin Confirmation                 |
| **Branch**     | feat/KnowledgeModule-Admin-CRUD-Batch-Embed               |
| **Status**     | 🟡 Proposed — Awaiting Approval                           |
| **Author**     | Antigravity Agentic Assistant                             |
| **Created**    | 2026-06-22                                                |
| **Updated**    | 2026-06-22 (v2 — thêm Content Validation Workflow)        |
| **Consistent** | `aifeature.md` §4 & §11 · `architecture.md` · `ai_chat_spec.md` |

---

## 1. Background & Problem Statement

### 1.1 Vấn đề v1 (đã giải quyết)
Hệ thống FarmDiaries AI hỗ trợ tính năng tư vấn nông nghiệp thông minh qua RAG. v1 đã cung cấp Admin CRUD API cơ bản và pipeline embedding BullMQ.

### 1.2 Vấn đề mới phát sinh (lý do v2)

**Admin không có chuyên môn nông nghiệp** để thẩm định nội dung. Nếu Admin upload bài viết:
- Không liên quan nông nghiệp (ẩm thực, thời trang...)
- Chứa thông tin sai lệch (liều thuốc sai, kỹ thuật lỗi thời)
- Sai category (bài về chăn nuôi nhưng gắn category "trồng trọt")

→ AI chat sẽ **trả lời sai** cho nông dân dựa trên RAG context kém chất lượng.

### 1.3 Giải pháp — Mức C: AI Validation + Admin Confirmation

```
Admin upload bài
     ↓
[AUTO] Gemini đánh giá chất lượng nội dung
     ↓
Tạo báo cáo validation (điểm, cảnh báo, lý do)
     ↓
[MANUAL] Admin đọc báo cáo → XÁC NHẬN hoặc TỪ CHỐI
     ↓
Chỉ bài đã confirmed mới được batch-embed vào pgvector
```

---

## 2. Phạm vi Change (Scope)

| Trong scope (v2) | Ngoài scope |
|---|---|
| AI Validation endpoint (Gemini) | Giao diện Admin Frontend |
| Admin Confirmation endpoint | Tự động xác nhận không cần người |
| Hỗ trợ nội dung Tiếng Việt + Tiếng Anh | Dịch thuật nội dung sang ngôn ngữ khác |
| Trạng thái validation trong MongoDB | Workflow duyệt đa cấp (multi-level approval) |
| Chặn batch-embed bài chưa confirmed | Tự động reject hoàn toàn không cần admin |
| System prompt ChatBox trả lời Tiếng Việt | Tính năng ChatBox đa ngôn ngữ |

---

## 3. Thiết kế Workflow Mới

### 3.1 Vòng đời tài liệu (Document Lifecycle)

```
                    ┌─────────────────────────────────────┐
                    │         ADMIN UPLOAD NỘI DUNG        │
                    └──────────────────┬──────────────────┘
                                       │
                          status: "unvalidated"
                                       │
                    ┌──────────────────▼──────────────────┐
                    │   POST /admin/knowledge/:id/validate  │
                    │   [AUTO] Gemini phân tích nội dung   │
                    └──────────────────┬──────────────────┘
                                       │
                          status: "validating"
                                       │
               ┌───────────────────────┼───────────────────────┐
               │                       │                       │
           PASS (score ≥ 60)      WARN (40–59)          FAIL (< 40)
               │                       │                       │
    status: "validated"     status: "validated"      status: "rejected"
    (green, no warnings)    (yellow, có cảnh báo)    (red, lý do cụ thể)
               │                       │
               └───────────┬───────────┘
                            │
             [MANUAL] Admin đọc báo cáo
                            │
               ┌────────────┴────────────┐
               │                         │
          CONFIRM                      REJECT
               │                         │
   status: "confirmed"         status: "rejected"
               │
    POST /admin/knowledge/batch-embed
    (chỉ embed bài "confirmed")
               │
    status: "processing" → "done"
```

### 3.2 Bảng trạng thái

| Status | Mô tả | Ai set |
|--------|-------|--------|
| `unvalidated` | Mới upload, chưa qua validation | System (khi create) |
| `validating` | Đang gọi Gemini để phân tích | System (khi trigger validate) |
| `validated` | Gemini đã đánh giá (có thể có cảnh báo) | System (sau khi Gemini trả về) |
| `rejected` | Gemini reject hoặc Admin từ chối | System / Admin |
| `confirmed` | Admin đã xác nhận → sẵn sàng embed | Admin |
| `processing` | Đang embed vào pgvector qua BullMQ | System |
| `done` | Vector đã lưu xong vào pgvector | System |
| `error` | Job embedding thất bại | System |

---

## 4. Hỗ trợ Đa Ngôn Ngữ (VI + EN)

### 4.1 Lý do chấp nhận cả Tiếng Anh

Nguồn tài liệu nông nghiệp uy tín quốc tế (FAO, IRRI, CGIAR) chủ yếu bằng Tiếng Anh. Gemini `text-embedding-004` tạo vector **ngôn ngữ-độc-lập** — vector của câu Tiếng Việt và câu Tiếng Anh cùng nghĩa sẽ gần nhau trong không gian vector.

```
Bài viết EN: "Rice needs 5-7 cm water depth..."
      ↓ text-embedding-004
   vector(768)  ← ngôn ngữ-độc-lập
      ↓ RAG tìm thấy khi user hỏi bằng TV
User hỏi: "Lúa cần mực nước bao nhiêu?"
      ↓ Gemini đọc context EN + System Prompt "Trả lời TV"
AI trả lời: "Lúa cần mực nước từ 5–7 cm..." ✅
```

### 4.2 Ngôn ngữ hợp lệ

| Ngôn ngữ | Chấp nhận | Ghi chú |
|---------|-----------|---------|
| Tiếng Việt (`vi`) | ✅ | Ưu tiên |
| Tiếng Anh (`en`) | ✅ | Tài liệu quốc tế |
| Ngôn ngữ khác | ❌ | Validation tự động reject |

### 4.3 System Prompt ChatBox (bổ sung)

```
NGÔN NGỮ: LUÔN LUÔN trả lời bằng Tiếng Việt, bất kể ngôn ngữ
của tài liệu context. Nếu context bằng Tiếng Anh, hãy dịch
và trình bày lại bằng Tiếng Việt tự nhiên, phù hợp với
nông dân Việt Nam.
```

---

## 5. Contract Specification (API v2)

Tất cả API bảo vệ bởi JWT + `@Roles('admin')`.

### 5.1 CRUD cơ bản (giữ nguyên từ v1)

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `POST` | `/api/v1/admin/knowledge` | Tạo bài viết mới |
| `GET` | `/api/v1/admin/knowledge` | Danh sách (có filter status/category) |
| `GET` | `/api/v1/admin/knowledge/:id` | Chi tiết 1 bài |
| `PATCH` | `/api/v1/admin/knowledge/:id` | Cập nhật (reset về unvalidated) |
| `DELETE` | `/api/v1/admin/knowledge/:id` | Xóa bài + deactivate vectors |

### 5.2 API mới (v2)

#### POST `/api/v1/admin/knowledge/:id/validate`
Trigger AI validation cho 1 bài viết.

**Response 202 Accepted:**
```json
{
  "success": true,
  "message": "Đang phân tích nội dung...",
  "data": {
    "_id": "uuid",
    "validation_status": "validating"
  }
}
```

**Response sau khi Gemini trả về (webhook hoặc polling):**
```json
{
  "success": true,
  "data": {
    "_id": "uuid",
    "validation_status": "validated",
    "language": "vi",
    "validation_report": {
      "score": 85,
      "is_agriculture_related": true,
      "language_detected": "vi",
      "category_match": true,
      "warnings": [],
      "rejection_reason": null,
      "checked_at": "2026-06-22T14:00:00Z"
    }
  }
}
```

**Ví dụ bài bị cảnh báo (score 52):**
```json
{
  "data": {
    "validation_status": "validated",
    "validation_report": {
      "score": 52,
      "is_agriculture_related": true,
      "language_detected": "vi",
      "category_match": false,
      "warnings": [
        "Category 'trồng trọt' không khớp với nội dung (phát hiện: chăn nuôi)",
        "Đề cập đến loại thuốc cần kiểm tra tên khoa học"
      ],
      "rejection_reason": null
    }
  }
}
```

**Ví dụ bài bị reject (score 18):**
```json
{
  "data": {
    "validation_status": "rejected",
    "validation_report": {
      "score": 18,
      "is_agriculture_related": false,
      "language_detected": "en",
      "warnings": [],
      "rejection_reason": "Nội dung không liên quan đến nông nghiệp. Phát hiện chủ đề: ẩm thực/nấu ăn."
    }
  }
}
```

---

#### POST `/api/v1/admin/knowledge/:id/confirm`
Admin xác nhận sau khi đọc báo cáo validation.

**Request Body:**
```json
{
  "action": "confirm" | "reject",
  "note": "Nội dung tốt, đã kiểm tra tay"  // optional
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "_id": "uuid",
    "validation_status": "confirmed"
  }
}
```

---

#### POST `/api/v1/admin/knowledge/batch-embed`
Chỉ embed bài có `validation_status: "confirmed"`.

**Request Body:**
```json
{
  "ids": ["uuid1", "uuid2"]  // optional, bỏ trống = tất cả confirmed
}
```

**Response 202:**
```json
{
  "success": true,
  "message": "2 document(s) queued for embedding.",
  "data": {
    "queued": 2,
    "skipped_unconfirmed": 1
  }
}
```

---

## 6. Cập nhật MongoDB Schema

```typescript
// knowledge-source.schema.ts (v2)
@Schema({ timestamps: {...}, collection: 'knowledge_sources' })
export class KnowledgeSourceDocument extends Document<string> {
  _id: string;           // UUID
  title: string;
  content: string;
  category: string;
  source_url?: string;
  language: 'vi' | 'en'; // MỚI — ngôn ngữ phát hiện tự động

  // Trạng thái trong pipeline
  embed_status: 'pending' | 'processing' | 'done' | 'error';

  // MỚI — Trạng thái validation
  validation_status:
    | 'unvalidated'
    | 'validating'
    | 'validated'
    | 'rejected'
    | 'confirmed';

  // MỚI — Báo cáo từ Gemini
  validation_report?: {
    score: number;              // 0–100
    is_agriculture_related: boolean;
    language_detected: string;
    category_match: boolean;
    warnings: string[];
    rejection_reason: string | null;
    checked_at: Date;
  };

  // MỚI — Ghi chú của Admin khi confirm/reject
  admin_note?: string;

  metadata: Record<string, any>;
}
```

---

## 7. Tiêu chí Validation của Gemini (Prompt)

Gemini sẽ đánh giá bài viết theo thang điểm 0–100:

| Tiêu chí | Điểm tối đa | Mô tả |
|---------|------------|-------|
| Liên quan nông nghiệp | 40 | Chủ đề có thuộc lĩnh vực nông nghiệp, chăn nuôi, thủy sản? |
| Ngôn ngữ hợp lệ (VI/EN) | 20 | Bài viết bằng TV hoặc EN? |
| Category khớp nội dung | 20 | Category admin gán có phù hợp nội dung? |
| Không có thông tin nguy hiểm | 20 | Không có khuyến cáo thuốc cấm, liều lượng sai? |

| Tổng điểm | Kết quả | Màu hiển thị |
|-----------|---------|--------------|
| ≥ 80 | `validated` (không cảnh báo) | 🟢 Xanh |
| 60–79 | `validated` (có cảnh báo) | 🟡 Vàng |
| 40–59 | `validated` (cảnh báo nghiêm trọng) | 🟠 Cam |
| < 40 | `rejected` tự động | 🔴 Đỏ |

> **Lưu ý:** Dù `validated`, Admin vẫn phải confirm thủ công trước khi embed.

---

## 8. Risk & Mitigations (cập nhật)

| Rủi ro | Mức độ | Biện pháp |
|--------|--------|-----------|
| Gemini validation tốn token | Thấp | Chỉ validate 1 lần; nếu content thay đổi mới validate lại |
| Admin bỏ qua cảnh báo và vẫn confirm | Chấp nhận được | Log lại `admin_note` + `validation_report` để audit |
| Gemini đánh giá sai (false negative) | Trung bình | Admin là lớp kiểm tra cuối — không thể embed nếu chưa confirm |
| Latency Gemini validation chậm | Thấp | Chạy async (BullMQ job riêng), trả về 202 ngay |
| Bài EN không được AI tìm kiếm đúng | Thấp | Gemini embedding là multilingual — vector gần nhau dù khác ngôn ngữ |

---

*Spec v2 updated by Antigravity Agentic Assistant — 2026-06-22*
