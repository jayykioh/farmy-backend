import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSnapCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}
