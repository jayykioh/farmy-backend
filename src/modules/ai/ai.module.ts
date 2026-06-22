import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { RateLimiterModule } from '../../common/rate-limiter/rate-limiter.module';
import { LLMService } from './application/services/llm.service';
import { PromptService } from './application/services/prompt.service';
import { ChunkingService } from './application/services/chunking.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiChatMemoryDocument,
  AiChatMemorySchema,
} from './infrastructure/persistence/ai-chat-memory.schema';

import { EmbeddingRepository } from './infrastructure/persistence/embedding.repository';
import { EmbeddingProcessor } from './application/processors/embedding.processor';

@Module({
  imports: [
    RateLimiterModule,
    MongooseModule.forFeature([
      { name: AiChatMemoryDocument.name, schema: AiChatMemorySchema },
    ]),
    BullModule.registerQueue({
      name: 'embedding_queue',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
  ],
  providers: [
    LLMService,
    PromptService,
    ChunkingService,
    EmbeddingRepository,
    EmbeddingProcessor,
    {
      provide: 'IEmbeddingProvider',
      useExisting: LLMService,
    },
  ],
  exports: [
    LLMService,
    PromptService,
    ChunkingService,
    EmbeddingRepository,
    'IEmbeddingProvider',
    MongooseModule,
    BullModule,
  ],
})
export class AiModule {}
