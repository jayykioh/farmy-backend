import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    let publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    let privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const email = this.configService.get<string>(
      'VAPID_EMAIL',
      'mailto:support@farmdiaries.com',
    );

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys are not fully configured in environment variables.',
      );
      try {
        const generated = webpush.generateVAPIDKeys();
        publicKey = generated.publicKey;
        privateKey = generated.privateKey;
        this.logger.log('--- GENERATED DEVELOPMENT VAPID KEYS ---');
        this.logger.log(`VAPID_PUBLIC_KEY=${publicKey}`);
        this.logger.log(`VAPID_PRIVATE_KEY=${privateKey}`);
        this.logger.log('----------------------------------------');
      } catch (err) {
        this.logger.error('Failed to generate development VAPID keys', err);
        return;
      }
    }

    try {
      webpush.setVapidDetails(email, publicKey, privateKey);
      this.isConfigured = true;
      this.logger.log('Web Push VAPID configuration initialized successfully.');
    } catch (error) {
      this.logger.error('Failed to set VAPID details', error);
    }
  }

  async send(
    subscription: any,
    payload: { title: string; body: string; url?: string; [key: string]: any },
  ): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('Web Push is not fully configured, skipping send.');
      return false;
    }

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      this.logger.warn('Invalid push subscription structure, skipping.');
      return false;
    }

    try {
      const payloadString = JSON.stringify({
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/logo.png',
          badge: '/badge.png',
          data: {
            url: payload.url || '/reminders',
            ...payload,
          },
        },
      });

      await webpush.sendNotification(subscription, payloadString);
      this.logger.log(`Web push notification sent successfully.`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send web push notification: ${error.message}`,
      );
      return false;
    }
  }
}
