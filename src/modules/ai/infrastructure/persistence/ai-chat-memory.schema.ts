import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'ai_chat_memories',
})
export class AiChatMemoryDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true, index: true })
  user_id: string;

  @Prop({ required: true })
  role: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: [Number], required: true })
  message_embedding: number[];
}

export const AiChatMemorySchema: MongooseSchema =
  SchemaFactory.createForClass(AiChatMemoryDocument);
