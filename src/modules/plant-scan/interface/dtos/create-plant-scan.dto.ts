import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePlantScanDto {
  @IsString()
  @IsNotEmpty()
  crop_type: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  plant_part?: string;

  @IsString()
  @IsOptional()
  symptom_duration?: string;

  @IsString()
  @IsOptional()
  progression?: string;
}
