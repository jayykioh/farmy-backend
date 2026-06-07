import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePlotDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber({}, { message: 'Diện tích phải là một số!' })
  @Min(0.1, { message: 'Diện tích phải lớn hơn 0!' })
  @IsOptional()
  area_size?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
