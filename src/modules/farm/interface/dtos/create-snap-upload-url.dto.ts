import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSnapUploadUrlDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fileName?: string;
}
