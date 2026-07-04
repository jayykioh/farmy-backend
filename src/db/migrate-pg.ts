/**
 * migrate-pg.ts
 *
 * One-shot DDL migration for Supabase / Postgres (pgvector).
 * Run via:
 *   npm run db:migrate-pg
 *
 * Idempotent — safe to run multiple times.
 * Uses IF NOT EXISTS and ON CONFLICT clauses throughout.
 *
 * Prerequisites:
 *   - pgvector extension must be available on the Postgres server.
 *   - Set PG_CONNECTION_STRING (or individual PG_HOST / PG_PORT / PG_DATABASE /
 *     PG_USER / PG_PASSWORD) in your .env before running.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env từ root project (2 levels up từ src/db/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { getPgPool, closePgPool } from './pg-client';

const EMBEDDING_DIM = 768; // Gemini text-embedding-004 dimension

async function runMigration(): Promise<void> {
  let connStr = process.env.PG_CONNECTION_STRING || process.env.SUPABASE_DB_URL;
  if (process.env.NODE_ENV === 'test') {
    connStr = process.env.TEST_SUPABASE_DB_URL || connStr;
  }
  process.env.PG_CONNECTION_STRING = connStr;
  const host = process.env.PG_HOST ?? '127.0.0.1';

  console.log('[migrate-pg] PG_CONNECTION_STRING loaded:', connStr ? '✔ YES' : '✘ NO (sẽ dùng PG_HOST)');
  console.log('[migrate-pg] Connecting to:', connStr ? connStr.replace(/:([^:@]+)@/, ':***@') : `${host}:${process.env.PG_PORT ?? 5432}`);

  const pool = getPgPool();
  let client;

  try {
    client = await pool.connect();
    console.log('[migrate-pg] ✔ Kết nối thành công. Bắt đầu migration…');

    // 1. Enable pgvector extension
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log('[migrate-pg] ✔ Extension "vector" ensured.');

    // 2. Create embeddings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id           BIGSERIAL PRIMARY KEY,
        source_id    TEXT        NOT NULL,
        source_type  TEXT        NOT NULL,
        chunk_index  INT         NOT NULL DEFAULT 0,
        text         TEXT        NOT NULL,
        content_hash TEXT,
        embedding    vector(${EMBEDDING_DIM}),
        metadata     JSONB       NOT NULL DEFAULT '{}',
        is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT embeddings_source_chunk_uq
          UNIQUE (source_id, source_type, chunk_index)
      );
    `);
    console.log('[migrate-pg] ✔ Table "embeddings" ensured.');

    // 3. HNSW index for cosine similarity search (pgvector ≥ 0.5)
    await client.query(`
      CREATE INDEX IF NOT EXISTS embeddings_hnsw_cosine_idx
        ON embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    `);
    console.log('[migrate-pg] ✔ HNSW index "embeddings_hnsw_cosine_idx" ensured.');

    // 4. Partial index for is_active filter
    await client.query(`
      CREATE INDEX IF NOT EXISTS embeddings_active_idx
        ON embeddings (is_active)
        WHERE is_active = TRUE;
    `);
    console.log('[migrate-pg] ✔ Partial index "embeddings_active_idx" ensured.');

    // 5. Index on source_id for fast deactivation / lookup
    await client.query(`
      CREATE INDEX IF NOT EXISTS embeddings_source_id_idx
        ON embeddings (source_id);
    `);
    console.log('[migrate-pg] ✔ Index "embeddings_source_id_idx" ensured.');

    console.log('[migrate-pg] ✅ Migration completed successfully.');
  } catch (error) {
    const err = error as Error;
    console.error('[migrate-pg] ❌ Migration failed!');
    console.error('[migrate-pg] Error message:', err.message);
    console.error('[migrate-pg] Full error:', err);
    throw error;
  } finally {
    if (client) client.release();
    await closePgPool();
  }
}

runMigration().catch(() => process.exit(1));
