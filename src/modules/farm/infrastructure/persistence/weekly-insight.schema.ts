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

  /** Mùa vụ được phân tích. Bỏ trống với báo cáo tổng hợp cũ/scheduler. */
  @Prop({ type: String, required: false, index: true })
  diary_id?: string;

  /** Snapshot để client vẫn hiển thị được tên mùa vụ nếu diary thay đổi. */
  @Prop({ type: String, required: false })
  crop_type?: string;

  @Prop({ type: String, required: false })
  season?: string;

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

export const WeeklyInsightSchema: MongooseSchema = SchemaFactory.createForClass(
  WeeklyInsightDocument,
);

// Mỗi mùa vụ chỉ có một insight mỗi tuần. Partial index giữ tương thích với
// báo cáo tổng hợp cũ chưa có diary_id.
WeeklyInsightSchema.index(
  { user_id: 1, diary_id: 1, week_start_date: 1 },
  { unique: true, partialFilterExpression: { diary_id: { $type: 'string' } } },
);
