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
import { AiAdminController } from './application/controllers/ai-admin.controller';
import {
  DiaryLogDocument,
  DiaryLogSchema,
} from '../farm/infrastructure/persistence/diary-log.schema';
import {
  KnowledgeSourceDocument,
  KnowledgeSourceSchema,
} from '../knowledge/infrastructure/persistence/knowledge-source.schema';

@Module({
  imports: [
    RateLimiterModule,
    MongooseModule.forFeature([
      { name: AiChatMemoryDocument.name, schema: AiChatMemorySchema },
      { name: DiaryLogDocument.name, schema: DiaryLogSchema },
      { name: KnowledgeSourceDocument.name, schema: KnowledgeSourceSchema },
    ]),
    BullModule.registerQueue({
      name: 'embedding_queue',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      },
    }),
  ],
  controllers: [AiAdminController],
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
