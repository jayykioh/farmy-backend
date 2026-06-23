import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ChunkingService } from '../services/chunking.service';
import type { IEmbeddingProvider } from '../../domain/embedding.types';
import { EmbedDocumentPayload } from '../../domain/embedding.types';
import { EmbeddingRepository, UpsertEmbeddingDto } from '../../infrastructure/persistence/embedding.repository';
import { CHUNKING_PRESETS } from '../../domain/chunking.constants';
import * as crypto from 'crypto';

@Processor('embedding_queue')
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly chunkingService: ChunkingService,
    @Inject('IEmbeddingProvider')
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly embeddingRepository: EmbeddingRepository,
  ) {
    super();
  }

  async process(job: Job<EmbedDocumentPayload>): Promise<void> {
    try {
      const { sourceId, sourceType, text, metadata } = job.data;
      
      if (!text) return;

      const preset = CHUNKING_PRESETS[sourceType] || { windowSize: 1000, stepSize: 200, maxChunks: 10, minLength: 0 };
      const chunks = this.chunkingService.chunkText(text, preset);
      
      const activeStates = await this.embeddingRepository.findActiveChunkStates(sourceId, sourceType);
      const vectorsToUpsert: UpsertEmbeddingDto[] = [];
      const activeChunkIndices = new Set<number>();
      
      for (let i = 0; i < chunks.length; i++) {
         const chunkText = chunks[i];
         const contentHash = crypto.createHash('sha256').update(chunkText).digest('hex');
         
         const existing = activeStates.get(i);
         if (existing && existing.contentHash === contentHash) {
            // Unchanged chunk, skip embedding
            activeChunkIndices.add(i);
            continue;
         }

         const result = await this.embeddingProvider.embed(chunkText);

         vectorsToUpsert.push({
           sourceId,
           sourceType,
           chunkIndex: i,
           contentHash,
           vector: result.vector,
           metadata,
           isActive: true,
         });
         activeChunkIndices.add(i);
      }

      // Determine stale chunks
      const staleIndices: number[] = [];
      for (const [index] of activeStates.entries()) {
        if (!activeChunkIndices.has(index)) {
          staleIndices.push(index);
        }
      }

      // We need to pass sourceId/sourceType to upsertMany if dtos is empty but we have staleIndices
      if (vectorsToUpsert.length > 0 || staleIndices.length > 0) {
        // If dtos is empty, we just run deactivate directly since upsertMany might fail to guess sourceId
        if (vectorsToUpsert.length === 0) {
          // Deactivate only
          const queryRunner = this.embeddingRepository['dataSource'].createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();
          try {
            await queryRunner.query(
              `UPDATE "embeddings" SET "is_active" = false 
               WHERE "source_id" = $1 AND "source_type" = $2 AND "chunk_index" = ANY($3)`,
              [sourceId, sourceType, staleIndices]
            );
            await queryRunner.commitTransaction();
          } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
          } finally {
            await queryRunner.release();
          }
        } else {
          await this.embeddingRepository.upsertMany(vectorsToUpsert, staleIndices);
        }
      }
      
      this.logger.log(`Successfully processed embedding job ${job.id} for source ${sourceId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process embedding job ${job.id}: ${err.message}`, err.stack);
      throw err;
    }
  }
}
