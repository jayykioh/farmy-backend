import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'farm_plots',
})
export class FarmPlotDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true, index: true })
  user_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  area_size: number;

  @Prop()
  description?: string;
}

export const FarmPlotSchema: MongooseSchema =
  SchemaFactory.createForClass(FarmPlotDocument);
