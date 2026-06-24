# Technical Design Document
## E4 (v2): KnowledgeModule — AI Content Validation + Admin Confirm Workflow

| Thuộc tính  | Giá trị                                              |
|-------------|------------------------------------------------------|
| **Version** | v2.0                                                 |
| **Updated** | 2026-06-22                                           |
| **Depends** | `LLMService` (Gemini), `BullMQ`, `MongooseModule`    |

---

## 1. Cơ sở dữ liệu: Supabase Postgres + pgvector Schema

*(Không thay đổi so với v1 — bảng `embeddings` giữ nguyên)*

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embeddings (
  id           BIGSERIAL PRIMARY KEY,
  source_id    TEXT        NOT NULL,
  source_type  TEXT        NOT NULL,
  chunk_index  INT         NOT NULL DEFAULT 0,
  text         TEXT        NOT NULL,
  content_hash TEXT,
  embedding    vector(768),
  metadata     JSONB       NOT NULL DEFAULT '{}',
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT embeddings_source_chunk_uq
    UNIQUE (source_id, source_type, chunk_index)
);

CREATE INDEX IF NOT EXISTS embeddings_hnsw_cosine_idx
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS embeddings_active_idx
  ON embeddings (is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS embeddings_source_id_idx
  ON embeddings (source_id);
```

---

## 2. MongoDB Schema (v2 — cập nhật)

```typescript
// knowledge-source.schema.ts
@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'knowledge_sources',
})
export class KnowledgeSourceDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  category: string;

  @Prop()
  source_url?: string;

  /** MỚI v2: ngôn ngữ phát hiện tự động bởi Gemini */
  @Prop({ type: String, enum: ['vi', 'en', 'unknown'], default: 'unknown' })
  language: 'vi' | 'en' | 'unknown';

  /** Trạng thái trong pipeline embedding */
  @Prop({
    type: String,
    enum: ['pending', 'processing', 'done', 'error'],
    default: 'pending',
  })
  embed_status: 'pending' | 'processing' | 'done' | 'error';

  /** MỚI v2: Trạng thái trong pipeline content validation */
  @Prop({
    type: String,
    enum: ['unvalidated', 'validating', 'validated', 'rejected', 'confirmed'],
    default: 'unvalidated',
  })
  validation_status:
    | 'unvalidated'
    | 'validating'
    | 'validated'
    | 'rejected'
    | 'confirmed';

  /** MỚI v2: Báo cáo chi tiết từ Gemini */
  @Prop({
    type: {
      score: Number,
      is_agriculture_related: Boolean,
      language_detected: String,
      category_match: Boolean,
      warnings: [String],
      rejection_reason: { type: String, default: null },
      checked_at: Date,
    },
  })
  validation_report?: {
    score: number;
    is_agriculture_related: boolean;
    language_detected: string;
    category_match: boolean;
    warnings: string[];
    rejection_reason: string | null;
    checked_at: Date;
  };

  /** MỚI v2: Ghi chú của Admin khi confirm/reject */
  @Prop()
  admin_note?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}
