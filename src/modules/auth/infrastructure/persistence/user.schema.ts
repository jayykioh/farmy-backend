import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'users',
})
export class UserDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  full_name?: string;

  @Prop()
  avatar_url?: string;

  @Prop()
  location?: string;

  @Prop({ required: true, default: 'user' })
  role: string;

  @Prop({ type: Boolean, default: false })
  is_deleted?: boolean;

  @Prop({ type: Date, required: false })
  deleted_at?: Date;
}

export const UserSchema: MongooseSchema =
  SchemaFactory.createForClass(UserDocument);
