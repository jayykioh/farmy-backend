import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmbeddings1717460000000 implements MigrationInterface {
  name = 'CreateEmbeddings1717460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await queryRunner.query(`
      CREATE TABLE "embeddings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_id" character varying NOT NULL,
        "source_type" character varying NOT NULL,
        "chunk_index" integer NOT NULL DEFAULT 0,
        "text" text NOT NULL,
        "content_hash" character varying,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_embeddings_active";`);
    await queryRunner.query(`DROP INDEX "IDX_embeddings_embedding_hnsw";`);
    await queryRunner.query(`DROP TABLE "embeddings";`);
    // Optional: DROP EXTENSION vector; (maybe don't drop extension in down to be safe)
  }
}
