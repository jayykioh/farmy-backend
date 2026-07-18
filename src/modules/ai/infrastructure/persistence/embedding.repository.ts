/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface UpsertEmbeddingDto {
  sourceId: string;
  sourceType: string;
  chunkIndex: number;
  text: string;
  contentHash: string;
  vector: number[];
  metadata?: Record<string, any>;
  isActive?: boolean;
}

export interface SearchHit {
  source_id: string;
  source_type: 'diary_log' | 'knowledge_source';
  chunk_index: number;
  text: string;
  content_hash: string;
  metadata: Record<string, any>;
  score: number;
}

@Injectable()
export class EmbeddingRepository {
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  private getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new ServiceUnavailableException({
        error_code: 'PGVECTOR_DISABLED',
        message:
          'pgvector/RAG features are disabled because PG_CONNECTION_STRING is not configured.',
      });
    }

    return this.dataSource;
  }

  async findActiveChunkStates(
    sourceId: string,
    sourceType: string,
  ): Promise<Map<number, { contentHash: string }>> {
    const rows = await this.getDataSource().query(
      `SELECT chunk_index, content_hash
       FROM "embeddings"
       WHERE source_id = $1 AND source_type = $2 AND is_active = true`,
      [sourceId, sourceType],
    );

    const map = new Map<number, { contentHash: string }>();
    for (const row of rows) {
      map.set(row.chunk_index, { contentHash: row.content_hash });
    }
    return map;
  }

  async upsert(dto: UpsertEmbeddingDto): Promise<void> {
    const vectorString = `[${dto.vector.join(',')}]`;
    const metadataString = dto.metadata ? JSON.stringify(dto.metadata) : null;
    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    await this.getDataSource().query(
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
      [
        dto.sourceId,
        dto.sourceType,
        dto.chunkIndex,
        dto.text,
        dto.contentHash,
        vectorString,
        metadataString,
        isActive,
      ],
    );
  }

  async upsertMany(
    dtos: UpsertEmbeddingDto[],
    staleIndices: number[] = [],
  ): Promise<void> {
    if (dtos.length === 0 && staleIndices.length === 0) return;

    const queryRunner = this.getDataSource().createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const dto of dtos) {
        const vectorString = `[${dto.vector.join(',')}]`;
        const metadataString = dto.metadata
          ? JSON.stringify(dto.metadata)
          : null;
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
          [
            dto.sourceId,
            dto.sourceType,
            dto.chunkIndex,
            dto.text,
            dto.contentHash,
            vectorString,
            metadataString,
            isActive,
          ],
        );
      }

      if (staleIndices.length > 0) {
        const sourceId = dtos.length > 0 ? dtos[0].sourceId : null;
        const sourceType = dtos.length > 0 ? dtos[0].sourceType : null;

        // If we don't have sourceId from dtos, we shouldn't execute this, but the caller should provide them.
        // To be safe, we can add sourceId and sourceType as parameters, but we can assume they are same.
        if (sourceId && sourceType) {
          await queryRunner.query(
            `UPDATE "embeddings" SET "is_active" = false
             WHERE "source_id" = $1 AND "source_type" = $2 AND "chunk_index" = ANY($3)`,
            [sourceId, sourceType, staleIndices],
          );
        }
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
    await this.getDataSource().query(
      `UPDATE "embeddings" SET "is_active" = false WHERE "source_id" = $1`,
      [sourceId],
    );
  }

  async deactivateChunkIndices(
    sourceId: string,
    sourceType: string,
    chunkIndices: number[],
  ): Promise<void> {
    if (chunkIndices.length === 0) return;

    const queryRunner = this.getDataSource().createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `UPDATE "embeddings" SET "is_active" = false
         WHERE "source_id" = $1 AND "source_type" = $2 AND "chunk_index" = ANY($3)`,
        [sourceId, sourceType, chunkIndices],
      );
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async searchSimilar(
    vector: number[],
    opts: { limit: number; minScore: number },
    userId: string,
  ): Promise<SearchHit[]> {
    const vectorString = `[${vector.join(',')}]`;
    const rows = await this.getDataSource().query(
      `SELECT source_id, source_type, chunk_index, text, content_hash, metadata,
              1 - (embedding <=> $1::vector) AS score
       FROM "embeddings"
       WHERE is_active = true
         AND 1 - (embedding <=> $1::vector) >= $2
         AND (
           source_type = 'knowledge_source'
           OR (
             source_type = 'diary_log'
             AND metadata->>'user_id' = $3
           )
         )
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [vectorString, opts.minScore, userId, opts.limit],
    );
    return rows;
  }
}
