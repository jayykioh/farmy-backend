import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePlantScanDto {
  @IsString()
  @IsNotEmpty()
  crop_type: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
