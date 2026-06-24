import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INSIGHT_QUEUE, INSIGHT_JOB_ORCHESTRATE } from '../../infrastructure/queue/insight-queue.constants';

/**
 * WeeklyInsightSchedulerService
 *
 * Đăng ký BullMQ Repeatable Job để trigger weekly insight orchestration.
 * Chạy vào 6:00 AM Chủ Nhật (Asia/Ho_Chi_Minh).
 *
 * Dùng BullMQ thay vì @Cron để đảm bảo job chỉ fire đúng một lần
 * dù backend chạy trên nhiều instance (Distributed Cron pattern).
 */
@Injectable()
export class WeeklyInsightSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(WeeklyInsightSchedulerService.name);
  private readonly REPEATABLE_JOB_KEY = 'weekly-insight-orchestrator';

  constructor(
    @InjectQueue(INSIGHT_QUEUE)
    private readonly insightQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerRepeatableJob();
  }

  /**
   * Đăng ký Repeatable Job vào BullMQ.
   * Nếu đã có job với cùng key thì xóa và tạo lại để đảm bảo cấu hình mới nhất.
   */
  private async registerRepeatableJob(): Promise<void> {
    try {
      // Xóa các repeatable job cũ cùng tên để tránh duplicate
      const repeatableJobs = await this.insightQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === INSIGHT_JOB_ORCHESTRATE) {
          await this.insightQueue.removeRepeatableByKey(job.key);
          this.logger.log(`🗑️ Đã xóa repeatable job cũ: ${job.key}`);
        }
      }

      // Đăng ký Repeatable Job mới: 6:00 AM mỗi Chủ Nhật
      await this.insightQueue.add(
        INSIGHT_JOB_ORCHESTRATE,
        {},
        {
          repeat: {
            pattern: '0 6 * * 0', // Chủ Nhật 6:00 AM
            tz: 'Asia/Ho_Chi_Minh',
          },
          jobId: this.REPEATABLE_JOB_KEY,
          priority: 5,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );

      this.logger.log(
        '✅ Đã đăng ký Repeatable Job: weekly-insight-orchestrator (Chủ Nhật 06:00 AM +07)',
      );
    } catch (error) {
      this.logger.error('❌ Lỗi khi đăng ký Repeatable Job:', error);
    }
  }
}
