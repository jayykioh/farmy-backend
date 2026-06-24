import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

/**
 * WeeklyInsightDocument
 *
 * Lưu kết quả AI tổng hợp hàng tuần cho từng user.
 * Unique constraint: (user_id, week_start_date) — đảm bảo idempotent khi retry.
 */
@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'weekly_insights',
})
export class WeeklyInsightDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  /** ID của user nhận insight */
  @Prop({ type: String, required: true, index: true })
  user_id: string;

  /**
   * Ngày đầu tuần (Thứ Hai) của tuần được tổng hợp.
   * Dùng cùng với user_id làm khóa deduplicate.
   */
  @Prop({ type: Date, required: true })
  week_start_date: Date;

  /** Nội dung insight do Gemini sinh ra */
  @Prop({ type: String, required: true })
  insight_text: string;

  /** Tên model đã dùng (e.g. "gemini-1.5-flash") */
  @Prop({ type: String, required: true })
  model_used: string;

  /** Tổng token đã tiêu thụ (prompt + completion) */
  @Prop({ type: Number, required: true, default: 0 })
  tokens_used: number;
}

export const WeeklyInsightSchema: MongooseSchema =
  SchemaFactory.createForClass(WeeklyInsightDocument);

// Unique compound index đảm bảo mỗi user chỉ có một insight mỗi tuần
WeeklyInsightSchema.index({ user_id: 1, week_start_date: 1 }, { unique: true });
