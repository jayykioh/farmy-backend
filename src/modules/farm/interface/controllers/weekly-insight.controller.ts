import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { WeeklyInsightRepository } from '../../infrastructure/persistence/weekly-insight.repository';
import { DiaryService } from '../../application/services/diary.service';
import {
  INSIGHT_QUEUE,
  INSIGHT_JOB_GENERATE,
} from '../../infrastructure/queue/insight-queue.constants';

@Controller('api/v1/weekly-insights')
@UseGuards(JwtAuthGuard)
export class WeeklyInsightController {
  constructor(
    private readonly insightRepository: WeeklyInsightRepository,
    private readonly diaryService: DiaryService,
    @InjectQueue(INSIGHT_QUEUE)
    private readonly insightQueue: Queue,
  ) {}

  @Get()
  async getInsights(
    @CurrentUser('id') userId: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    const docs = await this.insightRepository.findByUser(userId, limit);
    const data = docs.map((doc) => ({
      id: doc._id,
      user_id: doc.user_id,
      week_start_date: doc.week_start_date,
      insight_text: doc.insight_text,
      diary_id: doc.diary_id,
      crop_type: doc.crop_type,
      season: doc.season,
      created_at: doc.get('created_at') as Date,
    }));
    return {
      success: true,
      data,
    };
  }

  @Post('trigger')
  async triggerInsight(
    @CurrentUser('id') userId: string,
    @Body() body: { diary_id?: string },
  ) {
    const diaryId = body?.diary_id?.trim();
    if (!diaryId) {
      throw new BadRequestException('Vui lòng chọn mùa vụ cần phân tích.');
    }

    // findOne đồng thời xác thực mùa vụ tồn tại và thuộc user hiện tại.
    const diary = await this.diaryService.findOne(userId, diaryId);
    // Tính ngày đầu tuần hiện tại (Thứ Hai, UTC)
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysFromMonday);
    monday.setUTCHours(0, 0, 0, 0);

    // Kiểm tra xem tuần này đã có insight chưa
    const existing = await this.insightRepository.findByWeek(userId, monday, diaryId);
    if (existing) {
      return {
        success: false,
        already_exists: true,
        message: `✅ Mùa vụ ${diary.crop_type}${diary.season ? ` (${diary.season})` : ''} đã có báo cáo tuần này!`,
        week_start_date: monday.toISOString(),
        existing_insight_id: existing._id,
      };
    }

    // Chưa có → đẩy job vào queue để sinh insight
    const weekStartDateStr = monday.toISOString();
    await this.insightQueue.add(
      INSIGHT_JOB_GENERATE,
      {
        userId,
        diaryId,
        cropType: diary.crop_type,
        season: diary.season,
        weekStartDate: weekStartDateStr,
      },
      {
        jobId: `weekly-insight-${userId}-${diaryId}-${weekStartDateStr.slice(0, 10)}`,
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return {
      success: true,
      already_exists: false,
      message: '🚀 Đang sinh báo cáo phân tích tuần... Vui lòng chờ khoảng 15-30 giây rồi tải lại trang.',
      week_start_date: weekStartDateStr,
      diary_id: diaryId,
    };
  }
}
