import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SnapCondition = 'healthy' | 'issue' | 'harvest' | 'other';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'farm_snaps',
})
export class FarmSnapDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true, index: true })
  user_id: string;

  @Prop({ required: true })
  image_url: string;

  @Prop()
  caption?: string;

  @Prop({ required: true, index: true })
  crop_type: string;

  @Prop({
    required: true,
    enum: ['healthy', 'issue', 'harvest', 'other'],
    index: true,
  })
  condition: SnapCondition;

  @Prop()
  condition_note?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  location?: {
    lat?: number;
    lng?: number;
    province?: string;
    district?: string;
  };

  @Prop({ type: MongooseSchema.Types.Mixed })
  weather?: { temp?: number; humidity?: number; condition?: string };

  @Prop({ type: Date, required: true, index: true })
  captured_at: Date;

  @Prop({ required: true, default: 10 })
  xp_earned: number;

  @Prop({ required: true, default: true, index: true })
  is_public: boolean;

  @Prop({ required: true, default: false, index: true })
  is_flagged: boolean;

  @Prop({ type: Date })
  deleted_at?: Date;

  created_at?: Date;

  updated_at?: Date;
}

export const FarmSnapSchema: MongooseSchema =
  SchemaFactory.createForClass(FarmSnapDocument);
