import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string | undefined;
  private readonly secretKey: string | undefined;
  private readonly oaId: string | undefined;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ESMS_API_KEY');
    this.secretKey = this.configService.get<string>('ESMS_SECRET_KEY');
    this.oaId = this.configService.get<string>('ESMS_OA_ID');
  }

  async sendNotificationTest(phoneNumber: string): Promise<boolean> {
    const isMock =
      !this.apiKey ||
      this.apiKey === 'your_esms_api_key' ||
      !this.secretKey ||
      this.secretKey === 'your_esms_secret_key';

    if (isMock) {
      this.logger.log(
        `[MOCK SMS] Notification sent to ${phoneNumber}. (ESMS keys not configured)`,
      );
      return true;
    }

    try {
      this.logger.log(`Sending SMS notification to ${phoneNumber}...`);

      // Normalize phone: 0848... -> 84848...
      let normalizedPhone = phoneNumber.replace(/^\+/, '');
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '84' + normalizedPhone.substring(1);
      }

      const message =
        'FarmDiaries: Ban da bat thanh cong thong bao tu Farmy! Chung toi se nhac nho ban cham soc cay trong dung gio.';

      const body = {
        ApiKey: this.apiKey,
        Content: message,
        Phone: normalizedPhone,
        SecretKey: this.secretKey,
        SmsType: '4', // SMS đầu số cố định, không cần Brandname
        IsUnicode: '0',
        Brandname: '',
        CallbackUrl: '',
      };

      const response = await fetch(
        'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      const result = await response.json();
      this.logger.log(`ESMS Response: ${JSON.stringify(result)}`);

      if (result.CodeResult !== '100') {
        this.logger.error(
          `ESMS error: ${result.ErrorMessage} (Code: ${result.CodeResult})`,
        );
        return false;
      }

      this.logger.log(`SMS sent successfully to ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phoneNumber}`, error);
      return false;
    }
  }
}
