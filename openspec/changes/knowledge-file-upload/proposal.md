# OpenSpec Change Proposal
## E4 (v3): KnowledgeModule — Unified Admin Create Endpoint (JSON text / PDF / DOCX / JSON file)

| Thuộc tính     | Giá trị                                                            |
|----------------|--------------------------------------------------------------------|
| **Change ID**  | knowledge-file-upload                                              |
| **Version**    | v2.0 — Unified Create Endpoint                                     |
| **Branch**     | SCRUM-48                                                           |
| **Status**     | 🟡 Proposed — Awaiting Approval                                    |
| **Author**     | Antigravity Agentic Assistant                                      |
| **Created**    | 2026-06-23                                                         |
| **Updated**    | 2026-06-23 (v2 — gộp thành 1 endpoint duy nhất)                   |
| **Depends on** | `knowledge-module-admin` (E4 v2) — pipeline validation đã hoàn chỉnh |
| **Consistent** | `architecture.md` · `aifeature.md` §4 · `knowledge-module-admin/proposal.md` |

---

## 1. Background & Problem Statement

### 1.1 Vấn đề hiện tại

Admin chỉ có thể tạo bài viết qua **JSON body thuần túy**, bất tiện khi nội dung nằm trong file:
- **File PDF** từ FAO, IRRI, Bộ Nông nghiệp
- **File DOCX** từ nội bộ nhóm
- **File JSON** (batch import hoặc export từ hệ thống khác)

### 1.2 Quyết định thiết kế: 1 endpoint duy nhất

Thay vì tạo 2 endpoint riêng biệt (`POST /` cho JSON và `POST /upload` cho file),
hệ thống sẽ **nâng cấp** endpoint `POST /admin/knowledge` thành **unified endpoint** nhận `multipart/form-data`.

```
                 ┌─────────────────────────────────────────────┐
                 │      POST /api/v1/admin/knowledge            │
                 │      Content-Type: multipart/form-data       │
                 └──────────────────┬──────────────────────────┘
                                    │
                    ┌───────────────┼──────────────────┐
                    │               │                  │
              có file PDF      có file DOCX      có file .json
                    │               │                  │
              pdf-parse        mammoth            JSON.parse
              extract text     extract text       extract fields
                    │               │                  │
                    └───────────────┼──────────────────┘
                                    │
                              KHÔNG có file
                                    │
                              dùng field `content` (text)
                                    │
                                    ▼
                         KnowledgeService.create(...)
                         validation_status = "unvalidated"
```

**Lý do gộp 1 endpoint:**
- Giao diện Admin Frontend chỉ cần 1 form duy nhất
- Logic validation tập trung 1 chỗ
- Không gây nhầm lẫn về endpoint nào dùng cho trường hợp nào

---

## 2. Phạm vi Change (Scope)

| Trong scope | Ngoài scope |
|-------------|-------------|
| Nâng cấp `POST /admin/knowledge` → nhận `multipart/form-data` | OCR ảnh scan (PDF chỉ có ảnh) |
| Nhập text thủ công qua field `content` (thay JSON body cũ) | Upload PowerPoint (.pptx), Excel (.xlsx) |
| Upload PDF → auto extract text | Tự động phát hiện category từ nội dung |
| Upload DOCX → auto extract text | Antivirus scan file |
| Upload `.json` file → parse fields tự động | Hỗ trợ upload nhiều file cùng lúc |
| File lưu memory only (không ghi disk/R2) | Lưu file gốc lên R2/S3 |

---

## 3. Thiết kế Input — 4 cách tạo bài qua 1 endpoint

### Cách 1: Nhập text thủ công (thay thế JSON body cũ)

```
multipart/form-data
Fields:
  title    = "Kỹ thuật tưới nước cho lúa"
  content  = "Lúa cần mực nước từ 5–7cm..."   ← text trực tiếp
  category = "trồng trọt"
  (không có file)
```

### Cách 2: Upload file PDF

```
multipart/form-data
Fields:
  category = "trồng trọt"
  title    = "Kỹ thuật tưới lúa"  (optional — default = tên file)
File:
  file = ky-thuat-tuoi-lua.pdf
```
→ `pdf-parse` extract text → dùng làm `content`

### Cách 3: Upload file DOCX

```
multipart/form-data
Fields:
  category = "chăn nuôi"
File:
  file = huong-dan-chan-nuoi-ga.docx
```
→ `mammoth` extract plain text → dùng làm `content`

### Cách 4: Upload file JSON

```
multipart/form-data
File:
  file = bai-viet.json
```

Format file JSON:
```json
{
  "title": "Kỹ thuật trồng rau sạch",
  "content": "Nội dung đầy đủ bài viết...",
  "category": "rau màu",
  "source_url": "https://example.com"
}
```
→ System parse JSON file → extract tất cả fields trực tiếp, không cần form fields

---

## 4. Logic quyết định `content` và `title`

