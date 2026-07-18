import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum ShopItemCategory {
  HAT = 'HAT',
  OUTFIT = 'OUTFIT',
  EFFECT = 'EFFECT',
  BACKGROUND = 'BACKGROUND',
}

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'shop_items',
})
export class ShopItemDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, enum: Object.values(ShopItemCategory), required: true })
  category: ShopItemCategory;

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({ type: Number, default: 1 })
  required_level: number;

  @Prop({ type: String, required: true })
  image_url: string;
}

export const ShopItemSchema: MongooseSchema = SchemaFactory.createForClass(ShopItemDocument);
