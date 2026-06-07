import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
} from 'class-validator';

export type ReminderType =
  | 'diary'
  | 'water'
  | 'fertilize'
  | 'weekly_insight'
  | 'streak_milestone'
  | 'plant_alert';

export type ScheduleSlot = 'morning' | 'noon' | 'afternoon' | 'evening';

export class CreateReminderDto {
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề nhắc nhở không được để trống!' })
  title: string;

  @IsDateString(
    {},
    { message: 'remind_at phải là định dạng ngày tháng hợp lệ!' },
  )
  @IsNotEmpty({ message: 'Thời gian nhắc nhở không được để trống!' })
  remind_at: string;

  @IsString()
  @IsOptional()
  diary_id?: string;

  /** Loại nhắc nhở */
  @IsEnum(
    ['diary', 'water', 'fertilize', 'weekly_insight', 'streak_milestone', 'plant_alert'],
    { message: 'type phải là một trong: diary, water, fertilize, weekly_insight, streak_milestone, plant_alert' },
  )
  @IsOptional()
  type?: ReminderType;

  /** Khung giờ (tự tính nếu không truyền) */
  @IsEnum(['morning', 'noon', 'afternoon', 'evening'], {
    message: 'schedule_slot phải là: morning | noon | afternoon | evening',
  })
  @IsOptional()
  schedule_slot?: ScheduleSlot;

  /** Loại hành động cần làm */
  @IsString()
  @IsOptional()
  action_type?: string;

  /** Mô tả chi tiết */
  @IsString()
  @IsOptional()
  action_detail?: string;

  /** Tần suất lặp lại */
  @IsEnum(['none', 'daily', 'weekly'], {
    message: 'repeat phải là: none | daily | weekly',
  })
  @IsOptional()
  repeat?: 'none' | 'daily' | 'weekly';
}
