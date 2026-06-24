import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import {
  KnowledgeSourceDocument,
  KnowledgeSourceSchema,
} from './infrastructure/persistence/knowledge-source.schema';
import { KnowledgeRepository } from './infrastructure/persistence/knowledge.repository';
import { KnowledgeService } from './application/services/knowledge.service';
import { KnowledgeValidationService } from './application/services/knowledge-validation.service';
import { FileParserService } from './application/services/file-parser.service';
import { AdminKnowledgeController } from './application/controllers/admin-knowledge.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: KnowledgeSourceDocument.name,
        schema: KnowledgeSourceSchema,
      },
    ]),
    // Reuse the shared embedding_queue registered in AiModule
    BullModule.registerQueue({ name: 'embedding_queue' }),
    // Import AiModule to access LLMService for content validation
    AiModule,
  ],
  controllers: [AdminKnowledgeController],
  providers: [KnowledgeRepository, KnowledgeService, KnowledgeValidationService, FileParserService],
  exports: [KnowledgeRepository, KnowledgeService, KnowledgeValidationService, FileParserService],
})
export class KnowledgeModule {}
