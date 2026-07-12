import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { DiaryDocument } from './diary.schema';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'diary_logs',
})
export class DiaryLogDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: DiaryDocument.name, required: true, index: true })
  diary_id: string;

  @Prop({ type: String, required: true })
  user_id: string;

  @Prop({ type: String })
  idempotency_key?: string;

  @Prop({ required: true })
  activity_type: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  image_url?: string;
}

export const DiaryLogSchema: MongooseSchema =
  SchemaFactory.createForClass(DiaryLogDocument);

DiaryLogSchema.index(
  { user_id: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);
