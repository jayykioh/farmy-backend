import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { DiaryLogDocument } from '../../infrastructure/persistence/diary-log.schema';
import {
  INSIGHT_QUEUE,
  INSIGHT_JOB_GENERATE,
  INSIGHT_JOB_ORCHESTRATE,
  INSIGHT_SPREAD_WINDOW_MS,
} from '../../infrastructure/queue/insight-queue.constants';

export interface GenerateInsightPayload {
  userId: string;
  diaryId?: string;
  cropType?: string;
  season?: string;
  weekStartDate: string; // ISO string
}

/**
 * WeeklyInsightOrchestratorProcessor
 *
 * Nhận job "schedule-weekly-insights" từ BullMQ Repeatable Job.
 * Tìm danh sách user đang hoạt động (có ít nhất 1 diary log trong 7 ngày qua).
 * Enqueue job "generate_insight" cho mỗi user với delay ngẫu nhiên (Delay Spreading).
 */
@Processor(INSIGHT_QUEUE)
export class WeeklyInsightOrchestratorProcessor extends WorkerHost {
  private readonly logger = new Logger(WeeklyInsightOrchestratorProcessor.name);

  constructor(
    @InjectModel(DiaryLogDocument.name)
    private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectQueue(INSIGHT_QUEUE)
    private readonly insightQueue: Queue<GenerateInsightPayload>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    // Chỉ xử lý job orchestrator
    if (job.name !== INSIGHT_JOB_ORCHESTRATE) return;

    this.logger.log(
      '🚀 [WeeklyInsight] Bắt đầu orchestration weekly insight...',
    );

    const weekStartDate = this.getWeekStartDate();
    const sevenDaysAgo = new Date(weekStartDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Lấy danh sách user đang hoạt động: có ít nhất 1 diary log trong 7 ngày qua
    const activeUserIds = await this.getActiveUserIds(sevenDaysAgo);

    if (activeUserIds.length === 0) {
      this.logger.log('📭 Không có user nào hoạt động trong tuần qua. Bỏ qua.');
      return;
    }

    this.logger.log(
      `👥 Tìm thấy ${activeUserIds.length} user đang hoạt động. Đang enqueue jobs...`,
    );

    // Xây dựng bulk jobs với delay ngẫu nhiên (Delay Spreading)
    const weekStartDateStr = weekStartDate.toISOString();
    const jobs = activeUserIds.map((userId) => ({
      name: INSIGHT_JOB_GENERATE,
      data: {
        userId,
        weekStartDate: weekStartDateStr,
      } satisfies GenerateInsightPayload,
      opts: {
        delay: Math.floor(Math.random() * INSIGHT_SPREAD_WINDOW_MS),
        priority: 10, // Ưu tiên thấp nhất — không block chat hay embedding
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }));

    // Enqueue tất cả trong một round-trip Redis duy nhất
    await this.insightQueue.addBulk(jobs);

    this.logger.log(
      `✅ [WeeklyInsight] Đã enqueue ${activeUserIds.length} jobs | weekStart: ${weekStartDateStr} | window: ${INSIGHT_SPREAD_WINDOW_MS / 60000} phút`,
    );
  }

  /**
   * Tính ngày Thứ Hai đầu tuần ISO hiện tại.
   * Ví dụ: nếu hôm nay là Chủ Nhật 22/06, trả về 16/06 (Thứ Hai đầu tuần đó).
   */
  private getWeekStartDate(): Date {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = CN, 1 = T2, ..., 6 = T7
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysFromMonday);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Truy vấn MongoDB để lấy user_id duy nhất của các user
   * có ít nhất một diary log từ ngày `since` đến nay.
   * DiaryLog không có user_id trực tiếp — dùng distinct trên diary_id rồi join sang Diary.
   */
  private async getActiveUserIds(since: Date): Promise<string[]> {
    // DiaryLog chỉ có diary_id, không có user_id trực tiếp.
    // Dùng aggregate để lookup sang Diary → FarmPlot → user_id.
    const result = await this.diaryLogModel.aggregate<{ userId: string }>([
      {
        $match: {
          created_at: { $gte: since },
        },
      },
      {
        $lookup: {
          from: 'diaries',
          localField: 'diary_id',
          foreignField: '_id',
          as: 'diary',
        },
      },
      { $unwind: '$diary' },
      {
        $lookup: {
          from: 'farm_plots',
          localField: 'diary.plot_id',
          foreignField: '_id',
          as: 'plot',
        },
      },
      { $unwind: '$plot' },
      {
        $group: {
          _id: '$plot.user_id',
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
        },
      },
    ]);

    return result.map((r) => r.userId);
  }
}
