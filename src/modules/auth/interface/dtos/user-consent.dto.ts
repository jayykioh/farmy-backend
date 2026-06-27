import { IsBoolean, IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class UserConsentDto {
  @IsEnum([
    'data_storage',
    'ai_analysis',
    'notification_zalo',
    'notification_email',
    'notification_push',
    'social_sharing',
  ], {
    message: 'consent_type phải là một trong các loại consent hợp lệ.',
  })
  @IsNotEmpty()
  consent_type: string;

  @IsBoolean()
  @IsNotEmpty()
  granted: boolean;

  @IsString()
  @IsNotEmpty()
  policy_version: string;
}
