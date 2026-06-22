# FarmDiaries AI — Backend AI Feature Specification
### NestJS Implementation · LLM · RAG · EmbeddingModule · PlantScan · WeeklyInsight

| Thuộc tính | Giá trị |
|---|---|
| **Dự án** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tài liệu** | Backend AI Feature Specification |
| **Đường dẫn** | `openspec/specs/ai_backend_spec.md` |
| **Phiên bản** | v1.0 |
| **Trạng thái** | Active · Source of Truth cho Backend AI implementation |
| **Consistent với** | `ai_chat_spec.md` · `embedding_spec.md` · `core_features_spec.md` · `blueprint.md` · `api_wiring` |

---

> **Nguyên tắc bất biến:**
> - MongoDB = source of truth cho mọi business data (users, diaries, chat sessions, plant scans, pet states, weekly insights, knowledge docs).
> - Supabase Postgres + pgvector = managed search index duy nhất, chỉ chứa bảng `embeddings` phục vụ RAG. Không có bất kỳ business data nào được lưu trữ ở đây.
> - Mọi field name trong API response dùng `snake_case` (nhất quán với `api_wiring`).
> - Response wrapper luôn theo chuẩn `{ success: true, data: T }`.

---

## Mục lục

1. [Module Map & Dependency Graph](#1-module-map--dependency-graph)
2. [LLMModule](#2-llmmodule)
3. [RateLimiterService](#3-ratelimiterservice)
4. [EmbeddingModule & pgvector Schema](#4-embeddingmodule--pgvector-schema)
5. [RAGModule](#5-ragmodule)
6. [PromptModule](#6-promptmodule)
7. [ChatModule](#7-chatmodule)
8. [PlantScanModule](#8-plantscanmodule)
9. [WeeklyInsightModule](#9-weeklyinsightmodule)
10. [PetModule — AI Integration Points](#10-petmodule--ai-integration-points)
11. [MongoDB Collections](#11-mongodb-collections)
12. [Environment Variables](#12-environment-variables)
13. [Error Codes](#13-error-codes)
14. [Build Order](#14-build-order)
15. [Testing Checklist](#15-testing-checklist)

---

## 1. Module Map & Dependency Graph

```
ChatModule
  ├── depends on: LLMModule, RAGModule, PromptModule, PetModule
  └── saves to: MongoDB (ai_chats)

RAGModule
  ├── depends on: EmbeddingModule (for query vector), PgvectorRepository (Supabase)
  ├── fetches full docs from: MongoDB (diary_entries, knowledge_chunks)
  └── NEVER reads business content from pgvector (Supabase Postgres)

EmbeddingModule
  ├── depends on: LLMModule (text-embedding-004 call)
  ├── receives jobs from: BullMQ embed_queue
  └── writes to: Supabase Postgres + pgvector embeddings table ONLY

LLMModule
  ├── depends on: RateLimiterService (Redis)
  ├── calls: Gemini Flash (chat) + text-embedding-004 (embed)
  └── logs: model, latency_ms, prompt_tokens, completion_tokens, prompt_version

PromptModule
  ├── depends on: none
  └── pure builder: no DB calls, no external API calls
  NOTE: ChatModule fetches PetState, then passes streak_count + pet_mood into PromptModule.

PlantScanModule
  ├── depends on: LLMModule (Gemini Vision)
  └── saves to: MongoDB (plant_scans)

WeeklyInsightModule
  ├── depends on: RAGModule, LLMModule, NotificationModule
  └── saves to: MongoDB (weekly_insights)
```

**Rule:** Không module nào được gọi Gemini trực tiếp ngoài `LLMModule`. Mọi Gemini call phải đi qua `LLMModule`.

---

## 2. LLMModule

### 2.1 Trách nhiệm

- Là **single point** cho mọi lời gọi Gemini API trong toàn hệ thống.
- Quản lý 2 pool quota riêng: Flash (chat/insight/scan) và Embed (embedding).
- Xử lý retry với exponential backoff.
- Log token usage + latency cho mọi call.
- Khi Flash rate-limit → trả fallback string ngay, không queue.

### 2.2 Interface

```typescript
// src/modules/llm/llm.service.ts

export interface LLMCompleteOptions {
  prompt:        string;          // Full assembled prompt (system + context + user)
  promptVersion: string;          // e.g. "v1.0" — luôn bắt buộc để tracking A/B
  maxTokens?:    number;          // default 1000
  temperature?:  number;          // default 0.7
  stream?:       boolean;         // default false
  // [FIX #10] Controls rate-limit behavior:
  //   'fallback' (default) — return LLM_FALLBACK_MESSAGE, rateLimited: true  → use for Chat
  //   'throw'              — throw LLMRateLimitedException → use for PlantScan, WeeklyInsight, Embedding
  onRateLimit?: 'fallback' | 'throw';
}

export interface LLMCompleteResult {
  text:            string;
  promptTokens:    number;
  completionTokens: number;
  latencyMs:       number;
  rateLimited:     boolean;       // true nếu đây là fallback message
}

export interface LLMEmbedResult {
  vector:    number[];            // 768 dimensions
  latencyMs: number;
}

// [FIX #2] Vision interface cho PlantScanModule
export interface VisionCompleteOptions {
  prompt:        string;
  imageBuffer:   Buffer;
  mimeType:      'image/jpeg' | 'image/png' | 'image/webp';
  promptVersion: string;
  maxTokens?:    number;
  onRateLimit?:  'fallback' | 'throw';  // default 'throw' for plant scan
}

@Injectable()
export class LLMService {
  complete(options: LLMCompleteOptions): Promise<LLMCompleteResult>;
  embed(text: string): Promise<LLMEmbedResult>;
  streamComplete(options: LLMCompleteOptions): AsyncGenerator<string>; // SSE — handles rate limit internally
  // [FIX #2] Gemini Vision for plant diagnosis:
  completeVision(options: VisionCompleteOptions): Promise<LLMCompleteResult>;
}
```

### 2.3 complete() flow

```
checkFlashLimit()
  │
  ├── NOT allowed
  │      ├── if onRateLimit == 'throw'    → throw LLMRateLimitedException
  │      └── if onRateLimit == 'fallback' → log event → return { text: FALLBACK_MESSAGE, rateLimited: true }
  │
  └── allowed → call gemini-1.5-flash
                  │
                  ├── success → log tokens/latency → return result
                  │
                  └── 429/5xx from Gemini → exponential backoff retry (1s, 2s, 4s, max 3x)
                                          │
                                          └── still fail
                                                 ├── if onRateLimit == 'throw'    → throw LLMRateLimitedException
                                                 └── if onRateLimit == 'fallback' → return { text: FALLBACK_MESSAGE, rateLimited: true }
```

**Fallback message constant:**
```typescript
export const LLM_FALLBACK_MESSAGE =
  'Dạ, hệ thống tư vấn đang bận, bà con vui lòng thử lại sau vài giây nhé! 🌱';
```

### 2.4 embed() flow

```
checkEmbedLimit()
  │
  ├── NOT allowed → throw EmbedQuotaExceededException
  │                 (BullMQ worker sẽ retry job này)
  │
  └── allowed → call text-embedding-004 → return vector[768]
```

embed() throws (không return fallback) vì embedding failure nên được retry qua BullMQ, không silently ignored.

### 2.5 Safety Settings

```typescript
const safetySettings = [
  {
    category:  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category:  HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category:  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];
```

Nếu Gemini trả `finishReason === 'SAFETY'`:
- Log vào `audit_log`: `{ action: 'llm.safety_block', userId, promptVersion }`
- Return: `'Nội dung câu hỏi chưa phù hợp. Bà con vui lòng đặt câu hỏi rõ ràng hơn về kỹ thuật cây trồng nhé!'`

### 2.6 Logging

Mỗi LLM call phải ghi log structured:

```typescript
this.logger.info({
  action:          'llm.complete',
  userId,
  model:           'gemini-1.5-flash',
  promptVersion,
  promptTokens,
  completionTokens,
  latencyMs,
  rateLimited:     false,
});
```

---

## 3. RateLimiterService

### 3.1 Trách nhiệm

Single service quản lý mọi Redis-based rate limit trong app. LLMModule gọi service này — không tự INCR Redis trực tiếp.

### 3.2 Implementation

```typescript
// src/common/services/rate-limiter.service.ts

export interface ConsumeResult {
  allowed:   boolean;
  remaining: number;
  resetAt:   number; // Unix timestamp ms
}

@Injectable()
export class RateLimiterService {
  constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

  // Lua script đảm bảo INCR + EXPIRE là atomic
  private readonly lua = `
    local cur = redis.call('INCR', KEYS[1])
    if cur == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return cur
  `;

  async consume(
    key:           string,
    limit:         number,
    windowSeconds: number,
  ): Promise<ConsumeResult> {
    const count = await this.redis.eval(
      this.lua, 1, key, String(windowSeconds),
    ) as number;

    const ttl     = await this.redis.ttl(key);
    const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

    return {
      allowed:   count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }
}
```

### 3.3 Keys & Limits

| Key | Limit | Window | Dùng cho |
|---|---|---|---|
| `llm:rpm:flash` | 14 | 60s | Gemini Flash calls (chat, insight, scan) |
| `llm:rpm:embed` | 95 | 60s | text-embedding-004 calls |
| `scan:daily:{userId}:{date}` | 3 (free) / 10 (premium) | 86400s | PlantScan per user per day |
| `snap:daily:{userId}:{date}` | 10 (free) / 30 (premium) | 86400s | FarmSnap per user per day |

> [FIX #9] `{date}` format: `YYYY-MM-DD` **in Asia/Ho_Chi_Minh timezone** (not UTC). User expects daily quota to reset at local midnight, not 7AM Vietnam time. Key tự expire sau 24h.

---

## 4. EmbeddingModule & pgvector Schema

### 4.1 pgvector Schema (Fixed — với chunk_index)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   TEXT        NOT NULL,   -- MongoDB ObjectId as string
  source_type TEXT        NOT NULL,   -- 'diary_entry' | 'knowledge_chunk'
  chunk_index INT         NOT NULL DEFAULT 0,  -- index của chunk trong document
  embedding   vector(768) NOT NULL,
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

> ⚠️ **Quan trọng:** `UNIQUE(source_id, source_type)` **KHÔNG ĐÚNG** vì một document có thể có nhiều chunks. Phải dùng `UNIQUE(source_id, source_type, chunk_index)`.

### 4.2 Chunk Strategy

**Diary notes:**

| Điều kiện | Hành động |
|---|---|
| `notes` null hoặc sau trim < 20 chars | Skip — không enqueue embed job |
| 20 ≤ length < 500 | 1 chunk, chunk_index = 0 |
| length ≥ 500 | Sliding window: size=300, step=100, max 10 chunks |

```typescript
// src/modules/embedding/chunk.util.ts

export function preprocessText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function chunkDiary(text: string): string[] {
  const cleaned = preprocessText(text);
  if (cleaned.length < 20)  return [];
  if (cleaned.length < 500) return [cleaned];

  const WINDOW = 300, STEP = 100, MAX = 10;
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length && chunks.length < MAX; i += STEP) {
    chunks.push(cleaned.slice(i, i + WINDOW));
  }
  return chunks;
}

export function chunkKnowledge(text: string): string[] {
  const cleaned = preprocessText(text);
  const WINDOW = 500, STEP = 150, MAX = 50;
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length && chunks.length < MAX; i += STEP) {
    chunks.push(cleaned.slice(i, i + WINDOW));
  }
  return chunks;
}
```

### 4.3 BullMQ Queue Config

Queue name: `embed_queue`

| Job | Priority | Attempts | Backoff |
|---|---|---|---|
| `embed_diary` | 3 | 3 | exponential, 2s base |
| `embed_knowledge` | 5 | 3 | exponential, 5s base |

### 4.4 EmbedWorker

```typescript
// src/modules/embedding/embed.worker.ts

@Processor('embed_queue')
export class EmbedWorker {
  @Process('embed_diary')
  async handleDiary(job: Job<{ diaryId: string; userId: string }>) {
    const diary = await this.diaryRepo.findById(job.data.diaryId);
    if (!diary || diary.is_deleted) return; // silently skip deleted entries

    const chunks = chunkDiary(diary.notes ?? '');
    if (chunks.length === 0) return;

    for (let i = 0; i < chunks.length; i++) {
      const { vector } = await this.llmService.embed(chunks[i]);
      // throws EmbedQuotaExceededException → BullMQ retries the job
      await this.pgvectorRepo.upsert({
        sourceId:   diary._id.toString(),
        sourceType: 'diary_entry',
        chunkIndex: i,       // required for UNIQUE constraint
        embedding:  vector,
        metadata: {
          cropType:   diary.crop_type,
          userId:     diary.user_id,
          chunkIndex: i,
        },
        isActive: true,
      });
    }
  }

  @Process('embed_knowledge')
  async handleKnowledge(job: Job<{ knowledgeDocId: string }>) {
    const doc = await this.knowledgeRepo.findById(job.data.knowledgeDocId);
    if (!doc) return;

    const chunks = chunkKnowledge(doc.content);
    for (let i = 0; i < chunks.length; i++) {
      const { vector } = await this.llmService.embed(chunks[i]);
      await this.pgvectorRepo.upsert({
        sourceId:   doc._id.toString(),
        sourceType: 'knowledge_chunk',
        chunkIndex: i,
        embedding:  vector,
        metadata:   { title: doc.title, cropType: doc.crop_type, chunkIndex: i },
        isActive:   true,
      });
    }
  }
}
```

### 4.5 Trigger Points

**Diary created** (`DiaryService.create`):
```typescript
const newDiary = await this.diaryRepo.create({ ...dto, user_id: userId });

// Enqueue async — MongoDB save là đủ đảm bảo, embed là best-effort
await this.embedQueue.add(
  'embed_diary',
  { diaryId: newDiary._id.toString(), userId },
  { priority: 3, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
);
return newDiary;
```

**Diary updated** (chỉ khi `notes` hoặc `crop_type` thay đổi):
```typescript
const shouldReEmbed = dto.notes !== undefined || dto.crop_type !== undefined;
if (shouldReEmbed) {
  await this.pgvectorRepo.deactivateBySourceId(diaryId, 'diary_entry');
  await this.embedQueue.add('embed_diary', { diaryId, userId }, { priority: 3 });
}
```

**Diary soft-deleted:**
```typescript
await this.pgvectorRepo.deactivateBySourceId(diaryId, 'diary_entry');
// Cleanup job sẽ DELETE is_active=false rows sau 24h
```

### 4.6 PgvectorRepository Interface

```typescript
// src/modules/embedding/pgvector.repository.ts

export interface EmbeddingUpsert {
  sourceId:   string;
  sourceType: 'diary_entry' | 'knowledge_chunk';
  chunkIndex: number;
  embedding:  number[];
  metadata:   Record<string, unknown>;
  isActive:   boolean;
}

export interface SearchHit {
  source_id:   string;
  source_type: 'diary_entry' | 'knowledge_chunk';
  chunk_index: number;
  score:       number;
  metadata:    Record<string, unknown>;
}

@Injectable()
export class PgvectorRepository {

  async upsert(data: EmbeddingUpsert): Promise<void> {
    await this.ds.query(`
      INSERT INTO embeddings
        (source_id, source_type, chunk_index, embedding, metadata, is_active)
      VALUES ($1, $2, $3, $4::vector, $5, $6)
      ON CONFLICT (source_id, source_type, chunk_index)
        DO UPDATE SET
          embedding  = EXCLUDED.embedding,
          metadata   = EXCLUDED.metadata,
          is_active  = EXCLUDED.is_active,
          created_at = now()
    `, [
      data.sourceId,
      data.sourceType,
      data.chunkIndex,
      JSON.stringify(data.embedding),
      JSON.stringify(data.metadata),
      data.isActive,
    ]);
  }

  async searchSimilar(
    vector:    number[],
    limit:     number,
    minScore:  number,
    // [FIX #7] userId filter: include only knowledge_chunks (shared) + diary entries belonging to this user
    userId?:   string,
  ): Promise<SearchHit[]> {
    return this.ds.query(`
      SELECT
        source_id,
        source_type,
        chunk_index,
        metadata,
        1 - (embedding <=> $1::vector) AS score
      FROM embeddings
      WHERE is_active = TRUE
        AND 1 - (embedding <=> $1::vector) >= $2
        AND (
          source_type = 'knowledge_chunk'
          OR metadata->>'userId' = $4
        )
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [JSON.stringify(vector), minScore, limit, userId ?? '']);
  }

  async deactivateBySourceId(sourceId: string, sourceType: 'diary_entry' | 'knowledge_chunk'): Promise<void> {
    await this.ds.query(
      `UPDATE embeddings SET is_active = FALSE WHERE source_id = $1 AND source_type = $2`,
      [sourceId, sourceType],
    );
  }
}
```

---

## 5. RAGModule

### 5.1 Trách nhiệm

- Nhận user message → embed → pgvector ANN search → fetch full docs từ MongoDB → assemble context string.
- KHÔNG cache diary context (privacy risk).
- Cache knowledge-only context 30 phút.

### 5.2 Config (từ env)

```typescript
export const RAG_CONFIG = {
  minScore: parseFloat(process.env.RAG_MIN_SCORE ?? '0.5'),
  topK:     parseInt(process.env.RAG_TOP_K     ?? '6'),
};
```

Tuning guide:

| Phase | Knowledge docs | Recommended `RAG_MIN_SCORE` |
|---|---|---|
| Launch | < 50 | 0.5 |
| 1 tháng | 50–200 | 0.6 |
| 3 tháng+ | 200+ | 0.65–0.75 |

### 5.3 RAGService

```typescript
// src/modules/rag/rag.service.ts

export interface RAGContext {
  context_text: string;   // assembled string injected vào prompt
  citations:    Array<{
    source_id:   string;
    source_type: string;
    score:       number;
  }>;
  has_context:  boolean;  // false khi pgvector trả về rỗng
}

@Injectable()
export class RAGService {

  async retrieveContext(
    userMessage: string,
    userId:      string,
  ): Promise<RAGContext> {
    // Step 1: Embed query
    const { vector } = await this.llmService.embed(userMessage);

    // Step 2: pgvector ANN search — chỉ trả IDs, không có content
    // [FIX #7] Pass userId to filter diary embeddings — only this user's diaries + shared knowledge_chunks
    const hits = await this.pgvectorRepo.searchSimilar(
      vector,
      RAG_CONFIG.topK,
      RAG_CONFIG.minScore,
      userId,  // userId filter applied at pgvector level
    );

    if (hits.length === 0) {
      return { context_text: '', citations: [], has_context: false };
    }

    // Step 3: Phân loại IDs
    const diaryIds     = hits
      .filter(h => h.source_type === 'diary_entry')
      .map(h => h.source_id);
    const knowledgeIds = hits
      .filter(h => h.source_type === 'knowledge_chunk')
      .map(h => h.source_id);

    // Step 4: Fetch full content từ MongoDB
    // Diary: KHÔNG cache — dữ liệu cá nhân, thay đổi thường xuyên
    const diaryDocs = await this.diaryRepo.findByIds(diaryIds, userId);

    // Knowledge: cache theo queryHash — safe vì không có PII
    const knowledgeDocs = await this.getCachedKnowledge(knowledgeIds, userMessage);

    // Step 5: Assemble context string
    return this.assembleContext(diaryDocs, knowledgeDocs, hits);
  }

  private async getCachedKnowledge(
    ids:   string[],
    query: string,
  ) {
    const cacheKey = `rag:knowledge:${md5(query)}`;
    const cached   = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const docs = await this.knowledgeRepo.findByIds(ids);
    await this.redis.setex(cacheKey, 1800, JSON.stringify(docs)); // 30 min TTL
    return docs;
  }

  private assembleContext(
    diaries:   DiaryEntry[],
    knowledge: KnowledgeChunk[],
    hits:      SearchHit[],
  ): RAGContext {
    const MAX_CONTEXT_CHARS = 6000;
    const parts: string[]   = [];

    for (const hit of hits) {
      if (hit.source_type === 'diary_entry') {
        const doc = diaries.find(d => d._id.toString() === hit.source_id);
        if (doc) parts.push(
          `[Nhật ký ${new Date(doc.created_at).toLocaleDateString('vi-VN')}] ${doc.notes}`,
        );
      } else {
        const doc = knowledge.find(k => k._id.toString() === hit.source_id);
        if (doc) parts.push(`[Tài liệu: ${doc.title}] ${doc.chunk_text}`);
      }
    }

    return {
      context_text: parts.join('\n\n').slice(0, MAX_CONTEXT_CHARS),
      citations:    hits.map(h => ({
        source_id:   h.source_id,
        source_type: h.source_type,
        score:       h.score,
      })),
      has_context:  parts.length > 0,
    };
  }
}
```

### 5.4 Fallback khi has_context = false

Không skip LLM call. PromptModule inject empty string vào `{rag_retrieved_context}`. Gemini vẫn trả lời từ base knowledge + chat history.

---

## 6. PromptModule

### 6.1 Trách nhiệm

Pure builder — không gọi DB, không gọi external API. Nhận data đã được chuẩn bị, lắp vào template, trả string.

### 6.2 Limits Constants

```typescript
// src/modules/prompt/prompt.constants.ts

export const PROMPT_LIMITS = {
  historyTurns:    6,
  maxHistoryChars: 4000,
  maxContextChars: 6000,  // enforced in RAGService.assembleContext()
  maxUserMsgChars: 2000,
} as const;
```

### 6.3 System Prompt Template

Version: `v1.0` — mọi thay đổi template phải tăng version.

```typescript
// src/modules/prompt/prompt.templates.ts

export const CHAT_SYSTEM_PROMPT_V1 = `
Bạn là "Người Bạn Nhà Nông AI" (FarmDiaries Expert Agent) — chuyên gia tư vấn nông nghiệp thông minh, thân thiện tại Việt Nam.

QUY TẮC CỐT LÕI:
1. TRỌNG TÂM: Chỉ trả lời câu hỏi về nông nghiệp, cây trồng, vật nuôi, phân bón, bảo vệ thực vật, kỹ thuật canh tác và nhật ký nông trại. Nếu câu hỏi KHÔNG thuộc chủ đề này, trả lời: "Dạ, tôi chỉ hỗ trợ về kỹ thuật trồng trọt và chăm sóc nông trại thôi ạ! 🌱"
2. DỮ LIỆU THAM KHẢO: Dùng thông tin trong [VĂN BẢN THAM KHẢO] để trả lời. Không bịa đặt số liệu.
3. AN TOÀN HÓA CHẤT: Khi đề xuất thuốc BVTV, luôn nhắc Thời Gian Cách Ly (PHI) trước thu hoạch.
4. NGÔN NGỮ: Tiếng Việt tự nhiên, gần gũi (dùng "Dạ", "Bà con", "Anh/Chị nhà nông").
5. ĐỘNG LỰC: Nếu streak >= 3 ngày, khen ngợi. Nếu pet_mood = 'sad', khuyến khích ghi nhật ký hôm nay.

[TRẠNG THÁI CHỦ VƯỜN]
- Tên: {user_name}
- Streak: {streak_count} ngày liên tục
- Trạng thái thú ảo: {pet_mood}

[VĂN BẢN THAM KHẢO]
{rag_context}

[LỊCH SỬ HỘI THOẠI]
{chat_history}

[CÂU HỎI]
{user_message}
`.trim();
```

### 6.4 PromptService

```typescript
// src/modules/prompt/prompt.service.ts

export interface BuildChatPromptInput {
  userName:    string;
  streakCount: number;
  petMood:     'happy' | 'excited' | 'neutral' | 'sad' | 'worried';
  ragContext:  string;               // từ RAGService.context_text
  chatHistory: ChatMessage[];        // full history từ MongoDB
  userMessage: string;
}

@Injectable()
export class PromptService {

  buildChatPrompt(input: BuildChatPromptInput): {
    prompt:        string;
    promptVersion: string;
  } {
    const history    = this.buildHistory(input.chatHistory);
    const safeMsg    = this.sanitize(input.userMessage);
    // [FIX #6] Also sanitize RAG context and history — diary notes are untrusted user text
    // A user could write "Ignore previous instructions" in their diary, which RAG would inject into the prompt.
    const safeCtx    = this.sanitizeContext(input.ragContext);

    const prompt = CHAT_SYSTEM_PROMPT_V1
      .replace('{user_name}',    input.userName)
      .replace('{streak_count}', String(input.streakCount))
      .replace('{pet_mood}',     input.petMood)
      .replace('{rag_context}',  safeCtx || '(Không có dữ liệu tham khảo)')
      .replace('{chat_history}', history)
      .replace('{user_message}', safeMsg);

    return { prompt, promptVersion: 'v1.0' };
  }

  private buildHistory(messages: ChatMessage[]): string {
    const recent = messages.slice(-PROMPT_LIMITS.historyTurns);
    const raw    = recent
      .map(m => `${m.role === 'user' ? 'Nông dân' : 'AI'}: ${this.sanitize(m.content)}`)
      .join('\n');
    // Truncate từ bên trái nếu vượt giới hạn
    return raw.length > PROMPT_LIMITS.maxHistoryChars
      ? raw.slice(-PROMPT_LIMITS.maxHistoryChars)
      : raw;
  }

  // [FIX #6] Prompt injection defense — applies to user messages
  private sanitize(input: string): string {
    return input
      .replace(/\[SYSTEM\]/gi,                  '[SYS-BLOCKED]')
      .replace(/\[INST\]/gi,                    '[INST-BLOCKED]')
      .replace(/<\|.*?\|>/g,                    '')
      .replace(/ignore previous instructions/gi, '[BLOCKED]')
      .slice(0, PROMPT_LIMITS.maxUserMsgChars);
  }

  // [FIX #6] Sanitize RAG context — diary notes and knowledge docs are untrusted text
  // User may write injection attempts in diary notes which RAG would retrieve into the prompt.
  private sanitizeContext(context: string): string {
    return context
      .replace(/\[SYSTEM\]/gi,                  '[SYS-BLOCKED]')
      .replace(/\[INST\]/gi,                    '[INST-BLOCKED]')
      .replace(/<\|.*?\|>/g,                    '')
      .replace(/ignore previous instructions/gi, '[BLOCKED]')
      .slice(0, PROMPT_LIMITS.maxContextChars);
  }
}
```

---

## 7. ChatModule

### 7.1 API Endpoints

Tất cả prefix `/api/v1/chat`. Auth: Bearer JWT required.

#### POST /api/v1/chat/message

**Request:**
```typescript
// snake_case — nhất quán với api_wiring
{
  "content":    "Lá bưởi bị đốm vàng, làm sao trị?",
  "session_id": "4a18d192-bc2f-410a-9d7a-115f231e228d"  // optional
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "session_id": "4a18d192-bc2f-410a-9d7a-115f231e228d",
    "response": {
      "role":         "assistant",
      "content":      "Cây bưởi của bạn có thể đang bị thiếu kẽm...",
      "timestamp":    "2026-06-10T08:00:00Z",
      "rate_limited": false
    },
    "pet_mood_updated": false  // true nếu PetService thay đổi mood sau message này
  }
}
```

Nếu `rate_limited: true`: content = `LLM_FALLBACK_MESSAGE`, HTTP vẫn 200. FE đọc field `rate_limited` để hiện toast, không phải HTTP status.

#### GET /api/v1/chat/sessions

**Query params:** `cursor?` (base64 encoded session_id), `limit?` (default 20)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "session_id": "4a18d192-bc2f-410a-9d7a-115f231e228d",
      "title":       "Chữa bệnh đốm vàng trên cây bưởi",
      "created_at":  "2026-06-10T08:00:00Z",
      "updated_at":  "2026-06-10T08:05:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "NjZhMThkM...",
    "has_more":    true,
    "limit":       20
  }
}
```

#### GET /api/v1/chat/sessions/:sessionId

**Response 200:**
```json
{
  "success": true,
  "data": {
    "session_id": "4a18d192-bc2f-410a-9d7a-115f231e228d",
    "messages": [
      { "role": "user",      "content": "Lá bưởi bị đốm vàng", "timestamp": "2026-06-10T08:00:00Z" },
      { "role": "assistant", "content": "Cây bưởi của bạn...",  "timestamp": "2026-06-10T08:00:02Z" }
    ]
  }
}
```

#### POST /api/v1/chat/feedback

```typescript
{
  "session_id":    "4a18d192-bc2f-410a-9d7a-115f231e228d",  // session_id chứa message được rate
  "message_id":    "665abc123...",                          // message_id của message cụ thể trong session
  "rating":        4,                                       // 1–5
  "helpful":       true,                                    // optional
  "comment":       "Chính xác!"                             // optional
}
```

Response 201: `{ "success": true, "message": "Cảm ơn bạn đã phản hồi! 🌱" }`

### 7.2 ChatService Flow

```typescript
// src/modules/chat/chat.service.ts

async sendMessage(dto: SendMessageDto, userId: string) {
  // 1. Resolve session
  const session = dto.session_id
    ? await this.getSession(dto.session_id, userId)
    : await this.createSession(userId);

  // 2. Load history từ session
  const history = session.messages ?? [];

  // 3. Fetch pet state — cần cho prompt injection
  const petState = await this.petService.getState(userId);

  // 4. RAG retrieval
  const ragContext = await this.ragService.retrieveContext(dto.content, userId);

  // 5. Build prompt
  const { prompt, promptVersion } = this.promptService.buildChatPrompt({
    userName:    petState.user_name,
    streakCount: petState.streak_count,
    petMood:     petState.mood,
    ragContext:  ragContext.context_text,
    chatHistory: history,
    userMessage: dto.content,
  });

  // 6. LLM call
  const result = await this.llmService.complete({ prompt, promptVersion });

  // 7. Save to MongoDB
  await this.saveMessagePair(session._id, dto.content, result.text);

  // 8. Return
  return {
    session_id: session._id.toString(),
    response: {
      role:         'assistant',
      content:      result.text,
      timestamp:    new Date().toISOString(),
      rate_limited: result.rateLimited,
    },
    pet_mood_updated: false,
  };
}
```

### 7.3 SSE Streaming Endpoint

Cho phép FE stream response thay vì wait full response:

> **[FIX #3] No double rate-limit:** SSE endpoint does NOT manually check Redis. `llmService.streamComplete()` handles rate limiting internally (via `onRateLimit: 'fallback'`). Doing both would count the request twice against the quota.
>
> **[FIX #4] MVP Queue Decision:** For MVP, realtime chat does NOT queue on Flash RPM limit.
> - **Reason:** Queuing a response back to a live SSE connection adds significant complexity (need WebSocket or polling fallback).
> - **Behavior:** Return fallback response immediately with `rate_limited: true`. FE shows toast.
> - **Override:** This decision overrides the `BullMQ queuing on rate-limit` behavior described in `ai_chat_spec.md` (TC-CHAT-04). That test case is deprecated for MVP.
> - **Future:** Chat queue / polling / WebSocket can be added post-MVP.

> 📝 **SSE Contract & Rate Limit Note:**
> - `llmService.streamComplete()` yields plain text chunks (`string`) for the MVP.
> - Nếu bị rate-limited, `streamComplete()` sẽ yield câu fallback (`LLM_FALLBACK_MESSAGE`) duy nhất một lần rồi kết thúc (complete) luồng generator.
> - Controller SSE khi bắt được trạng thái rate-limited hoặc lỗi sẽ đóng kết nối, đồng thời bắn event `done` cuối cùng chứa trường `rate_limited: boolean`.

```typescript
// GET /api/v1/chat/stream?session_id=...&content=...
// Auth: Bearer JWT via query param hoặc cookie
// NOTE: Avoid logging query params in production (content appears in URL logs).

@Sse('stream')
async streamMessage(
  @Query('session_id') sessionId: string,
  @Query('content')    content:   string,
  @CurrentUser()       user:      JwtPayload,
): Promise<Observable<MessageEvent>> {
  return new Observable(subscriber => {
    (async () => {
      const petState  = await this.petService.getState(user.id);
      const ragCtx    = await this.ragService.retrieveContext(content, user.id);
      const session   = sessionId
        ? await this.getSession(sessionId, user.id)
        : await this.createSession(user.id);

      const { prompt, promptVersion } = this.promptService.buildChatPrompt({
        userName:    petState.user_name,
        streakCount: petState.streak_count,
        petMood:     petState.mood,
        ragContext:  ragCtx.context_text,
        chatHistory: session.messages ?? [],
        userMessage: content,
      });

      // [FIX #3] No manual Redis check here — streamComplete() handles rate limit internally.
      // It will emit a fallback chunk if rate-limited, then complete.
      let fullText = '';
      let isRateLimited = false;
      for await (const chunk of this.llmService.streamComplete({ prompt, promptVersion, onRateLimit: 'fallback' })) {
        fullText += chunk;
        if (chunk === LLM_FALLBACK_MESSAGE && fullText === LLM_FALLBACK_MESSAGE) {
          isRateLimited = true;
        }
        subscriber.next({ data: JSON.stringify({ type: 'chunk', content: chunk }) });
      }

      await this.saveMessagePair(session._id, content, fullText);
      subscriber.next({ data: JSON.stringify({ type: 'done', session_id: session._id, rate_limited: isRateLimited }) });
      subscriber.complete();
    })();
  });
}
```

FE event types: `chunk` (append text), `done` (close connection, extract session_id), `error` (show fallback toast).

---

## 8. PlantScanModule

### 8.1 Validation Pipeline

```
[POST /api/v1/plant-scan/diagnose multipart]
         │
         ▼
[1. Rate limit: scan:daily:{userId}:{date} ≤ 3]
         │ EXCEEDED → 429 SCAN_QUOTA_EXCEEDED
         ▼
[2. Multer: fileSize ≤ 5MB, mimetype whitelist]
         │ FAIL → 400 SCAN_INVALID_FILE
         ▼
[3. Magic bytes check (file-type lib)]
         │ FAIL → 400 SCAN_INVALID_FILE
         ▼
[4. Sharp.js Laplacian variance > 100]
         │ FAIL → 422 SCAN_IMAGE_BLURRY
         ▼
[5. pHash cache check (MongoDB: plant_scans last 7 days + Hamming distance < 10)]
         │ HIT → return cached result immediately
         ▼
[6. Upload to Cloudflare R2 (private bucket, signed URL)]
         ▼
[7. LLMService.completeVision({ imageBuffer, mimeType, prompt, promptVersion, onRateLimit: 'throw' })]
         ▼
[8. applyBVTVGuardrail(diagnosis)]
         ▼
[9. Save to MongoDB plant_scans (gồm p_hash để làm cache)]
         ▼
[Return diagnosis to client]
```

### 8.2 Endpoint

```
POST /api/v1/plant-scan/diagnose
Content-Type: multipart/form-data
Auth: Bearer JWT

Fields:
  image:     File   (required)
  crop_type: string (required)
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "disease":      "Bệnh Đạo Ôn (Pyricularia oryzae)",
    "confidence":   0.92,
    "symptoms":     ["Vết bệnh hình thoi", "Tâm màu xám tro"],
    "treatment": {
      "chemical": "Phun Tricyclazole hoặc Fuji-one 40EC",
      "organic":  "Dọn sạch cỏ dại, hạn chế phân đạm khi trổ bông",
      "phi_warning": "⚠️ Cách ly 14 ngày trước thu hoạch sau khi phun thuốc!"
    },
    "safety_alert": null,
    "low_confidence_warning": null,
    "image_url":    "https://r2.farmdiaries.vn/scans/...",
    "cached":       false,
    "disclaimer":   "Kết quả AI chỉ mang tính tham khảo. Để chẩn đoán chính xác, hãy liên hệ cán bộ khuyến nông địa phương."
  }
}
```

### 8.3 BVTV Guardrail

```typescript
// src/modules/plant-scan/guardrail.util.ts

const PHI_KEYWORDS       = ['thuốc', 'phun', 'liều lượng', 'PHI', 'cách ly'];
const BANNED_PESTICIDES  = ['paraquat', 'chlorpyrifos', 'carbofuran'];
// Cập nhật từ danh sách Bộ NN&PTNT

export function applyBVTVGuardrail(diagnosis: PlantDiagnosis): PlantDiagnosis {
  const treatmentText = [
    diagnosis.treatment.chemical,
    diagnosis.treatment.organic,
  ].join(' ').toLowerCase();

  if (PHI_KEYWORDS.some(k => treatmentText.includes(k.toLowerCase()))) {
    diagnosis.treatment.phi_warning =
      'Tuân thủ thời gian cách ly PHI trước khi thu hoạch. Đọc kỹ nhãn thuốc và khuyến cáo địa phương.';
  }

  const flagged = BANNED_PESTICIDES.filter(p => treatmentText.includes(p));
  if (flagged.length > 0) {
    diagnosis.safety_alert =
      `Lưu ý: ${flagged.join(', ')} là thuốc hạn chế/cấm tại VN. Liên hệ Chi cục BVTV địa phương.`;
  }

  if (diagnosis.confidence < 0.6) {
    diagnosis.low_confidence_warning =
      'Độ tin cậy thấp. Vui lòng chụp lại ảnh rõ hơn hoặc mô tả thêm triệu chứng.';
  }

  return diagnosis;
}
```

### 8.4 pHash Implementation

> **[FIX #8] pHash cache uses MongoDB + Hamming distance, NOT Redis exact-key lookup.**
> Redis `scan:cache:{pHash}` only matches identical hashes. It cannot compute Hamming distance between similar-but-not-identical hashes.
> **Correct approach:** Query recent `plant_scans` documents from MongoDB (last 7 days for this user/crop), compute Hamming distance in-app, return cached result if distance < 10.

Dùng thư viện `sharp` để lấy raw pixel data, tính pHash bằng DCT:

```typescript
import sharp from 'sharp';

export async function computePHash(buffer: Buffer): Promise<string> {
  // Resize về 32x32 grayscale — đủ cho pHash
  const { data } = await sharp(buffer)
    .resize(32, 32, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // DCT-based hash — simplified version
  // Nếu không muốn tự viết, dùng thư viện: 'imghash' hoặc 'blockhash'
  return computeDCTHash(Buffer.from(data));
}

export function hammingDistance(hash1: string, hash2: string): number {
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

// [FIX #8] Cache check flow (MongoDB-based Hamming distance):
// 1. Compute pHash for incoming image
// 2. Query: plant_scans.find({ user_id, crop_type, created_at: { $gte: 7 days ago } })
//    — uses index: { user_id: 1, created_at: -1 } + { p_hash: 1 }
// 3. For each recent scan, compute hammingDistance(newHash, scan.p_hash)
// 4. If any distance < 10 → return that scan's diagnosis (cache hit)
// 5. If no match → proceed with Gemini Vision call, save new scan with p_hash
```

---

## 9. WeeklyInsightModule

### 9.1 Cron Schedule

Chạy **Chủ nhật 6:00 AM** (timezone: Asia/Ho_Chi_Minh).

```typescript
@Cron('0 6 * * 0', { timeZone: 'Asia/Ho_Chi_Minh' })
async runWeeklyInsights() {
  const activeUsers = await this.usersRepo.findActiveLastWeek();
  const total       = activeUsers.length;

  // Spread đều trong 2 tiếng (7200000ms) để không spike Gemini quota
  for (let i = 0; i < total; i++) {
    const delay = Math.floor((i / total) * 7200000);
    await this.insightQueue.add(
      'generate_insight',
      { userId: activeUsers[i].id },
      {
        delay,
        priority: 10,  // lowest priority — không block chat
        attempts: 3,
        backoff:  { type: 'exponential', delay: 2000 },
      },
    );
  }
  this.logger.info({ total, spreadMs: 7200000 }, 'Weekly insight jobs enqueued');
}
```

### 9.2 InsightWorker

```typescript
@Process('generate_insight')
async handleInsight(job: Job<{ userId: string }>) {
  const { userId } = job.data;

  // Load 7 ngày nhật ký gần nhất từ MongoDB
  const diaries = await this.diaryRepo.findLastWeek(userId);
  if (diaries.length === 0) return;

  // RAG context cho insight
  const ragCtx = await this.ragService.retrieveContext(
    `Tổng hợp tình hình nông trại tuần này của ${userId}`,
    userId,
  );

  // Build insight prompt (khác chat prompt — không có history)
  const prompt = this.promptService.buildInsightPrompt({
    diaries,
    ragContext: ragCtx.context_text,
  });

  // [FIX #10] onRateLimit: 'throw' → LLMRateLimitedException → BullMQ retries the job
  // If we used 'fallback' (default), result.rateLimited=true and the worker returns normally,
  // BullMQ would mark the job as COMPLETED (not retried). That's wrong for weekly insights.
  const result = await this.llmService.complete({
    prompt,
    promptVersion: 'insight_v1.0',
    maxTokens:     500,
    onRateLimit:   'throw', // throws LLMRateLimitedException → BullMQ auto-retry
  });

  // Save to MongoDB
  const insight = await this.insightRepo.create({
    user_id:         userId,
    insight_text:    result.text,
    model_used:      'gemini-1.5-flash',
    tokens_used:     result.promptTokens + result.completionTokens,
    week_start_date: getWeekStartDate(),
  });

  // Notify qua Zalo ZNS / Push / Email
  await this.notificationService.send(userId, 'WEEKLY_INSIGHT', {
    summary_short: result.text.slice(0, 100),
  });
}
```

---

## 10. PetModule — AI Integration Points

PetModule không gọi LLM. Nó là rule-based và chỉ expose state cho ChatModule/PromptModule.

### 10.1 getState() — dùng bởi ChatModule

```typescript
export interface PetState {
  user_name:    string;
  mood:         'happy' | 'excited' | 'neutral' | 'sad' | 'worried';
  streak_count: number;
  level:        number;
  xp:           number;
  mood_reason:  string;
  bubble_message: string;
}

// GET /api/v1/pet/state → PetState
// Được gọi bởi ChatModule mỗi khi build prompt
```

### 10.2 Mood Update từ Chat Events

```typescript
// Khi user báo đã xử lý dịch bệnh trong chat:
// FE gửi quick action → ChatModule nhận → gọi PetService

petService.updateMood(userId, 'happy', 'Chủ vườn đã xử lý sâu bệnh!');

// Khi quick action "Ghi nhật ký nhanh" được trigger từ chat:
// → Tạo diary log → DiaryService trigger streak update → PetService tự cập nhật mood
```

### 10.3 Mood Rules (từ core_features_spec.md — không thay đổi)

| Mood | Condition |
|---|---|
| `excited` | streak >= 7, 14, hoặc 30 ngày |
| `happy` | ghi nhật ký trong 24h qua |
| `neutral` | chưa ghi trong 24–36h |
| `sad` | chưa ghi > 36h |
| `worried` | PlantScan trả bệnh nặng (confidence >= 0.7) |

---

## 11. MongoDB Collections

### ai_chats

```javascript
{
  _id:       ObjectId,
  user_id:   String,       // UUID from Supabase Auth
  session_id: String,      // UUID, unique per session
  title:     String,       // Auto-generated từ first user message (first 50 chars)
  messages: [{
    // [FIX #5] message_id added — required for feedback to reference a specific message
    // FE uses (session_id + message_id) to submit feedback for a specific assistant turn.
    message_id:     String,  // UUID or ObjectId string, unique within session
    role:           String,  // 'user' | 'assistant'
    content:        String,
    model:          String,  // 'gemini-1.5-flash' | null (for user messages)
    tokens:         Number,
    latency_ms:     Number,
    prompt_version: String,  // 'v1.0'
    rate_limited:   Boolean,
    timestamp:      ISODate,
  }],
  created_at: ISODate,
  updated_at: ISODate,
}

// Indexes:
db.ai_chats.createIndex({ user_id: 1, updated_at: -1 });
db.ai_chats.createIndex({ session_id: 1 }, { unique: true });
db.ai_chats.createIndex(             // TTL 90 ngày
  { created_at: 1 },
  { expireAfterSeconds: 7776000 }
);
```

### ai_feedback

> **[FIX #5]** `mongo_chat_id` renamed to `message_id` + `session_id` pair.
> Since messages are subdocuments inside `ai_chats`, we reference by `(session_id, message_id)` for clarity.
> This also overrides the `mongoChatId` camelCase field in `ai_chat_spec.md` — see API Casing note below.

```javascript
{
  _id:            ObjectId,
  session_id:     String,   // ai_chats.session_id — which session contains the rated message
  message_id:     String,   // message subdocument's message_id — which specific message was rated
  user_id:        String,
  rating:         Number,   // 1–5
  helpful:        Boolean,
  comment:        String,
  model_used:     String,
  prompt_version: String,
  created_at:     ISODate,
}

// Không TTL — permanent research data
db.ai_feedback.createIndex({ user_id: 1, created_at: -1 });
db.ai_feedback.createIndex({ prompt_version: 1 });
db.ai_feedback.createIndex({ session_id: 1, message_id: 1 });
```

### plant_scans

```javascript
{
  _id:      ObjectId,
  user_id:  String,
  image_url: String,        // R2 signed URL
  p_hash:   String,         // pHash của ảnh
  crop_type: String,
  diagnosis: {
    disease:               String,
    confidence:            Number,
    symptoms:              [String],
    treatment: {
      chemical:            String,
      organic:             String,
      phi_warning:         String,
    },
    safety_alert:          String,
    low_confidence_warning: String,
  },
  model_used:           String,  // 'gemini-1.5-flash-vision'
  vision_prompt_version: String,
  cached:               Boolean,
  created_at:           ISODate,
}

// Indexes:
db.plant_scans.createIndex({ user_id: 1, created_at: -1 });
db.plant_scans.createIndex({ p_hash: 1 });
```

### weekly_insights

```javascript
{
  _id:             ObjectId,
  user_id:         String,
  insight_text:    String,
  model_used:      String,
  tokens_used:     Number,
  prompt_version:  String,
  delivery_status: String,  // 'delivered' | 'failed'
  user_rating:     Number,  // 1–5, set sau khi user rate
  week_start_date: ISODate,
  created_at:      ISODate,
}

db.weekly_insights.createIndex({ user_id: 1, week_start_date: -1 });
```

---

## 12. Environment Variables

```bash
# MongoDB (primary DB — all business data)
MONGODB_URI=mongodb+srv://...

# Supabase Postgres + pgvector only (search index only, NOT primary DB)
SUPABASE_DB_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Gemini
GEMINI_API_KEY=...

# RAG Config (tunable without redeploy)
RAG_MIN_SCORE=0.5
RAG_TOP_K=6

# [FIX #1] Gemini model names — do NOT hard-code in source files, read from env instead
GEMINI_CHAT_MODEL=gemini-1.5-flash
GEMINI_VISION_MODEL=gemini-1.5-flash
GEMINI_EMBED_MODEL=text-embedding-004

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_PRIVATE=farmdiaries-private
R2_BUCKET_PUBLIC=farmdiaries-public

# Scan limits
SCAN_DAILY_LIMIT_FREE=3
SCAN_DAILY_LIMIT_PREMIUM=10
```

---

## 13. Error Codes

Nhất quán với `auth_spec.md` error format:

```json
{
  "success":    false,
  "statusCode": 429,
  "errorCode":  "SCAN_QUOTA_EXCEEDED",
  "message":    "Đã dùng hết 3 lượt quét hôm nay.",
  "timestamp":  "2026-06-10T08:00:00Z"
}
```

| HTTP | errorCode | Nguyên nhân | FE xử lý |
|---|---|---|---|
| 429 | `SCAN_QUOTA_EXCEEDED` | Vượt scan limit ngày | Bottom sheet "Hết lượt hôm nay" |
| 422 | `SCAN_IMAGE_BLURRY` | Laplacian < 100 | Bottom sheet "Ảnh mờ, chụp lại" |
| 400 | `SCAN_INVALID_FILE` | Sai type/size | Toast lỗi |
| 200 | — (field `rate_limited: true`) | Flash RPM limit | Toast "AI bận, thử lại sau" |
| 429 | `SNAP_QUOTA_EXCEEDED` | Vượt snap limit ngày | Bottom sheet |
| 500 | `LLM_ERROR` | Gemini unreachable sau retry | Toast + log |

---

## 13b. API Casing — Consistency Note

> **[FIX #12] This spec overrides older camelCase DTO examples in `ai_chat_spec.md`.**
>
> | Rule | Detail |
> |---|---|
> | **All external REST API payloads** | Use `snake_case` (request body, response body) |
> | **Internal TypeScript interfaces** | May use `camelCase` (services, repositories) |
> | **Overridden fields** | `sessionId` → `session_id`, `mongoChatId` → `message_id` + `session_id`, `createdAt` → `created_at` |
>
> Agent implementors: if you see `sessionId` or `mongoChatId` in old spec examples, use the `snake_case` version defined here.

---

## 14. Build Order

| # | Task | Phase | Notes |
|---|---|---|---|
| 1 | pgvector schema (với `chunk_index`) | 1 | Chạy migration trước mọi thứ |
| 2 | `RateLimiterService` (Lua script, generic) | 1 | Dùng bởi LLM + Scan + Snap |
| 3 | `LLMModule` (Flash + Embed, rate limit, retry, logging) | 1 | Foundation cho mọi AI feature |
| 4 | `PromptModule` (builder + sanitize + PROMPT_LIMITS) | 1 | Pure builder, không dependency phức tạp |
| 5 | `ChatModule` — basic (no RAG, no SSE) | 1 | Verify LLM + Prompt hoạt động |
| 6 | `EmbeddingModule` + `EmbedWorker` (BullMQ, chunk strategy) | 2 | Cần LLMModule xong trước |
| 7 | `PgvectorRepository` (upsert với chunk_index, searchSimilar) | 2 | Cần migration #1 |
| 8 | `RAGModule` (retrieve, cache split, fallback) | 2 | Cần EmbeddingModule |
| 9 | Wire RAG vào ChatModule | 2 | Upgrade ChatModule |
| 10 | SSE streaming endpoint | 2 | Upgrade ChatModule |
| 11 | `PlantScanModule` (full pipeline + guardrail + pHash) | 3 | Cần LLMModule + R2 config |
| 12 | `WeeklyInsightModule` (cron + BullMQ + spread) | 3 | Cần RAGModule |
| 13 | Prompt versioning + A/B logging | 4 | Thêm sau khi có production data |

---

## 15. Testing Checklist

### LLMModule

- [ ] **TC-LLM-01:** Flash limit hit → trả `LLM_FALLBACK_MESSAGE`, `rateLimited: true`, HTTP 200, log event
- [ ] **TC-LLM-02:** Gemini 429 → retry 3 lần exponential backoff → sau đó trả fallback
- [ ] **TC-LLM-03:** Gemini `finishReason: 'SAFETY'` → trả safety message + ghi `audit_log`
- [ ] **TC-LLM-04:** Mỗi complete() call → log `promptTokens`, `completionTokens`, `latencyMs`, `promptVersion`
- [ ] **TC-LLM-05:** limit hit & `onRateLimit: 'throw'` → throw `LLMRateLimitedException`

### RateLimiterService

- [ ] **TC-RATE-01:** `consume()` với Lua script → atomic (không race condition dù 10 concurrent calls)
- [ ] **TC-RATE-02:** Key mới → EXPIRE được set đúng `windowSeconds`
- [ ] **TC-RATE-03:** `consume()` trả `remaining` và `resetAt` đúng

### EmbeddingModule

- [ ] **TC-EMBED-01:** notes < 20 chars → không enqueue job
- [ ] **TC-EMBED-02:** notes = 50 chars → 1 row trong pgvector với `chunk_index = 0`
- [ ] **TC-EMBED-03:** notes = 600 chars → nhiều rows với `chunk_index` tăng dần
- [ ] **TC-EMBED-04:** Diary update notes → rows cũ `is_active = false` trước khi rows mới insert
- [ ] **TC-EMBED-05:** Diary soft-delete → tất cả rows của diary đó `is_active = false`
- [ ] **TC-EMBED-06:** Upsert cùng `(source_id, source_type, chunk_index)` → không tạo duplicate
- [ ] **TC-EMBED-07:** pgvector table chỉ có đúng các columns trong schema — không có business columns

### RAGModule

- [ ] **TC-RAG-01:** pgvector trả 0 results → `has_context: false`, Gemini vẫn được gọi
- [ ] **TC-RAG-02:** Knowledge cache hit → không gọi MongoDB lần 2 (verify mock)
- [ ] **TC-RAG-03:** Diary content KHÔNG nằm trong knowledge cache (key khác nhau)
- [ ] **TC-RAG-04:** Context string bị truncate tại `maxContextChars = 6000`

### ChatModule

- [ ] **TC-CHAT-01:** Không có `session_id` → tạo session mới trong MongoDB
- [ ] **TC-CHAT-02:** Câu hỏi không liên quan → AI từ chối (verify trong response text)
- [ ] **TC-CHAT-03:** `prompt_version` được log trong mỗi message document
- [ ] **TC-CHAT-04:** Chat history bị giới hạn `historyTurns = 6` (không inject toàn bộ)
- [ ] **TC-CHAT-05:** Gửi `[SYSTEM]` trong content → bị sanitize thành `[SYS-BLOCKED]`
- [ ] **TC-CHAT-06:** SSE stream → client nhận `chunk` events, cuối cùng `done` event
- [ ] **TC-CHAT-07:** SSE stream rate-limited → trả 1 chunk fallback, `done` event có `rate_limited: true`

### PlantScanModule

- [ ] **TC-SCAN-01:** File > 5MB → reject ở Multer trước khi xử lý
- [ ] **TC-SCAN-02:** Magic bytes mismatch → 400 `SCAN_INVALID_FILE`
- [ ] **TC-SCAN-03:** Laplacian < 100 → 422 `SCAN_IMAGE_BLURRY`, Gemini không được gọi
- [ ] **TC-SCAN-04:** 2 ảnh pHash distance < 10 trong 7 ngày → trả cached result, Gemini không được gọi
- [ ] **TC-SCAN-05:** Vượt 3 scans/ngày → 429 `SCAN_QUOTA_EXCEEDED`
- [ ] **TC-SCAN-06:** Kết quả có từ "phun thuốc" → `phi_warning` được set
- [ ] **TC-SCAN-07:** Kết quả có tên thuốc cấm → `safety_alert` được set
- [ ] **TC-SCAN-08:** `confidence < 0.6` → `low_confidence_warning` được set

### WeeklyInsightModule

- [ ] **TC-INSIGHT-01:** 100 users → jobs được spread trong 7200000ms (verify delay values)
- [ ] **TC-INSIGHT-02:** User không có diary trong tuần → job return early, không gọi Gemini
- [ ] **TC-INSIGHT-03:** Flash rate-limited → job không complete, BullMQ retry

---

*FarmDiaries AI — Backend AI Feature Specification v1.0*
*Consistent với: ai_chat_spec.md · embedding_spec.md · core_features_spec.md · blueprint.md v6.0 · api_wiring*