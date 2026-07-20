import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChunkingService } from '../services/chunking.service';
import type { IEmbeddingProvider } from '../../domain/embedding.types';
import { EmbedDocumentPayload } from '../../domain/embedding.types';
import {
  EmbeddingRepository,
  UpsertEmbeddingDto,
} from '../../infrastructure/persistence/embedding.repository';
import { CHUNKING_PRESETS } from '../../domain/chunking.constants';
import { KnowledgeSourceDocument } from '../../../knowledge/infrastructure/persistence/knowledge-source.schema';
import * as crypto from 'crypto';

@Processor('embedding_queue')
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly chunkingService: ChunkingService,
    @Inject('IEmbeddingProvider')
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly embeddingRepository: EmbeddingRepository,
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly knowledgeModel: Model<KnowledgeSourceDocument>,
  ) {
    super();
  }

  async process(job: Job<EmbedDocumentPayload>): Promise<void> {
    try {
      const { sourceId, sourceType, text, metadata } = job.data;

      if (!text?.trim()) {
        await this.markKnowledgeEmbedStatus(sourceType, sourceId, 'error');
        this.logger.warn(
          `Skipped embedding job ${job.id} for source ${sourceId}: empty text`,
        );
        return;
      }

      const preset = CHUNKING_PRESETS[sourceType] || {
        windowSize: 1000,
        stepSize: 200,
        maxChunks: 10,
        minLength: 0,
      };
      const chunks = this.chunkingService.chunkText(text, preset);

      const activeStates = await this.embeddingRepository.findActiveChunkStates(
        sourceId,
        sourceType,
      );
      const vectorsToUpsert: UpsertEmbeddingDto[] = [];
      const activeChunkIndices = new Set<number>();

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const contentHash = crypto
          .createHash('sha256')
          .update(chunkText)
          .digest('hex');

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
          text: chunkText,
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
          await this.embeddingRepository.deactivateChunkIndices(
            sourceId,
            sourceType,
            staleIndices,
          );
        } else {
          await this.embeddingRepository.upsertMany(
            vectorsToUpsert,
            staleIndices,
          );
        }
      }

      this.logger.log(
        `Successfully processed embedding job ${job.id} for source ${sourceId}`,
      );
      await this.markKnowledgeEmbedStatus(sourceType, sourceId, 'done');
    } catch (error) {
      const err = error as Error;
      await this.markKnowledgeEmbedStatus(
        job.data.sourceType,
        job.data.sourceId,
        'error',
      );
      this.logger.error(
        `Failed to process embedding job ${job.id}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  private async markKnowledgeEmbedStatus(
    sourceType: string,
    sourceId: string,
    status: 'done' | 'error',
  ): Promise<void> {
    if (sourceType !== 'knowledge_source') return;
    await this.knowledgeModel.findByIdAndUpdate(sourceId, { embed_status: status }).exec();
  }
}
