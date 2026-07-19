import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class SubmitFeedbackDto {
  @IsString()
  session_id: string;

  @IsString()
  message_id: string;

  @IsNumber()
  rating: number;

  @IsOptional()
  @IsBoolean()
  helpful?: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}
