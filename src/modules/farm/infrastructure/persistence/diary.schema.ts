import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { FarmPlotDocument } from './farm-plot.schema';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'diaries',
})
export class DiaryDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({
    type: String,
    ref: FarmPlotDocument.name,
    required: true,
    index: true,
  })
  plot_id: string;

  @Prop({ required: true })
  crop_type: string;

  @Prop({ type: Date, required: true })
  start_date: Date;

  @Prop({ required: true, default: 'active' })
  status: string;

  @Prop({
    type: MongooseSchema.Types.Map,
    of: MongooseSchema.Types.Mixed,
    default: {},
  })
  metadata: Record<string, any>;
}

export const DiarySchema: MongooseSchema =
  SchemaFactory.createForClass(DiaryDocument);
