import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';

export class ConfirmKnowledgeDto {
  /**
   * confirm → Admin xác nhận bài hợp lệ → validation_status: "confirmed"
   * reject  → Admin từ chối dù Gemini pass → validation_status: "rejected"
   */
  @IsString()
  @IsIn(['confirm', 'reject'])
  action: 'confirm' | 'reject';

  /** Ghi chú tùy chọn của Admin (lý do confirm/reject) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