```

---

## 3. AI Validation Service

### 3.1 Prompt gửi cho Gemini

```typescript
// knowledge-validation.prompt.ts
export const VALIDATION_PROMPT = (content: string, category: string) => `
Bạn là chuyên gia kiểm định nội dung cho hệ thống tri thức nông nghiệp Việt Nam.
Hãy đánh giá bài viết sau và trả về JSON hợp lệ ĐÚNG format bên dưới.

=== BÀI VIẾT ===
Category: ${category}
Nội dung: ${content.slice(0, 3000)}
=== HẾT BÀI VIẾT ===

Đánh giá theo các tiêu chí (tổng 100 điểm):

1. LIÊN QUAN NÔNG NGHIỆP (40 điểm):
   Bài có thuộc lĩnh vực: trồng trọt, chăn nuôi, thủy sản, bảo vệ thực vật,
   canh tác, nông cụ, phân bón, thuốc BVTV, giống cây/con?

2. NGÔN NGỮ HỢP LỆ (20 điểm):
   Bài viết bằng Tiếng Việt (vi) hoặc Tiếng Anh (en)?
   Ngôn ngữ khác: 0 điểm.

3. CATEGORY KHỚP NỘI DUNG (20 điểm):
   Category admin gán có phù hợp nội dung thực tế?

4. KHÔNG CÓ THÔNG TIN NGUY HIỂM (20 điểm):
   Không có: thuốc cấm, liều lượng sai lệch nghiêm trọng, kỹ thuật gây hại?

Trả về JSON ĐÚNG format sau, KHÔNG có text thêm:
{
  "score": <số nguyên 0-100>,
  "is_agriculture_related": <true|false>,
  "language_detected": <"vi"|"en"|"other">,
  "category_match": <true|false>,
  "warnings": [<danh sách chuỗi cảnh báo, có thể rỗng []>],
  "rejection_reason": <null nếu score >= 40, hoặc chuỗi giải thích lý do reject>
}
`;
```

### 3.2 KnowledgeValidationService

```typescript
// knowledge-validation.service.ts
@Injectable()
export class KnowledgeValidationService {
  constructor(
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly model: Model<KnowledgeSourceDocument>,
    private readonly llmService: LLMService,
  ) {}

  async validate(id: string): Promise<KnowledgeSourceDocument> {
    // 1. Set status = "validating"
    await this.model.findByIdAndUpdate(id, { validation_status: 'validating' });

    const doc = await this.model.findById(id).lean();
    if (!doc) throw new NotFoundException(`Knowledge "${id}" not found`);

    try {
      // 2. Gọi Gemini
      const prompt = VALIDATION_PROMPT(doc.content, doc.category);
      const result = await this.llmService.complete({
        prompt,
        promptVersion: 'knowledge-validation-v1',
        maxTokens: 500,
        temperature: 0.1,  // low temp → deterministic JSON output
      });

      // 3. Parse JSON từ Gemini
      const report = this.parseValidationReport(result.text);

      // 4. Quyết định status
      const newStatus = report.score < 40 ? 'rejected' : 'validated';

      // 5. Lưu vào MongoDB
      return await this.model.findByIdAndUpdate(
        id,
        {
          validation_status: newStatus,
          language: report.language_detected === 'en' ? 'en' : 'vi',
          validation_report: { ...report, checked_at: new Date() },
        },
        { new: true },
      );
    } catch (err) {
      // Nếu Gemini lỗi → reset về unvalidated
      await this.model.findByIdAndUpdate(id, {
        validation_status: 'unvalidated',
      });
      throw err;
    }
  }

  async confirm(
    id: string,
    action: 'confirm' | 'reject',
    note?: string,
  ): Promise<KnowledgeSourceDocument> {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException(`Knowledge "${id}" not found`);

    // Chỉ cho phép confirm/reject khi đã validated
    if (!['validated', 'rejected'].includes(doc.validation_status)) {
      throw new BadRequestException(
        `Không thể confirm bài ở trạng thái "${doc.validation_status}". Cần validate trước.`,
      );
    }

    const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
    return await this.model.findByIdAndUpdate(
      id,
      { validation_status: newStatus, admin_note: note ?? null },
      { new: true },
    );
  }

