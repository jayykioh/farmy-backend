/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  IsBoolean,
} from 'class-validator';

export class UpdateReminderDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsDateString(
    {},
    { message: 'remind_at phải là định dạng ngày tháng hợp lệ!' },
  )
  @IsOptional()
  remind_at?: string;

  @IsString()
  @IsOptional()
  diary_id?: string;

  /** Cập nhật trạng thái (chỉ dùng nội bộ hoặc admin) */
  @IsEnum(['pending', 'delivered', 'failed', 'cancelled'], {
    message: 'status phải là: pending | delivered | failed | cancelled',
  })
  @IsOptional()
  status?: string;

  /** Loại nhắc nhở */
  @IsEnum([
    'diary',
    'water',
    'fertilize',
    'weekly_insight',
    'streak_milestone',
    'plant_alert',
  ])
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  action_type?: string;

  @IsString()
  @IsOptional()
  action_detail?: string;

  /** Backward compat */
  @IsBoolean()
  @IsOptional()
  is_sent?: boolean;

  /** Tần suất lặp lại */
  @IsEnum(['none', 'daily', 'weekly'], {
    message: 'repeat phải là: none | daily | weekly',
  })
  @IsOptional()
  repeat?: 'none' | 'daily' | 'weekly';
}
