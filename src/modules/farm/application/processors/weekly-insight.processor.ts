import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiaryLogDocument } from '../../infrastructure/persistence/diary-log.schema';
import { DiaryDocument } from '../../infrastructure/persistence/diary.schema';
import { WeeklyInsightRepository } from '../../infrastructure/persistence/weekly-insight.repository';
import { RAGService } from '../../../ai/application/services/rag.service';
import { PromptService } from '../../../ai/application/services/prompt.service';
import { LLMService } from '../../../ai/application/services/llm.service';
import type { DiaryEntry } from '../../../ai/domain/prompt.types';
import {
  INSIGHT_QUEUE,
  INSIGHT_JOB_GENERATE,
} from '../../infrastructure/queue/insight-queue.constants';
import type { GenerateInsightPayload } from './weekly-insight-orchestrator.processor';

/**
 * WeeklyInsightProcessor
 *
 * Per-user worker: nhận job "generate_insight", chạy toàn bộ AI pipeline,
 * lưu kết quả vào collection weekly_insights.
 *
 * Sử dụng onRateLimit: 'throw' để BullMQ tự retry khi Gemini bị rate limit.
 */
@Processor(INSIGHT_QUEUE)
export class WeeklyInsightProcessor extends WorkerHost {
  private readonly logger = new Logger(WeeklyInsightProcessor.name);

  constructor(
    @InjectModel(DiaryLogDocument.name)
    private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
    private readonly ragService: RAGService,
    private readonly promptService: PromptService,
    private readonly llmService: LLMService,
    private readonly weeklyInsightRepository: WeeklyInsightRepository,
  ) {
    super();
  }

  async process(job: Job<GenerateInsightPayload>): Promise<void> {
    // Chỉ xử lý job generate_insight
    if (job.name !== INSIGHT_JOB_GENERATE) return;

    const {
      userId,
      diaryId,
      cropType,
      season,
      weekStartDate: weekStartDateStr,
    } = job.data;
    const weekStartDate = new Date(weekStartDateStr);

    this.logger.log(
      `[WeeklyInsightProcessor] 🚀 Bắt đầu xử lý Job id=${job.id} | userId=${userId} | diaryId=${diaryId} | weekStartDate=${weekStartDateStr}`
    );

    try {
      // Chặn job trùng trước khi gọi AI. Unique index/upsert vẫn là lớp bảo vệ cuối.
      const existing = await this.weeklyInsightRepository.findByWeek(
        userId,
        weekStartDate,
        diaryId,
      );
      if (existing) {
        this.logger.warn({
          action: 'weekly-insight.skip',
          reason: 'Insight của mùa vụ trong tuần đã tồn tại',
          userId,
          diaryId,
        });
        return;
      }

      // 1. Fetch diary logs của user trong 7 ngày qua
      const diaryLogs = await this.getRecentDiaryLogs(
        userId,
        weekStartDate,
        diaryId,
      );

      // 2. Kiểm tra nhật ký activity
      if (diaryLogs.length === 0) {
        this.logger.log(
          `[WeeklyInsightProcessor] ℹ️ Không tìm thấy ghi chép nhật ký trong 7 ngày qua cho mùa vụ ${cropType || diaryId}. Tiến hành tạo báo cáo khởi tạo (baseline insight)...`
        );
      } else {
        this.logger.log(
          `[WeeklyInsightProcessor] 📝 Tìm thấy ${diaryLogs.length} ghi chép nhật ký hợp lệ trong 7 ngày qua`
        );
      }

      // 3. Map sang DiaryEntry shape mà PromptService cần
      const diaryEntries: DiaryEntry[] = diaryLogs.map((log) => ({
        notes: log.content,
        created_at: (log as any).created_at ?? new Date(),
        crop_type: cropType,
      }));

      // 4. Lấy RAG context về nông nghiệp cho user này
      const cropContext = cropType
        ? ` cho mùa vụ ${cropType}${season ? ` (${season})` : ''}`
        : '';
      const ragQuery = `Tổng hợp tình hình nông trại tuần này${cropContext}, người dùng ${userId}`;
      this.logger.log(`[WeeklyInsightProcessor] 🔍 Đang truy vấn RAG Context: "${ragQuery}"`);
      const ragResult = await this.ragService.retrieveContext(ragQuery, userId);

      // 5. Build prompt
      const builtPrompt = this.promptService.buildWeeklyInsightPrompt({
        diaries: diaryEntries,
        ragContext: ragResult.context_text,
      });

      // 6. Gọi Gemini (onRateLimit: 'throw' → BullMQ tự retry)
      this.logger.log(`[WeeklyInsightProcessor] 🤖 Đang gọi Gemini AI LLM service...`);
      const llmResult = await this.llmService.complete({
        prompt: builtPrompt.prompt,
        promptVersion: builtPrompt.promptVersion,
        maxTokens: 500,
        onRateLimit: 'throw',
      });

      // 7. Lưu insight vào MongoDB (upsert — idempotent nếu retry)
      this.logger.log(`[WeeklyInsightProcessor] 💾 Đang lưu bản ghi insight vào MongoDB...`);
      await this.weeklyInsightRepository.upsert(userId, weekStartDate, {
        insight_text: llmResult.text,
        model_used: 'gemini-1.5-flash',
        tokens_used:
          (llmResult.promptTokens ?? 0) + (llmResult.completionTokens ?? 0),
        ...(diaryId ? { diary_id: diaryId } : {}),
        ...(cropType ? { crop_type: cropType } : {}),
        ...(season ? { season } : {}),
      });

      this.logger.log({
        action: 'weekly-insight.done',
        userId,
        week_start_date: weekStartDateStr,
        tokens_used:
          (llmResult.promptTokens ?? 0) + (llmResult.completionTokens ?? 0),
      });
    } catch (error: any) {
      this.logger.error(
        `[WeeklyInsightProcessor] 💥 Lỗi khi xử lý job generate insight cho userId=${userId}, diaryId=${diaryId}: ${error?.message || error}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * Lấy diary logs của user trong tuần xác định.
   * DiaryLog không có user_id trực tiếp — cần join qua Diary → FarmPlot.
   */
  private async getRecentDiaryLogs(
    userId: string,
    weekStartDate: Date,
    diaryId?: string,
  ): Promise<DiaryLogDocument[]> {
    const sevenDaysAgo = new Date(weekStartDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Tìm diaries thuộc user (qua farm_plots)
    const userDiaries = await this.diaryModel.aggregate<{ _id: string }>([
      {
        $lookup: {
          from: 'farm_plots',
          localField: 'plot_id',
          foreignField: '_id',
          as: 'plot',
        },
      },
      { $unwind: '$plot' },
      { $match: { 'plot.user_id': userId, status: { $ne: 'deleted' } } },
      ...(diaryId ? [{ $match: { _id: diaryId } }] : []),
      { $project: { _id: 1 } },
    ]);

    const diaryIds = userDiaries.map((d) => d._id);
    this.logger.log(`[getRecentDiaryLogs] userId=${userId}, diaryId=${diaryId} -> userDiaries found: ${diaryIds.length} (${JSON.stringify(diaryIds)})`);
    if (diaryIds.length === 0) return [];

    return this.diaryLogModel
      .find({
        diary_id: { $in: diaryIds },
        created_at: { $gte: sevenDaysAgo },
      })
      .sort({ created_at: -1 })
      .limit(50) // giới hạn để tránh prompt quá dài
      .exec();
  }
}
