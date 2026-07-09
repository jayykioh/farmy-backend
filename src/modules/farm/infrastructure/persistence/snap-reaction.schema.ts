import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SnapReactionType = 'like' | 'helpful' | 'worry' | 'celebrate';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'snap_reactions',
})
export class SnapReactionDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true, index: true })
  snap_id: string;

  @Prop({ type: String, required: true, index: true })
  user_id: string;

  @Prop({ required: true, enum: ['like', 'helpful', 'worry', 'celebrate'] })
  type: SnapReactionType;
}

export const SnapReactionSchema: MongooseSchema =
  SchemaFactory.createForClass(SnapReactionDocument);

SnapReactionSchema.index({ snap_id: 1, user_id: 1, type: 1 }, { unique: true });
