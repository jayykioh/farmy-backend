import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RateLimiterModule } from '../../common/rate-limiter/rate-limiter.module';
import { LLMService } from './application/services/llm.service';
import { PromptService } from './application/services/prompt.service';
import {
  AiChatMemoryDocument,
  AiChatMemorySchema,
} from './infrastructure/persistence/ai-chat-memory.schema';

@Module({
  imports: [
    RateLimiterModule,
    MongooseModule.forFeature([
      { name: AiChatMemoryDocument.name, schema: AiChatMemorySchema },
    ]),
  ],
  providers: [LLMService, PromptService],
  exports: [LLMService, PromptService, MongooseModule],
})
export class AiModule {}
