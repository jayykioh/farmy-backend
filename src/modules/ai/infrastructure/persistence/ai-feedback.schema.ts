import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'ai_feedback',
})
export class AiFeedbackDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true })
  session_id: string;

  @Prop({ type: String, required: true })
  message_id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true })
  user_id: string;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: Boolean, required: false })
  helpful?: boolean;

  @Prop({ type: String, required: false })
  comment?: string;

  @Prop({ type: String, required: false })
  model_used?: string;

  @Prop({ type: String, required: false })
  prompt_version?: string;
}

export const AiFeedbackSchema: MongooseSchema =
  SchemaFactory.createForClass(AiFeedbackDocument);

// Indexes
AiFeedbackSchema.index({ user_id: 1, created_at: -1 });
AiFeedbackSchema.index({ prompt_version: 1 });
AiFeedbackSchema.index({ session_id: 1, message_id: 1 });
