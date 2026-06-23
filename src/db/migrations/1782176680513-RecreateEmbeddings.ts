import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecreateEmbeddings1782176680513 implements MigrationInterface {
  name = 'RecreateEmbeddings1782176680513';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "embeddings" CASCADE;`);
    
    await queryRunner.query(`
      CREATE TABLE "embeddings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_id" character varying NOT NULL,
        "source_type" character varying NOT NULL CHECK (source_type IN ('diary_log', 'knowledge_source')),
        "chunk_index" integer NOT NULL DEFAULT 0,
        "content_hash" character varying NOT NULL,
        "embedding" vector(768) NOT NULL,
        "metadata" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_embeddings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_embeddings_source_chunk" UNIQUE ("source_id", "source_type", "chunk_index")
      );
    `);
    
    // HNSW index for cosine similarity
    await queryRunner.query(`
      CREATE INDEX "IDX_embeddings_embedding_hnsw"
      ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
    `);
    
    // Composite index for active-only queries
    await queryRunner.query(`
      CREATE INDEX "IDX_embeddings_active"
      ON "embeddings" ("source_type", "is_active")
      WHERE is_active = true;
    `);

    // Lookup by source_id
    await queryRunner.query(`
      CREATE INDEX "IDX_embeddings_source"
      ON "embeddings" ("source_id", "source_type");
    `);

    // User isolation expression index
    await queryRunner.query(`
      CREATE INDEX "IDX_embeddings_diary_owner"
      ON "embeddings" ((metadata->>'user_id'))
      WHERE is_active = true AND source_type = 'diary_log';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "embeddings" CASCADE;`);
  }
}
