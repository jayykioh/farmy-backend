import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

@Schema({ _id: false })
export class ChatMessageSubdocument {
  @Prop({ type: String, required: true })
  message_id: string;

  @Prop({ type: String, enum: ['user', 'assistant'], required: true })
  role: 'user' | 'assistant';

  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: String, required: false, default: null })
  model?: string | null;

  @Prop({ type: Number, required: false, default: 0 })
  tokens?: number;

  @Prop({ type: Number, required: false, default: 0 })
  latency_ms?: number;

  @Prop({ type: String, required: false, default: 'v1.0' })
  prompt_version?: string;

  @Prop({ type: Boolean, required: false, default: false })
  rate_limited?: boolean;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;

  @Prop({ type: Number, required: false })
  confidence?: number;

  @Prop({ type: [String], required: false, default: [] })
  sources?: string[];

  @Prop({ type: String, required: false })
  phi_warning?: string;

  @Prop({ type: String, required: false })
  safety_alert?: string;
}

const ChatMessageSubdocumentSchema = SchemaFactory.createForClass(
  ChatMessageSubdocument,
);

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'ai_chats',
})
export class AiChatDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true, index: true })
  user_id: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  session_id: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: [ChatMessageSubdocumentSchema], default: [] })
  messages: ChatMessageSubdocument[];
}

export const AiChatSchema: MongooseSchema =
  SchemaFactory.createForClass(AiChatDocument);

// TTL 90 days index
AiChatSchema.index({ created_at: 1 }, { expireAfterSeconds: 7776000 });
// Search index
AiChatSchema.index({ user_id: 1, updated_at: -1 });
