import { IsOptional, IsString } from 'class-validator';

export class UpdateDiaryLogDto {
  @IsString()
  @IsOptional()
  activity_type?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  image_url?: string;
}
