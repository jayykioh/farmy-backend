import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { PetModule } from '../pet/pet.module';
import { RagModule } from '../rag/rag.module';
import { FarmModule } from '../farm/farm.module';
import { ChatService } from './application/chat.service';
import {
  ChatMessageDocument,
  ChatMessageSchema,
} from './infrastructure/persistence/chat-message.schema';
import {
  ChatSessionDocument,
  ChatSessionSchema,
} from './infrastructure/persistence/chat-session.schema';
import {
  AiFeedbackDocument,
  AiFeedbackSchema,
} from '../ai/infrastructure/persistence/ai-feedback.schema';
import { ChatController } from './interface/chat.controller';

@Module({
  imports: [
    AiModule,
    RagModule,
    PetModule,
    forwardRef(() => FarmModule),
    MongooseModule.forFeature([
      { name: ChatSessionDocument.name, schema: ChatSessionSchema },
      { name: ChatMessageDocument.name, schema: ChatMessageSchema },
      { name: AiFeedbackDocument.name, schema: AiFeedbackSchema },
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
