import { IsNotEmpty, IsString, IsDateString } from 'class-validator';

export class CreateDiaryDto {
  @IsString()
  @IsNotEmpty({ message: 'plot_id không được để trống!' })
  plot_id: string;

  @IsString()
  @IsNotEmpty({ message: 'crop_type không được để trống!' })
  crop_type: string;

  @IsString()
  @IsNotEmpty({ message: 'season không được để trống!' })
  season: string;

  @IsDateString(
    {},
    { message: 'start_date phải là định dạng ngày tháng hợp lệ!' },
  )
  @IsNotEmpty({ message: 'start_date không được để trống!' })
  start_date: string;
}
