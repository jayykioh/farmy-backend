import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StreamChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  client_message_id: string;

  @IsOptional()
  @IsMongoId()
  session_id?: string;
}