```
IF có file:
    IF file.mimetype === 'application/pdf'   → extract text bằng pdf-parse
    IF file.mimetype === 'application/vnd...docx' → extract text bằng mammoth
    IF file.mimetype === 'application/json'  → parse JSON → lấy title/content/category/source_url
    ELSE → throw 415 UnsupportedMediaType

ELSE (không có file):
    IF body.content có giá trị → dùng trực tiếp
    ELSE → throw 400 "Phải cung cấp file hoặc field `content`"

title = body.title ?? (tên file bỏ extension) ?? throw 400
category = body.category ?? (từ JSON file) ?? throw 400
```

---

## 5. Thư viện sử dụng

| Package | Phiên bản | Mục đích |
|---------|-----------|----------|
| `pdf-parse` | ^1.1.1 | Extract text từ PDF (multi-page, UTF-8 Tiếng Việt) |
| `mammoth` | ^1.8.0 | Convert DOCX → plain text (giữ cấu trúc đoạn) |
| `@types/multer` | ^1.4.x | TypeScript types (multer đã có sẵn trong deps) |

> `multer` đã được cài sẵn (`multer@2.1.1`) — chỉ cần cài thêm 2 thư viện parsing và types.

---

## 6. Giới hạn file

| Thuộc tính | Giá trị |
|------------|---------|
| Kích thước tối đa | **10MB** |
| Định dạng chấp nhận | `.pdf`, `.docx`, `.json` |
| MIME types hợp lệ | `application/pdf` · `application/vnd.openxmlformats-officedocument.wordprocessingml.document` · `application/json` |
| Lưu trữ | Memory only — không ghi ra disk hay R2 |
| Encoding | UTF-8 |

---

## 7. Files sẽ thay đổi

### 7.1 Files mới

```
src/modules/knowledge/
├── application/
│   ├── services/
│   │   └── [NEW] file-parser.service.ts    ← Extract text từ Buffer (PDF/DOCX/JSON)
│   └── dto/
│       └── [NEW] create-knowledge-unified.dto.ts  ← Validation cho unified form
```

#### `file-parser.service.ts` — skeleton

```typescript
export interface ParsedFileResult {
  title?: string;
  content: string;
  category?: string;
  source_url?: string;
  pageCount?: number;
  sourceFileType: 'pdf' | 'docx' | 'json';
}

@Injectable()
export class FileParserService {
  async parse(file: Express.Multer.File): Promise<ParsedFileResult> {
    const { mimetype, buffer, originalname } = file;

    if (mimetype === 'application/pdf') {
      return this.parsePdf(buffer, originalname);
    }
    if (mimetype.includes('wordprocessingml')) {
      return this.parseDocx(buffer, originalname);
    }
    if (mimetype === 'application/json') {
      return this.parseJson(buffer);
    }
    throw new UnsupportedMediaTypeException(
      'Chỉ hỗ trợ PDF, DOCX và JSON. File bạn upload không hợp lệ.',
    );
  }

  private async parsePdf(buffer: Buffer, filename: string): Promise<ParsedFileResult>
  private async parseDocx(buffer: Buffer, filename: string): Promise<ParsedFileResult>
  private parseJson(buffer: Buffer): ParsedFileResult
}
```

#### `create-knowledge-unified.dto.ts` — skeleton

```typescript
// Dùng cho multipart/form-data — tất cả fields đều optional ở dto level
// validation thực được xử lý trong controller logic (file XOR content)
export class CreateKnowledgeUnifiedDto {
  @IsOptional() @IsString() @MaxLength(255)
  title?: string;

  @IsOptional() @IsString()
  content?: string;       // Text trực tiếp — dùng khi không có file

  @IsOptional() @IsString()
  category?: string;      // Bắt buộc NẾU không upload JSON file

  @IsOptional() @IsUrl()
  source_url?: string;
}
```

### 7.2 Files sửa đổi

#### `admin-knowledge.controller.ts`

Endpoint `POST /` nâng cấp thành `multipart/form-data`, **xóa** JSON `@Body()` cũ:

```typescript
// POST /admin/knowledge  (UNIFIED — thay thế hoàn toàn endpoint cũ)
@Post()
@UseInterceptors(FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}))
@HttpCode(HttpStatus.CREATED)
async create(
  @UploadedFile() file: Express.Multer.File | undefined,
  @Body() dto: CreateKnowledgeUnifiedDto,
)
```

#### `knowledge.module.ts`

Thêm `FileParserService` vào providers.

---

## 8. API Contract (Unified)

```
POST /api/v1/admin/knowledge
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data
```

### Form Fields

| Field | Kiểu | Bắt buộc | Ghi chú |
|-------|------|----------|---------|
| `file` | File | ❌* | PDF / DOCX / .json — max 10MB |
| `content` | string | ❌* | Text trực tiếp (nếu không có file) |
| `category` | string | ❌** | Bắt buộc nếu file không phải JSON |
| `title` | string | ❌ | Default: tên file bỏ extension |
| `source_url` | string | ❌ | URL nguồn tài liệu |

