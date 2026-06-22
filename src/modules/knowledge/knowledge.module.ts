import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeSourceDocument, KnowledgeSourceSchema } from './infrastructure/persistence/knowledge-source.schema';
import { KnowledgeRepository } from './infrastructure/persistence/knowledge.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeSourceDocument.name, schema: KnowledgeSourceSchema },
    ]),
  ],
  providers: [KnowledgeRepository],
  exports: [KnowledgeRepository],
})
export class KnowledgeModule {}
