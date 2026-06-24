import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

@Schema({
  collection: 'chat_sessions',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class ChatSessionDocument extends Document<Types.ObjectId> {
  declare _id: Types.ObjectId;

  @Prop({ type: String, ref: UserDocument.name, required: true })
  user_id: string;

  @Prop({ type: String, required: true, maxlength: 60 })
  title: string;

  @Prop({ type: Date, required: true, default: Date.now })
  last_message_at: Date;

  created_at: Date;
  updated_at: Date;
}

export const ChatSessionSchema: MongooseSchema =
  SchemaFactory.createForClass(ChatSessionDocument);

ChatSessionSchema.index({ user_id: 1, last_message_at: -1 });
