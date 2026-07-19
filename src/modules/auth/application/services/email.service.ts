import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendEmailNotificationTest(email: string): Promise<boolean> {
    try {
      this.logger.log(`Sending Email notification test to ${email}...`);

      const appName = 'Farmy';

      await this.mailerService.sendMail({
        to: email,
        subject: `[${appName}] Thông báo thử nghiệm`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4CAF50;">Chúc mừng!</h2>
            <p>Bạn đã kết nối thành công hệ thống thông báo qua Email của ${appName}.</p>
            <p>Từ bây giờ, bạn sẽ nhận được các nhắc nhở chăm sóc cây trồng trực tiếp qua hộp thư này.</p>
            <br/>
            <p>Trân trọng,</p>
            <p><strong>Đội ngũ ${appName}</strong></p>
          </div>
        `,
      });

      this.logger.log(`Email notification sent successfully to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send Email notification to ${email}`, error);
      throw new BadRequestException(
        'Không thể gửi email lúc này. Vui lòng kiểm tra lại cấu hình SMTP.',
      );
    }
  }

  async sendReminderEmail(
    email: string,
    title: string,
    actionDetail?: string,
  ): Promise<boolean> {
    try {
      this.logger.log(`Sending Reminder Email to ${email}...`);
      const appName = 'Farmy';

      await this.mailerService.sendMail({
        to: email,
        subject: `[${appName}] Nhắc nhở chăm sóc cây: ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4CAF50;">Đến giờ chăm sóc rồi! ⏱️</h2>
            <p>Hệ thống Farmy nhắc bạn: <strong>${title}</strong></p>
            ${actionDetail ? `<p>Chi tiết: <em>${actionDetail}</em></p>` : ''}
            <br/>
            <p>Hãy vào app để ghi lại nhật ký sau khi hoàn thành nhé!</p>
            <p>Trân trọng,</p>
            <p><strong>Đội ngũ ${appName}</strong></p>
          </div>
        `,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send reminder email to ${email}`, error);
      return false;
    }
  }
}
