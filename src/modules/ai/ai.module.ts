import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { RateLimiterModule } from '../../common/rate-limiter/rate-limiter.module';
import { LLMService } from './application/services/llm.service';
import { PromptService } from './application/services/prompt.service';
import { ChunkingService } from './application/services/chunking.service';
import { RAGService } from './application/services/rag.service';
import { ChatService } from './application/services/chat.service';
import { PlantScanService } from './application/services/plant-scan.service';
import { ChatController } from './interface/controllers/chat.controller';
import { PlantScanController } from './interface/controllers/plant-scan.controller';
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
  controllers: [ChatController, PlantScanController],
  providers: [
    LLMService,
    PromptService,
    ChunkingService,
    EmbeddingRepository,
    EmbeddingProcessor,
    RAGService,
    ChatService,
    PlantScanService,
    {
      provide: 'IEmbeddingProvider',
      useClass: LLMService,
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
    RAGService,
    ChatService,
    PlantScanService,
  ],
})
export class AiModule {}
