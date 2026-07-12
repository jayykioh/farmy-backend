import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from './user.schema';

export type ConsentType =
  | 'data_storage'
  | 'ai_analysis'
  | 'notification_zalo'
  | 'notification_email'
  | 'notification_push'
  | 'social_sharing';

@Schema({
  timestamps: { createdAt: 'granted_at', updatedAt: false },
  collection: 'user_consents',
})
export class UserConsentDocument extends Document {
  @Prop({ type: String, ref: UserDocument.name, required: true, index: true })
  user_id: string;

  @Prop({
    type: String,
    required: true,
    enum: [
      'data_storage',
      'ai_analysis',
      'notification_zalo',
      'notification_email',
      'notification_push',
      'social_sharing',
    ],
  })
  consent_type: ConsentType;

  @Prop({ type: Boolean, required: true })
  granted: boolean;

  @Prop({ type: String, required: true })
  policy_version: string;

  @Prop({ type: String, required: false })
  ip_address?: string;
}

export const UserConsentSchema =
  SchemaFactory.createForClass(UserConsentDocument);

// Compound unique index so each user has at most one record per consent type
UserConsentSchema.index({ user_id: 1, consent_type: 1 }, { unique: true });
