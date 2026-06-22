import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface UpsertEmbeddingDto {
  sourceId: string;
  sourceType: string;
  chunkIndex: number;
  text: string;
  contentHash?: string;
  vector: number[];
  metadata?: Record<string, any>;
  isActive?: boolean;
}

export interface SearchHit {
  source_id: string;
  source_type: string;
  metadata: Record<string, any>;
  score: number;
}

@Injectable()
export class EmbeddingRepository {
  constructor(private readonly dataSource: DataSource) {}

  async upsert(dto: UpsertEmbeddingDto): Promise<void> {
    const vectorString = `[${dto.vector.join(',')}]`;
    const metadataString = dto.metadata ? JSON.stringify(dto.metadata) : null;
    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    await this.dataSource.query(
      `INSERT INTO "embeddings" ("source_id", "source_type", "chunk_index", "text", "content_hash", "embedding", "metadata", "is_active")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ("source_id", "source_type", "chunk_index")
       DO UPDATE SET 
         "text" = EXCLUDED."text",
         "content_hash" = EXCLUDED."content_hash",
         "embedding" = EXCLUDED."embedding",
         "metadata" = EXCLUDED."metadata",
         "is_active" = EXCLUDED."is_active",
         "created_at" = now()`,
      [dto.sourceId, dto.sourceType, dto.chunkIndex, dto.text, dto.contentHash || null, vectorString, metadataString, isActive],
    );
  }

  async upsertMany(dtos: UpsertEmbeddingDto[]): Promise<void> {
    if (dtos.length === 0) return;
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      for (const dto of dtos) {
        const vectorString = `[${dto.vector.join(',')}]`;
        const metadataString = dto.metadata ? JSON.stringify(dto.metadata) : null;
        const isActive = dto.isActive !== undefined ? dto.isActive : true;

        await queryRunner.query(
          `INSERT INTO "embeddings" ("source_id", "source_type", "chunk_index", "text", "content_hash", "embedding", "metadata", "is_active")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ("source_id", "source_type", "chunk_index")
           DO UPDATE SET 
             "text" = EXCLUDED."text",
             "content_hash" = EXCLUDED."content_hash",
             "embedding" = EXCLUDED."embedding",
             "metadata" = EXCLUDED."metadata",
             "is_active" = EXCLUDED."is_active",
             "created_at" = now()`,
          [dto.sourceId, dto.sourceType, dto.chunkIndex, dto.text, dto.contentHash || null, vectorString, metadataString, isActive],
        );
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async deactivateBySourceId(sourceId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE "embeddings" SET "is_active" = false WHERE "source_id" = $1`,
      [sourceId],
    );
  }

  async searchSimilar(
    vector: number[],
    opts: { limit: number; minScore: number; filter?: { isActive?: boolean } },
  ): Promise<SearchHit[]> {
    const vectorString = `[${vector.join(',')}]`;
    const rows = await this.dataSource.query(
      `SELECT source_id, source_type, metadata,
              1 - (embedding <=> $1::vector) AS score
       FROM "embeddings"
       WHERE is_active = $2
         AND 1 - (embedding <=> $1::vector) >= $3
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [vectorString, opts.filter?.isActive ?? true, opts.minScore, opts.limit],
    );
    return rows;
  }
}
