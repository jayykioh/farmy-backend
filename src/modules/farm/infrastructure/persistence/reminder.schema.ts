import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';
import { DiaryDocument } from './diary.schema';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'reminders',
})
export class ReminderDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true, index: true })
  user_id: string;

  @Prop({ type: String, ref: DiaryDocument.name, required: false, index: true })
  diary_id?: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: Date, required: true })
  remind_at: Date;

  @Prop({ required: true, default: false })
  is_sent: boolean;
}

export const ReminderSchema: MongooseSchema =
  SchemaFactory.createForClass(ReminderDocument);
