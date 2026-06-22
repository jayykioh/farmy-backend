import {
  IsString,
  IsOptional,
  IsUrl,
  IsObject,
  MaxLength,
} from 'class-validator';

export class UpdateKnowledgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsUrl()
  source_url?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
