import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'snap_comments',
})
export class SnapCommentDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true, index: true })
  snap_id: string;

  @Prop({ type: String, required: true, index: true })
  user_id: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  content: string;

  created_at?: Date;

  updated_at?: Date;
}

export const SnapCommentSchema: MongooseSchema =
  SchemaFactory.createForClass(SnapCommentDocument);
