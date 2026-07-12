import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// ── Validation Report shape ──────────────────────────────────────────────────
export interface ValidationReport {
  score: number; // 0–100
  is_agriculture_related: boolean;
  language_detected: string; // 'vi' | 'en' | 'other'
  category_match: boolean;
  warnings: string[]; // danh sách cảnh báo
  rejection_reason: string | null; // null nếu score >= 40
  checked_at: Date;
}

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'knowledge_sources',
})
export class KnowledgeSourceDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  category: string;

  @Prop()
  source_url?: string;

  // ── Language ──────────────────────────────────────────────────────────────
  /** Ngôn ngữ phát hiện tự động bởi Gemini validation */
  @Prop({ type: String, enum: ['vi', 'en', 'unknown'], default: 'unknown' })
  language: 'vi' | 'en' | 'unknown';

  // ── Embedding pipeline status ─────────────────────────────────────────────
  /**
   * pending    → chưa được enqueue
   * processing → BullMQ job đã dispatch
   * done       → vector đã upsert vào pgvector
   * error      → job thất bại
   */
  @Prop({
    type: String,
    enum: ['pending', 'processing', 'done', 'error'],
    default: 'pending',
  })
  embed_status: 'pending' | 'processing' | 'done' | 'error';

  // ── Content Validation pipeline status ───────────────────────────────────
  /**
   * unvalidated → mới upload, chưa qua AI review
   * validating  → đang gọi Gemini
   * validated   → Gemini đã đánh giá (có thể có cảnh báo)
   * rejected    → Gemini reject (score < 40) hoặc Admin từ chối
   * confirmed   → Admin đã xác nhận → sẵn sàng embed
   */
  @Prop({
    type: String,
    enum: ['unvalidated', 'validating', 'validated', 'rejected', 'confirmed'],
    default: 'unvalidated',
  })
  validation_status:
    | 'unvalidated'
    | 'validating'
    | 'validated'
    | 'rejected'
    | 'confirmed';

  /** Báo cáo chi tiết từ Gemini sau khi validate */
  @Prop({
    type: {
      score: Number,
      is_agriculture_related: Boolean,
      language_detected: String,
      category_match: Boolean,
      warnings: [String],
      rejection_reason: { type: String, default: null },
      checked_at: Date,
    },
    default: null,
  })
  validation_report?: ValidationReport;

  /** Ghi chú của Admin khi confirm hoặc reject thủ công */
  @Prop({ type: String, default: null })
  admin_note?: string;

  @Prop({
    type: MongooseSchema.Types.Map,
    of: MongooseSchema.Types.Mixed,
    default: {},
  })
  metadata: Record<string, any>;
}

export const KnowledgeSourceSchema: MongooseSchema =
  SchemaFactory.createForClass(KnowledgeSourceDocument);
