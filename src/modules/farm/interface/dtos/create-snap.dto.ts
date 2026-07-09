import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { SnapCondition } from '../../infrastructure/persistence/farm-snap.schema';

export class CreateSnapDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsString()
  @IsNotEmpty()
  cropType: string;

  @IsIn(['healthy', 'issue', 'harvest', 'other'])
  condition: SnapCondition;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  conditionNote?: string;

  @IsOptional()
  @IsObject()
  location?: {
    lat?: number;
    lng?: number;
    province?: string;
    district?: string;
  };

  @IsOptional()
  @IsObject()
  weather?: { temp?: number; humidity?: number; condition?: string };

  @IsDateString()
  capturedAt: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