  private parseValidationReport(text: string) {
    // Extract JSON từ response Gemini (có thể có text thừa)
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini trả về không đúng JSON format');
    return JSON.parse(match[0]) as {
      score: number;
      is_agriculture_related: boolean;
      language_detected: string;
      category_match: boolean;
      warnings: string[];
      rejection_reason: string | null;
    };
  }
}
```

---

## 4. Cập nhật KnowledgeService

### 4.1 batchEmbed() — chỉ embed bài `confirmed`

```typescript
async batchEmbed(dto?: BatchEmbedKnowledgeDto): Promise<{ queued: number; skipped_unconfirmed: number }> {
  let candidates: KnowledgeSourceDocument[];

  if (dto?.ids?.length) {
    candidates = await this.model.find({ _id: { $in: dto.ids } }).lean();
  } else {
    candidates = await this.model
      .find({ validation_status: 'confirmed', embed_status: { $in: ['pending', 'error'] } })
      .lean();
  }

  // Lọc ra các bài chưa confirmed
  const confirmed = candidates.filter(d => d.validation_status === 'confirmed');
  const skipped = candidates.length - confirmed.length;

  if (skipped > 0) {
    this.logger.warn({
      action: 'knowledge.batchEmbed.skipped',
      reason: 'validation_status !== confirmed',
      count: skipped,
    });
  }

  if (confirmed.length === 0) return { queued: 0, skipped_unconfirmed: skipped };

  // Enqueue chỉ bài đã confirmed
  await this.embeddingQueue.addBulk(
    confirmed.map(doc => ({ name: 'embed-knowledge', data: { ... } }))
  );

  return { queued: confirmed.length, skipped_unconfirmed: skipped };
}
```

### 4.2 update() — reset validation khi content thay đổi

```typescript
async update(id: string, dto: UpdateKnowledgeDto) {
  const updates: Record<string, any> = { ...dto };

  // Nếu nội dung thay đổi → reset toàn bộ validation
  if (dto.content) {
    updates.validation_status = 'unvalidated';
    updates.validation_report = null;
    updates.language = 'unknown';
    updates.embed_status = 'pending';
    updates.admin_note = null;
  }

  return this.model.findByIdAndUpdate(id, updates, { new: true });
}
```

---

## 5. AdminKnowledgeController (v2)

```typescript
// Thêm 2 endpoint mới

// POST /admin/knowledge/:id/validate
@Post(':id/validate')
@HttpCode(HttpStatus.ACCEPTED)
async validate(@Param('id') id: string) {
  const doc = await this.validationService.validate(id);
  return { success: true, data: doc };
}

// POST /admin/knowledge/:id/confirm
@Post(':id/confirm')
@HttpCode(HttpStatus.OK)
async confirm(
  @Param('id') id: string,
  @Body() dto: ConfirmKnowledgeDto,
) {
  const doc = await this.validationService.confirm(id, dto.action, dto.note);
  return { success: true, data: doc };
}
```

---

## 6. ConfirmKnowledgeDto (mới)

```typescript
// confirm-knowledge.dto.ts
export class ConfirmKnowledgeDto {
  @IsString()
  @IsIn(['confirm', 'reject'])
  action: 'confirm' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

---

## 7. Thuật toán Chunking (giữ nguyên từ v1)

- **Window**: 500 ký tự
- **Step**: 150 ký tự (overlap 350)
- **Max chunks**: 50

---

## 8. Cập nhật System Prompt ChatBox

Thêm vào `prompt.templates.ts`:

```typescript
export const LANGUAGE_INSTRUCTION = `
NGÔN NGỮ PHẢN HỒI: LUÔN LUÔN trả lời bằng Tiếng Việt, bất kể ngôn ngữ
của tài liệu context được cung cấp. Nếu context bằng Tiếng Anh, hãy
dịch và trình bày lại bằng Tiếng Việt tự nhiên, gần gũi với nông dân
Việt Nam. Không trả lời bằng Tiếng Anh trong bất kỳ trường hợp nào.
`;
```

---

## 9. Thứ tự Files cần tạo/sửa (Implementation Order)

1. `knowledge-source.schema.ts` — thêm fields mới
2. `confirm-knowledge.dto.ts` — DTO mới
3. `knowledge-validation.prompt.ts` — prompt template
4. `knowledge-validation.service.ts` — service validate + confirm
5. `knowledge.service.ts` — cập nhật batchEmbed() + update()
6. `admin-knowledge.controller.ts` — thêm 2 endpoint
7. `knowledge.module.ts` — đăng ký ValidationService
8. `prompt.templates.ts` (AiModule) — thêm LANGUAGE_INSTRUCTION

---

*Design Document v2 updated by Antigravity Agentic Assistant — 2026-06-22*
