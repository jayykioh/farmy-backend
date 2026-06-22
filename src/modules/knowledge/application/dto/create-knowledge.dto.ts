import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsObject,
  MaxLength,
} from 'class-validator';

export class CreateKnowledgeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
  @IsUrl()
  source_url?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
