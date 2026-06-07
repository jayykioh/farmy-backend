import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDiaryLogDto {
  @IsString()
  @IsNotEmpty({ message: 'Loại hoạt động không được để trống!' })
  activity_type: string;

  @IsString()
  @IsNotEmpty({ message: 'Nội dung hoạt động không được để trống!' })
  content: string;

  @IsString()
  @IsOptional()
  image_url?: string;
}
