import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'refresh_tokens' })
export class RefreshTokenDocument extends Document {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  familyId: string;

  @Prop({ required: true, default: false })
  isUsed: boolean;

  @Prop({ required: true, default: false })
  isRevoked: boolean;

  @Prop({ required: true })
  expiresAt: Date;
}

export const RefreshTokenSchema =
  SchemaFactory.createForClass(RefreshTokenDocument);
