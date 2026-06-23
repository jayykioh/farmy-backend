import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeSourceDocument, KnowledgeSourceSchema } from './infrastructure/persistence/knowledge-source.schema';
import { KnowledgeRepository } from './infrastructure/persistence/knowledge.repository';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeSourceDocument.name, schema: KnowledgeSourceSchema },
    ]),
    AiModule,
  ],
  providers: [KnowledgeRepository],
  exports: [KnowledgeRepository],
})
export class KnowledgeModule {}
