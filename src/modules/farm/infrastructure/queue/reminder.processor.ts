import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { ReminderDocument } from '../persistence/reminder.schema';
import { PetService } from '../../../pet/application/services/pet.service';

import {
  REMINDER_QUEUE,
  REMINDER_MAX_RETRIES,
} from './reminder-queue.constants';

export interface ReminderJobPayload {
  reminderId: string;
  userId: string;
  title: string;
  type: string;
  action_type: string;
  action_detail: string;
  schedule_slot?: string;
}

@Processor(REMINDER_QUEUE)
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    @InjectModel(ReminderDocument.name)
    private readonly reminderModel: Model<ReminderDocument>,
    private readonly petService: PetService,
  ) {
    super();
  }

  /**
   * Xử lý từng job dispatch-reminder từ BullMQ queue
   */
  async process(job: Job<ReminderJobPayload>): Promise<void> {
    const { reminderId, userId, title, type, action_type, action_detail } =
      job.data;

    this.logger.log(
      `📨 [Attempt #${job.attemptsMade + 1}] Dispatching reminder:` +
        ` id=${reminderId} | user=${userId} | type=${type} | title="${title}"`,
    );

    try {
      // Fetch the full reminder object to check for repeat options
      const originalReminder = await this.reminderModel.findById(reminderId).exec();

      // === Gửi thông báo ===
      // Hiện tại: Console log (mock Web Push)
      // Tương lai: Tích hợp Zalo ZNS / Firebase FCM / Email
      await this.sendNotification({ reminderId, userId, title, type, action_type, action_detail });

      // Cập nhật trạng thái delivered
      await this.reminderModel.updateOne(
        { _id: reminderId },
        {
          $set: {
            status: 'delivered',
            delivered_at: new Date(),
            is_sent: true,
          },
        },
      );

      this.logger.log(`✅ Reminder delivered: ${reminderId}`);

      // Auto-recurring logic: if repeat is daily or weekly, schedule the next occurrence
      if (originalReminder && originalReminder.repeat && originalReminder.repeat !== 'none') {
        const nextRemindAt = new Date(originalReminder.remind_at);
        if (originalReminder.repeat === 'daily') {
          nextRemindAt.setDate(nextRemindAt.getDate() + 1);
        } else if (originalReminder.repeat === 'weekly') {
          nextRemindAt.setDate(nextRemindAt.getDate() + 7);
        }

        const nextReminder = new this.reminderModel({
          _id: crypto.randomUUID(),
          user_id: originalReminder.user_id,
          diary_id: originalReminder.diary_id,
          title: originalReminder.title,
          type: originalReminder.type,
          schedule_slot: originalReminder.schedule_slot,
          action_type: originalReminder.action_type,
          action_detail: originalReminder.action_detail,
          remind_at: nextRemindAt,
          status: 'pending',
          retry_count: 0,
          is_sent: false,
          repeat: originalReminder.repeat,
        });

        await nextReminder.save();
        this.logger.log(
          `🔁 Auto-scheduled next recurring reminder (${originalReminder.repeat}) for ` +
            `${nextRemindAt.toISOString()} (ID: ${nextReminder._id})`,
        );
      }
    } catch (err) {
      const reminder = await this.reminderModel.findById(reminderId);
      if (!reminder) return;

      const newRetryCount = (reminder.retry_count ?? 0) + 1;

      if (newRetryCount > REMINDER_MAX_RETRIES) {
        // Đã vượt quá số lần retry → đánh dấu failed
        await this.reminderModel.updateOne(
          { _id: reminderId },
          { $set: { status: 'failed', retry_count: newRetryCount } },
        );
        this.logger.error(
          `❌ Reminder FAILED after ${newRetryCount} attempts: ${reminderId}`,
        );
        // Cập nhật trạng thái buồn bã cho thú ảo
        await this.petService.updateMoodOnReminderFailed(userId);
      } else {
        // Tăng retry count, để BullMQ tự retry lần sau
        await this.reminderModel.updateOne(
          { _id: reminderId },
          { $set: { retry_count: newRetryCount } },
        );
        this.logger.warn(
          `⚠️ Reminder retry ${newRetryCount}/${REMINDER_MAX_RETRIES}: ${reminderId}`,
        );
        throw err; // Re-throw để BullMQ xếp lại hàng đợi retry
      }
    }
  }

  /**
   * Mock gửi thông báo (Web Push / Zalo ZNS stub)
   * Thay thế bằng provider thật khi tích hợp
   */
  private async sendNotification(payload: ReminderJobPayload): Promise<void> {
    // TODO: Tích hợp Firebase FCM hoặc Zalo ZNS ở đây
    this.logger.log(
      `🔔 [MOCK NOTIFICATION] → User: ${payload.userId}` +
        ` | "${payload.title}" | Action: ${payload.action_type}` +
        (payload.action_detail ? ` — ${payload.action_detail}` : ''),
    );
    // Mô phỏng delay gửi (< 500ms)
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
