# FarmDiaries AI — RAG & Vector Search Architecture
### MongoDB Primary · pgvector Search Index · text-embedding-004 · BullMQ Async

| Thuộc tính | Giá trị |
|---|---|
| **Dự án** | FarmDiaries AI (SDN392 Capstone Project) |
| **Tài liệu** | RAG & Vector Search Architecture |
| **Đường dẫn** | `openspec/specs/embedding_spec.md` |
| **Trạng thái** | Active · specs folder |

---

## Architectural Decision

MongoDB is the **primary database** for all application data — users, diary entries, chat sessions, pet states, farm snaps, reminders, audit logs, knowledge chunks, and all other business entities. pgvector (PostgreSQL extension) serves **exclusively as a vector search index**: it stores `(embedding vector, source_id, source_type, minimal metadata)` only, with no business data. MongoDB is always the source of truth. pgvector is a **derived, rebuildable index** — if lost, it can be fully reconstructed from MongoDB at any time by re-running the embed pipeline. This architecture was chosen over MongoDB Atlas Vector Search for performance and cost reasons detailed in the [Why pgvector](#5-why-pgvector-over-atlas-vector-search) section below.

---

## 1. Mục đích & Phạm vi (Purpose & Scope)

`AiModule` (Shared AI Infrastructure) là hạ tầng trung tâm chứa `EmbeddingProcessor` chịu trách nhiệm **chuyển đổi văn bản thành vector 768 chiều** bằng Google `text-embedding-004` và ghi kết quả vào pgvector search index. Module này là nền tảng dùng chung cho toàn bộ tính năng RAG của hệ thống, hoàn toàn tách biệt khỏi các module nghiệp vụ như `ChatModule`.

Generic Worker trong module này phục vụ nhiều nguồn dữ liệu (đa source):
1. **Diary Entries** — Nhật ký nông trại của nông dân (real-time, async via BullMQ)
2. **Knowledge Docs** — Tài liệu kỹ thuật nông nghiệp do Admin upload (batch embed)
3. **PlantScan** / Other Sources (mở rộng sau này)

---

## 2. pgvector Schema (Search Index Only)

pgvector hosts **one table only**. No business data lives here.

```sql
-- pgvector: SEARCH INDEX ONLY — not a business database
-- Source of truth for all content is MongoDB.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   TEXT NOT NULL,        -- MongoDB _id (ObjectId as string)
  source_type TEXT NOT NULL,        -- 'diary_entry' | 'knowledge_chunk'
  chunk_index INT NOT NULL DEFAULT 0, -- index of chunk in document
  embedding   vector(768) NOT NULL, -- text-embedding-004 output
  metadata    JSONB,                -- minimal: { cropType, userId, chunkIndex }
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- UNIQUE index for multi-chunking per document
CREATE UNIQUE INDEX uq_embeddings_source_chunk
  ON embeddings (source_id, source_type, chunk_index);


-- HNSW index for fast ANN search (< 10ms p99)
CREATE INDEX ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Composite index for active-only RAG queries
CREATE INDEX idx_embeddings_active
  ON embeddings (source_type, is_active)
  WHERE is_active = TRUE;

-- Lookup by MongoDB source ID (for deactivate / rebuild)
CREATE INDEX idx_embeddings_source
  ON embeddings (source_id, source_type);
```

> **Rule:** No other tables exist in pgvector. Users, diaries, reminders, pet state, chat sessions, farm snaps, weekly insights, audit logs — ALL live in MongoDB.

---

## 3. Chiến lược Phân đoạn Văn bản (Chunk Strategy)

### 3.1 Quy tắc chung

```typescript
function preprocessText(text: string): string {
  return text.trim().replace(/\s+/g, ' '); // Normalize whitespace
}
```

### 3.2 Phân đoạn Diary Notes

| Điều kiện | Chiến lược | Mô tả |
|---|---|---|
| `notes.length < 20` chars (sau trim) | **Skip** | Văn bản quá ngắn, không có giá trị semantic. |
| `20 <= notes.length < 500` chars | **Embed toàn bộ** | Coi toàn bộ `notes` là 1 chunk duy nhất. |
| `notes.length >= 500` chars | **Sliding Window** | Chia thành các chunk 300 chars, bước trượt 100 chars. Tối đa 10 chunks/entry. |

```typescript
function chunkText(text: string): string[] {
  const WINDOW = 300;
  const STEP = 100;
  const MAX_CHUNKS = 10;

  if (text.length < 20) return [];
  if (text.length < 500) return [text];

  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS; i += STEP) {
    chunks.push(text.slice(i, i + WINDOW));
  }
  return chunks;
}
```

### 3.3 Phân đoạn Knowledge Docs

- **Window size:** 500 chars
- **Step size:** 150 chars (overlap 350 chars)
- **Tối đa:** 50 chunks/document

---

## 4. RAG Flow — Step by Step

```
User sends message
        │
        ▼
EmbeddingService.embed(message)
  → Google text-embedding-004 → vector[768]
        │
        ▼
pgvector: SELECT source_id, source_type, metadata
  FROM embeddings
  WHERE is_active = TRUE
  ORDER BY embedding <=> $queryVector
  LIMIT 10
  → Returns [ { source_id, source_type, metadata } ] (IDs only, no content)
        │
        ▼
MongoDB: fetch full documents by IDs
  diary_entries.findByIds(diarySourceIds)
  knowledge_chunks.findByIds(knowledgeSourceIds)
  → Returns full text content, metadata, crop context
        │
        ▼
RAGService.assembleContext(docs)
  → Build context string from fetched documents
        │
        ▼
PromptService.build(systemPrompt, userMessage, context)
        │
        ▼
LLMModule → Gemini Flash → response
        │
        ▼
MongoDB: save chat turn to chat_sessions
        │
        ▼
Return answer to user
```

### 4.1 RAG Query — Code

```typescript
// rag.service.ts
@Injectable()
export class RAGService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly pgvectorRepo: PgvectorRepository,   // pgvector search only
    private readonly diaryRepo: DiaryRepository,          // MongoDB
    private readonly knowledgeRepo: KnowledgeChunkRepository, // MongoDB
  ) {}

  async retrieveContext(userMessage: string, userId: string): Promise<RAGContext> {
    // Step 1: Embed the query
    const queryVector = await this.embeddingService.embed(userMessage);

    // Step 2: pgvector search — returns IDs only
    const hits = await this.pgvectorRepo.searchSimilar(queryVector, {
      limit: 10,
      minScore: 0.7,
      filter: { isActive: true },
    });
    // hits = [{ source_id, source_type, score, metadata }]

    // Step 3: Fetch full documents from MongoDB by ID
    const diaryIds = hits
      .filter(h => h.source_type === 'diary_entry')
      .map(h => h.source_id);
    const knowledgeIds = hits
      .filter(h => h.source_type === 'knowledge_chunk')
      .map(h => h.source_id);

    const [diaryDocs, knowledgeDocs] = await Promise.all([
      this.diaryRepo.findByIds(diaryIds, userId),
      this.knowledgeRepo.findByIds(knowledgeIds),
    ]);

    // Step 4: Assemble context for LLM
    return this.assembleContext(diaryDocs, knowledgeDocs, hits);
  }

  private assembleContext(diaries: DiaryEntry[], knowledge: KnowledgeChunk[], hits: SearchHit[]): RAGContext {
    const contextParts: string[] = [];

    for (const hit of hits) {
      if (hit.source_type === 'diary_entry') {
        const doc = diaries.find(d => d._id.toString() === hit.source_id);
        if (doc) contextParts.push(`[Nhật ký ${doc.createdAt.toLocaleDateString()}] ${doc.notes}`);
      } else if (hit.source_type === 'knowledge_chunk') {
        const doc = knowledge.find(k => k._id.toString() === hit.source_id);
        if (doc) contextParts.push(`[Tài liệu kỹ thuật: ${doc.title}] ${doc.chunkText}`);
      }
    }

    return {
      contextText: contextParts.join('\n\n'),
      citations: hits.map(h => ({ sourceId: h.source_id, sourceType: h.source_type, score: h.score })),
    };
  }
}
```

---

## 5. Cơ chế Kích hoạt (Trigger Mechanism)

### 5.1 Trigger khi tạo Diary Entry mới (Dual Write)

```typescript
// DiaryService.create() — MongoDB save FIRST, pgvector embed ASYNC
async create(dto: CreateDiaryDto, userId: string): Promise<DiaryEntry> {
  // Step 1: Save to MongoDB (source of truth)
  const newEntry = await this.diaryRepo.create({ ...dto, userId });

  // Step 2: Enqueue embedding job (async — failure does NOT affect data integrity)
  await this.embedQueue.add(
    'embed_document',
    { sourceId: newEntry._id.toString(), sourceType: 'diary_entry', text: newEntry.notes, metadata: { userId, cropType: newEntry.cropType } },
    { priority: 3, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  );
  // Queue: 'embed_queue' | Priority: 3 (lower than chat=1 and plant-scan=2)

  return newEntry;
}
```

> **Dual Write Pattern:** MongoDB write is synchronous and guaranteed. pgvector embed is async via BullMQ. If the embed job fails, data is safe in MongoDB — only search coverage is temporarily reduced. The job will be retried up to 3 times with exponential backoff.

### 5.2 Trigger khi cập nhật Diary Entry

```typescript
// DiaryService.update() — re-embed only if 'notes' or 'cropType' changed
const shouldReEmbed = (
  updateDto.notes !== undefined ||
  updateDto.cropType !== undefined
);

if (shouldReEmbed) {
  // 1. Soft-deactivate old embeddings in pgvector
  await this.pgvectorRepo.deactivateBySourceId(diaryId);
  // 2. Enqueue re-embed job
  await this.embedQueue.add('embed_document', { sourceId: diaryId, sourceType: 'diary_entry', text: updateDto.notes, metadata: { userId, cropType: updateDto.cropType } }, { priority: 3 });
}
```

> **Lý do dùng `is_active = false` thay vì DELETE ngay:** Tránh race condition nếu RAG query đang chạy song song. Background cleanup job sẽ DELETE các bản ghi `is_active = false` sau 24 giờ.

### 5.3 Trigger khi Soft-delete Diary Entry

```typescript
// DiaryService.softDelete() — deactivate embeddings in pgvector
await this.pgvectorRepo.deactivateBySourceId(diaryId);
// MongoDB diary document is soft-deleted separately
// No new embed job needed — cascade deactivate is sufficient
```

### 5.4 Trigger khi Admin upload Knowledge Doc

```typescript
// KnowledgeService.create() — save to MongoDB, then embed async
const newDoc = await this.knowledgeRepo.create(dto);
await this.embedQueue.add(
  'embed_document',
  { sourceId: newDoc._id.toString(), sourceType: 'knowledge_chunk', text: newDoc.content, metadata: { title: newDoc.title } },
  { priority: 5, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
);
// Priority 5 (lowest) — batch embed is not urgent
```

---

## 6. EmbedWorker — Xử lý BullMQ Job

```typescript
@Processor('embed_queue')
export class EmbeddingProcessor {
  constructor(
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly chunkingService: ChunkingService,
    private readonly pgvectorRepo: PgvectorRepository,
  ) {}

  @Process('embed_document')
  async handleEmbed(job: Job<EmbeddingPayload>) {
    const { sourceId, sourceType, text, metadata } = job.data;
    if (!text) return;

    const chunks = this.chunkingService.chunkText(text, sourceType);
    if (chunks.length === 0) return;

    // Embed each chunk and write to pgvector
    for (let i = 0; i < chunks.length; i++) {
      const vector = await this.embeddingProvider.embed(chunks[i]);
      await this.pgvectorRepo.upsert({
        sourceId,
        sourceType,
        embedding: vector,
        metadata: {
          ...metadata,
          chunkIndex: i,
        },
        isActive: true,
      });
    }
  }
}
```

---

## 7. pgvector Repository Interface

```typescript
// pgvector.repository.ts — search index adapter only
@Injectable()
export class PgvectorRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async searchSimilar(
    vector: number[],
    opts: { limit: number; minScore: number; filter?: { isActive?: boolean } },
  ): Promise<SearchHit[]> {
    const rows = await this.ds.query(`
      SELECT source_id, source_type, metadata,
             1 - (embedding <=> $1::vector) AS score
      FROM embeddings
      WHERE is_active = TRUE
        AND 1 - (embedding <=> $1::vector) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [JSON.stringify(vector), opts.minScore, opts.limit]);
    return rows;
  }

  async upsert(data: EmbeddingUpsert): Promise<void> {
    await this.ds.query(`
      INSERT INTO embeddings (source_id, source_type, chunk_index, embedding, metadata, is_active)
      VALUES ($1, $2, $3, $4::vector, $5, $6)
      ON CONFLICT (source_id, source_type, chunk_index)
        DO UPDATE SET embedding = EXCLUDED.embedding,
                      metadata = EXCLUDED.metadata,
                      is_active = EXCLUDED.is_active,
                      created_at = now()
    `, [data.sourceId, data.sourceType, data.chunkIndex, JSON.stringify(data.embedding), data.metadata, data.isActive]);
  }

  async deactivateBySourceId(sourceId: string): Promise<void> {
    await this.ds.query(
      `UPDATE embeddings SET is_active = FALSE WHERE source_id = $1`,
      [sourceId],
    );
  }

  async rebuildFromIds(sourceIds: string[]): Promise<void> {
    // Used for full index rebuild from MongoDB — re-queue embed jobs
    for (const id of sourceIds) {
      await this.embedQueue.add('embed_diary', { diaryId: id });
    }
  }
}
```

---

## 8. Why pgvector Over Atlas Vector Search

| Criterion | pgvector (self-hosted) | MongoDB Atlas Vector Search |
|---|---|---|
| **Latency** | < 10ms p99 (HNSW in-process) | 50–200ms (Atlas Search is a separate Lucene layer + round trip) |
| **Cost** | Free — runs in same Docker container as any Postgres instance | Requires M10+ cluster ($57/month minimum) to enable Atlas Search |
| **Local dev** | `docker run ankane/pgvector` — zero config | Requires Atlas cloud account; local Vector Search not available |
| **Vendor lock-in** | None — open-source pgvector, standard SQL | Locked to MongoDB Atlas tier with Search enabled |
| **Index control** | Full HNSW parameter tuning (m, ef_construction, ef_search) | Limited parameter exposure |
| **Rebuild** | `TRUNCATE embeddings; re-run embed jobs` | Requires Atlas Search index rebuild via UI/API |

### Summary
pgvector provides **sub-10ms HNSW search** with zero additional cost on top of the existing Postgres instance, vs Atlas Vector Search's 50–200ms round-trip and $57+/month tier requirement. For a capstone project with a free-tier budget, pgvector is the correct choice. MongoDB remains the single source of truth for all business data; pgvector is purely a fast search accelerator.

---

## 9. Tradeoffs & Reviewer Notes

### 9.1 Dual Write on Diary Create
- **Flow:** `MongoDB.save()` (sync, guaranteed) → `BullMQ.enqueue(embed_job)` (async)
- **Failure mode:** If the embed job fails permanently (after 3 retries), the diary entry is safe in MongoDB. Only search coverage is reduced — the user's data is never lost.
- **Recovery:** Re-queue the embed job manually or via a nightly "gap fill" cron that checks for diary entries without active embeddings.

### 9.2 pgvector is a Derived Index
- pgvector can be **fully rebuilt from MongoDB at any time** by fetching all active diary entries and knowledge chunks and re-running the embed pipeline.
- Rebuild command: `npm run embed:rebuild` (queues embed jobs for all MongoDB documents in batches).
- This means pgvector downtime is non-critical — MongoDB data is always intact.

### 9.3 Slightly More Infrastructure
- Running pgvector requires a Postgres container alongside MongoDB and Redis.
- Docker Compose adds one service: `db-vector` (ankane/pgvector image).
- No additional managed service cost; runs locally and on Railway/Render free tier.

### 9.4 Justification for Reviewers
> **MongoDB is the primary database.** All business entities (users, diaries, chat sessions, pet states, reminders, snaps, audit logs) live exclusively in MongoDB collections. pgvector is used only as a vector search index — it stores `(embedding, source_id, source_type, metadata)` and nothing else. The architectural relationship is: **MongoDB = source of truth, pgvector = derived search accelerator**. Any reviewer reading a pgvector table that contains users, diary content, or other business data should flag it as a violation of this spec.

<!-- REVIEWER FLAG: If any section of the codebase stores business entities (users, diaries, pet_state, reminders, etc.) in pgvector/PostgreSQL tables, that is a spec violation. pgvector must only contain the `embeddings` table. -->

---

## 10. Kịch bản Kiểm thử (Testing Checklist)

- [ ] **TC-EMBED-01:** Tạo diary entry với `notes = "Tưới"` (< 20 chars) → Verify **không có** bản ghi nào được insert vào bảng `embeddings` trong pgvector.
- [ ] **TC-EMBED-02:** Tạo diary entry với notes bình thường (50 chars) → Verify BullMQ job được thêm vào `embed_queue` với `priority=3`, sau đó 1 bản ghi embedding được tạo trong pgvector `embeddings` table.
- [ ] **TC-EMBED-03:** Tạo diary entry với notes dài 600 chars → Verify có **nhiều hơn 1** bản ghi embedding (sliding window chunks) trong pgvector.
- [ ] **TC-EMBED-04:** PUT `/diary/:id` thay đổi `notes` → Verify bản ghi cũ trong pgvector bị đánh dấu `is_active=false` trước khi embedding mới được tạo.
- [ ] **TC-EMBED-05:** DELETE `/diary/:id` (soft delete trong MongoDB) → Verify toàn bộ embeddings của diary đó trong pgvector bị đánh dấu `is_active=false`.
- [ ] **TC-EMBED-06:** Admin upload Knowledge Doc → Verify job `embed_document` được push vào queue với `priority=5`.
- [ ] **TC-EMBED-07:** RAG query trong chat → Verify chỉ trả về kết quả có `is_active=TRUE` và full document content được fetch từ MongoDB (not from pgvector).
- [ ] **TC-EMBED-08:** pgvector `embeddings` table has NO columns beyond `(id, source_id, source_type, embedding, metadata, is_active, created_at)` → Verify no business data in pgvector.
- [ ] **TC-EMBED-09:** Rebuild test — truncate pgvector `embeddings` → run `embed:rebuild` → Verify all diary entries and knowledge chunks re-indexed from MongoDB.
