import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePlotDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên mảnh vườn không được để trống!' })
  name: string;

  @IsNumber({}, { message: 'Diện tích phải là một số!' })
  @Min(0.1, { message: 'Diện tích phải lớn hơn 0!' })
  area_size: number;

  @IsString()
  @IsOptional()
  description?: string;
}
