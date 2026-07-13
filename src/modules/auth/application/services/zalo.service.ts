import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ZaloService {
  private readonly logger = new Logger(ZaloService.name);
  private readonly oaAccessToken: string | undefined;

  constructor(private configService: ConfigService) {
    this.oaAccessToken = this.configService.get<string>('ZALO_OA_ACCESS_TOKEN');
  }

  async sendZaloNotificationTest(phoneNumber: string): Promise<boolean> {
    if (!this.oaAccessToken || this.oaAccessToken === 'your_zalo_oa_access_token') {
      this.logger.log(`[MOCK ZALO ZNS] Notification 'đã xác nhận' sent to ${phoneNumber}. (Token is missing or mock)`);
      return true;
    }

    try {
      this.logger.log(`Sending Zalo notification test to ${phoneNumber}...`);

      // Prepare ZNS payload
      // According to Zalo ZNS API, the endpoint is POST https://business.openapi.zalo.me/message/template
      const url = 'https://business.openapi.zalo.me/message/template';
      const templateId = this.configService.get<string>('ZALO_TEMPLATE_ID') || '253574'; // Example test template if empty

      const body = {
        phone: phoneNumber.replace('+', ''), // Zalo usually expects 84... format, but we'll try to clean it
        template_id: templateId,
        template_data: {
          name: 'Bé Thóc - FarmDiaries',
          date: new Date().toLocaleDateString('vi-VN'),
        },
        tracking_id: `tracking_${Date.now()}`
      };

      // Ensure phone starts with 84 instead of 0
      if (body.phone.startsWith('0')) {
        body.phone = '84' + body.phone.substring(1);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: this.oaAccessToken,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      
      if (result.error !== 0) {
        this.logger.error(`Zalo ZNS error: ${result.message} (Code: ${result.error})`, result);
        return false;
      }

      this.logger.log(`Zalo notification sent successfully to ${phoneNumber}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to send Zalo notification to ${phoneNumber}`, error);
      return false;
    }
  }
}
