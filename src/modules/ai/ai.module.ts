import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { RateLimiterModule } from '../../common/rate-limiter/rate-limiter.module';
import { LLMService } from './application/services/llm.service';
import { PromptService } from './application/services/prompt.service';
import { ChunkingService } from './application/services/chunking.service';
import { ChatService } from './application/services/chat.service';
import { PlantScanService } from './application/services/plant-scan.service';
import { ChatController } from './interface/controllers/chat.controller';
import { PlantScanController } from './interface/controllers/plant-scan.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiChatMemoryDocument,
  AiChatMemorySchema,
} from './infrastructure/persistence/ai-chat-memory.schema';
import { AiChatSchema } from './infrastructure/persistence/ai-chat.schema';
import {
  AiFeedbackDocument,
  AiFeedbackSchema,
} from './infrastructure/persistence/ai-feedback.schema';
import { PlantScanSchema } from './infrastructure/persistence/plant-scan.schema';
import { PetModule } from '../pet/pet.module';
import { DbModule } from '../../db/db.module';

import { EmbeddingRepository } from './infrastructure/persistence/embedding.repository';
import { EmbeddingProcessor } from './application/processors/embedding.processor';
import { AiAdminController } from './application/controllers/ai-admin.controller';
import { DiaryLogDocument, DiaryLogSchema } from '../farm/infrastructure/persistence/diary-log.schema';
import { KnowledgeSourceDocument, KnowledgeSourceSchema } from '../knowledge/infrastructure/persistence/knowledge-source.schema';

@Module({
  imports: [
    RateLimiterModule,
    DbModule,
    PetModule,
    MongooseModule.forFeature([
      { name: AiChatMemoryDocument.name, schema: AiChatMemorySchema },
      { name: 'AiChatDocument', schema: AiChatSchema },
      { name: AiFeedbackDocument.name, schema: AiFeedbackSchema },
      { name: 'PlantScanDocument', schema: PlantScanSchema },
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
  controllers: [ChatController, PlantScanController],
  controllers: [AiAdminController],
  providers: [
    LLMService,
    PromptService,
    ChunkingService,
    EmbeddingRepository,
    EmbeddingProcessor,
    ChatService,
    PlantScanService,
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
    ChatService,
    PlantScanService,
  ],
})
export class AiModule {}
