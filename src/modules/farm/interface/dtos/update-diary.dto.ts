import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class UpdateDiaryDto {
  @IsString()
  @IsOptional()
  crop_type?: string;

  @IsString()
  @IsOptional()
  season?: string;

  @IsDateString(
    {},
    { message: 'start_date phải là định dạng ngày tháng hợp lệ!' },
  )
  @IsOptional()
  start_date?: string;

  @IsString()
  @IsIn(['active', 'archived', 'deleted'], {
    message: 'status phải là active, archived hoặc deleted!',
  })
  @IsOptional()
  status?: string;
}
