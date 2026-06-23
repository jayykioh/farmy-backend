import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'refresh_tokens',
})
export class RefreshTokenDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  token_hash: string;

  @Prop({ required: true, index: true })
  user_id: string;

  @Prop({ required: true, index: true })
  family_id: string;

  @Prop({ required: true, default: false })
  is_used: boolean;

  @Prop({ required: true, default: false })
  is_revoked: boolean;

  @Prop({ required: true, index: { expires: 0 } })
  expires_at: Date;
}

export const RefreshTokenSchema =
  SchemaFactory.createForClass(RefreshTokenDocument);
