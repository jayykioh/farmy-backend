import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';
import { ChatSessionDocument } from './chat-session.schema';

export type ChatMessageRole = 'user' | 'assistant';
export type ChatMessageStatus = 'pending' | 'completed' | 'failed';

@Schema({
  collection: 'chat_messages',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class ChatMessageDocument extends Document<Types.ObjectId> {
  declare _id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: ChatSessionDocument.name,
    required: true,
  })
  session_id: Types.ObjectId;

  @Prop({ type: String, ref: UserDocument.name, required: true })
  user_id: string;

  @Prop({ type: String, enum: ['user', 'assistant'], required: true })
  role: ChatMessageRole;

  @Prop({ type: String, required: true })
  content: string;

  @Prop({
    type: String,
    enum: ['pending', 'completed', 'failed'],
    required: true,
  })
  status: ChatMessageStatus;

  @Prop({ type: String, required: false })
  client_message_id?: string;

  @Prop({ type: Types.ObjectId, required: false })
  reply_to_message_id?: Types.ObjectId;

  created_at: Date;
  updated_at: Date;
}

export const ChatMessageSchema: MongooseSchema =
  SchemaFactory.createForClass(ChatMessageDocument);

ChatMessageSchema.index({ session_id: 1, created_at: 1 });
ChatMessageSchema.index(
  { user_id: 1, client_message_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: 'user',
      client_message_id: { $type: 'string' },
    },
  },
);
ChatMessageSchema.index(
  { reply_to_message_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: 'assistant',
      reply_to_message_id: { $type: 'objectId' },
    },
  },
);