> *`file` hoặc `content` phải có ít nhất 1 cái
> **`category` bắt buộc trừ khi upload file JSON (đã có category trong file)

### Response 201

```json
{
  "success": true,
  "message": "Đã tạo bài viết từ file PDF (4521 ký tự). Sẵn sàng để validation.",
  "data": {
    "_id": "uuid",
    "title": "ky-thuat-tuoi-lua",
    "category": "trồng trọt",
    "validation_status": "unvalidated",
    "embed_status": "pending",
    "language": "unknown",
    "metadata": {
      "source_file_type": "pdf",      // "pdf" | "docx" | "json" | "text"
      "source_file_name": "ky-thuat-tuoi-lua.pdf",
      "extracted_chars": 4521,
      "page_count": 12                // chỉ có với PDF
    },
    "created_at": "2026-06-23T01:00:00Z"
  }
}
```

### Bảng lỗi

| HTTP | Tình huống |
|------|-----------|
| `400` | Không có file và không có `content` |
| `400` | Không có `category` (khi file không phải JSON) |
| `413` | File vượt 10MB |
| `415` | Định dạng file không được hỗ trợ |
| `422` | PDF là ảnh scan (không có text layer) |
| `422` | DOCX bị hỏng / PDF có mật khẩu |
| `422` | JSON file thiếu field `content` hoặc `category` |

---

## 9. Pipeline sau khi tạo (không thay đổi)

```
POST /admin/knowledge          → tạo doc (unvalidated)   ← UNIFIED endpoint
         ↓
GET  /admin/knowledge/:id      → xem nội dung đã extract
         ↓
POST /admin/knowledge/:id/validate   → Gemini chấm điểm
         ↓
POST /admin/knowledge/:id/confirm    → Admin duyệt
         ↓
POST /admin/knowledge/batch-embed    → embed vào pgvector
```

---

## 10. Xử lý Edge Cases

| Tình huống | Xử lý |
|------------|-------|
| Vừa có `file` vừa có `content` | Ưu tiên `file`, bỏ qua `content` |
| PDF nhiều cột phức tạp | pdf-parse vẫn extract text, layout không hoàn hảo nhưng đủ dùng |
| DOCX có ảnh inline | mammoth bỏ qua ảnh, chỉ lấy text |
| JSON file thiếu trường `content` | 422 "JSON file phải có trường `content`" |
| PDF mật khẩu bảo vệ | 422 "PDF được bảo vệ bằng mật khẩu" |
| Content > 500,000 ký tự | Truncate + warning trong metadata |
| File .json nhưng không đúng format | 422 "JSON không hợp lệ" |
| Tên file UTF-8 (Tiếng Việt) | Encode đúng, dùng nguyên làm title |

---

## 11. Bảo mật

| Rủi ro | Biện pháp |
|--------|-----------|
| Upload file độc hại | Chỉ nhận qua JWT Admin token |
| MIME type giả mạo | Kiểm tra cả `mimetype` lẫn extension |
| File size DoS | Hard limit 10MB tại Multer layer |
| Path traversal | Memory storage — không ghi file ra disk |
| JSON injection qua file | Parse với `JSON.parse()`, không `eval()` |

---

## 12. Kế hoạch Triển khai

| Bước | Task | Ước tính |
|------|------|----------|
| 1 | Cài `pdf-parse`, `mammoth`, `@types/multer` | 5 phút |
| 2 | Tạo `FileParserService` (PDF + DOCX + JSON) | 40 phút |
| 3 | Tạo `CreateKnowledgeUnifiedDto` | 10 phút |
| 4 | Nâng cấp `POST /` controller → multipart | 20 phút |
| 5 | Update `knowledge.module.ts` | 5 phút |
| 6 | Test Postman: 4 cách tạo bài | 20 phút |
| **Total** | | **~100 phút** |

---

## 13. Checklist hoàn thành

- [ ] Cài `pdf-parse`, `mammoth`, `@types/multer`
- [ ] `FileParserService.parsePdf()` — extract UTF-8, throw nếu không có text
- [ ] `FileParserService.parseDocx()` — extract plain text
- [ ] `FileParserService.parseJson()` — parse + validate các trường bắt buộc
- [ ] Controller `POST /`: nhận file optional + content optional
- [ ] Logic: `file` XOR `content` (phải có ít nhất 1)
- [ ] `category` required khi file không phải JSON
- [ ] `title` mặc định = tên file nếu không nhập
- [ ] `metadata` lưu `source_file_type`, `extracted_chars`, `page_count`
- [ ] Test: nhập text thủ công ✅
- [ ] Test: upload PDF ✅
- [ ] Test: upload DOCX ✅
- [ ] Test: upload JSON file ✅
- [ ] Test: PDF scan → 422 ✅
- [ ] Test: file > 10MB → 413 ✅
- [ ] Test: file .exe → 415 ✅
- [ ] Pipeline validate → confirm → embed vẫn hoạt động bình thường ✅

---

*Spec v2.0 — Antigravity Agentic Assistant — 2026-06-23*
