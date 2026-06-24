import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReminderDocument } from '../../infrastructure/persistence/reminder.schema';
import {
  REMINDER_QUEUE,
  REMINDER_JOB_DISPATCH,
} from '../../infrastructure/queue/reminder-queue.constants';
import type { ReminderJobPayload } from '../../infrastructure/queue/reminder.processor';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectModel(ReminderDocument.name)
    private readonly reminderModel: Model<ReminderDocument>,
    @InjectQueue(REMINDER_QUEUE)
    private readonly reminderQueue: Queue<ReminderJobPayload>,
  ) {}

  /**
   * Master Cron: Chạy mỗi phút để quét reminders pending
   * và đẩy vào BullMQ queue
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchPendingReminders(): Promise<void> {
    this.logger.log('🕐 [Cron] Scanning pending reminders...');
    await this.enqueueOverdueReminders();
  }

  /**
   * Có thể gọi thủ công từ controller (dev/debug)
   * hoặc từ các nơi khác trong hệ thống
   */
  async enqueueOverdueReminders(): Promise<number> {
    const now = new Date();

    // Lấy tất cả reminder pending có remind_at <= now
    const pendingReminders = await this.reminderModel
      .find({
        status: 'pending',
        remind_at: { $lte: now },
      })
      .exec();

    if (pendingReminders.length === 0) {
      this.logger.debug('📭 No pending reminders to dispatch.');
      return 0;
    }

    this.logger.log(
      `📬 Found ${pendingReminders.length} pending reminder(s) — enqueueing...`,
    );

    let enqueued = 0;
    for (const reminder of pendingReminders) {
      try {
        const payload: ReminderJobPayload = {
          reminderId: reminder._id,
          userId: reminder.user_id,
          title: reminder.title,
          type: reminder.type ?? 'diary',
          action_type: reminder.action_type ?? '',
          action_detail: reminder.action_detail ?? '',
          schedule_slot: reminder.schedule_slot,
        };

        await this.reminderQueue.add(REMINDER_JOB_DISPATCH, payload, {
          attempts: 4, // 1 lần gốc + 3 retry
          backoff: {
            type: 'exponential',
            delay: 5000, // 5s → 10s → 20s
          },
          removeOnComplete: 100, // Giữ 100 job đã xong để debug
          removeOnFail: 50,
        });

        enqueued++;
        this.logger.log(
          `  ↳ Enqueued: [${reminder.type ?? 'diary'}] "${reminder.title}"` +
            ` → user ${reminder.user_id}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to enqueue reminder ${reminder._id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `✅ Dispatched ${enqueued}/${pendingReminders.length} reminders.`,
    );
    return enqueued;
  }

  /**
   * Helper: Xác định schedule_slot dựa trên giờ của remind_at
   */
  static resolveScheduleSlot(
    remindAt: Date,
  ): 'morning' | 'noon' | 'afternoon' | 'evening' {
    // Lấy giờ địa phương (UTC+7)
    const hour = (remindAt.getUTCHours() + 7) % 24;
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 18) return 'afternoon';
    return 'evening';
  }
}
