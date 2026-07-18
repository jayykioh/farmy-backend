import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type RefreshTokenHydratedDocument =
  HydratedDocument<RefreshTokenDocument>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'refresh_tokens',
})
export class RefreshTokenDocument {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true, unique: true, index: true })
  token_hash!: string;

  @Prop({ required: true, index: true })
  user_id!: string;

  @Prop({ required: true, index: true })
  family_id!: string;

  @Prop({ required: true, default: false })
  is_used!: boolean;

  @Prop({ required: true, default: false })
  is_revoked!: boolean;

  @Prop({ required: true, index: { expires: 0 } })
  expires_at!: Date;
}

export const RefreshTokenSchema: MongooseSchema<RefreshTokenDocument> =
  SchemaFactory.createForClass(RefreshTokenDocument);
