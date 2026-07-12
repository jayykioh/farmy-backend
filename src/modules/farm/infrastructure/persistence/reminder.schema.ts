import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';
import { DiaryDocument } from './diary.schema';

export type ReminderType =
  | 'diary'
  | 'water'
  | 'fertilize'
  | 'weekly_insight'
  | 'streak_milestone'
  | 'plant_alert';

export type ScheduleSlot = 'morning' | 'noon' | 'afternoon' | 'evening';

export type ReminderStatus =
  | 'pending'
  | 'delivered'
  | 'completed'
  | 'failed'
  | 'cancelled';

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

  /** Loại nhắc nhở theo spec */
  @Prop({
    type: String,
    enum: [
      'diary',
      'water',
      'fertilize',
      'weekly_insight',
      'streak_milestone',
      'plant_alert',
    ],
    default: 'diary',
  })
  type: ReminderType;

  /** Khung giờ gửi nhắc nhở */
  @Prop({
    type: String,
    enum: ['morning', 'noon', 'afternoon', 'evening'],
    required: false,
  })
  schedule_slot?: ScheduleSlot;

  /** Mô tả hành động cần thực hiện */
  @Prop({ required: false, default: '' })
  action_type: string;

  /** Chi tiết hành động */
  @Prop({ required: false, default: '' })
  action_detail: string;

  /** Thời điểm nhắc nhở (UTC) */
  @Prop({ type: Date, required: true, index: true })
  remind_at: Date;

  /** Trạng thái xử lý */
  @Prop({
    type: String,
    enum: ['pending', 'delivered', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status: ReminderStatus;

  /** Thời điểm gửi thành công */
  @Prop({ type: Date, required: false })
  delivered_at?: Date;

  /** Số lần retry */
  @Prop({ type: Number, default: 0 })
  retry_count: number;

  /** Backward-compat: is_sent = (status === 'delivered') */
  @Prop({ required: false, default: false })
  is_sent: boolean;

  /** Tần suất lặp lại */
  @Prop({ type: String, enum: ['none', 'daily', 'weekly'], default: 'daily' })
  repeat: 'none' | 'daily' | 'weekly';
}

export const ReminderSchema: MongooseSchema =
  SchemaFactory.createForClass(ReminderDocument);

// Compound index để Cron query nhanh
ReminderSchema.index({ status: 1, remind_at: 1 });
