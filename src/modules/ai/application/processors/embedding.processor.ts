import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ChunkingService } from '../services/chunking.service';
import type { IEmbeddingProvider } from '../../domain/embedding.types';
import { EmbedDocumentPayload } from '../../domain/embedding.types';
import { EmbeddingRepository, UpsertEmbeddingDto } from '../../infrastructure/persistence/embedding.repository';
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

      // Default chunking parameters
      const chunks = this.chunkingService.chunkText(text, { windowSize: 1000, stepSize: 200 });
      
      const vectorsToUpsert: UpsertEmbeddingDto[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
         const chunkText = chunks[i];
         const result = await this.embeddingProvider.embed(chunkText);
         const contentHash = crypto.createHash('sha256').update(chunkText).digest('hex');

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
      }

      await this.embeddingRepository.upsertMany(vectorsToUpsert);
      
      this.logger.log(`Successfully processed embedding job ${job.id} for source ${sourceId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process embedding job ${job.id}: ${err.message}`, err.stack);
      throw err;
    }
  }
}
