import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FarmModule } from '../farm/farm.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RagService } from './application/rag.service';

@Module({
  imports: [AiModule, FarmModule, KnowledgeModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
