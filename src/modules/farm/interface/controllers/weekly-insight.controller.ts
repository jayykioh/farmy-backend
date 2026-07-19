import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { WeeklyInsightRepository } from '../../infrastructure/persistence/weekly-insight.repository';
import {
  INSIGHT_QUEUE,
  INSIGHT_JOB_GENERATE,
} from '../../infrastructure/queue/insight-queue.constants';

@Controller('api/v1/weekly-insights')
@UseGuards(JwtAuthGuard)
export class WeeklyInsightController {
  constructor(
    private readonly insightRepository: WeeklyInsightRepository,
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
      created_at: doc.get('created_at') as Date,
    }));
    return {
      success: true,
      data,
    };
  }

  @Post('trigger')
  async triggerInsight(@CurrentUser('id') userId: string) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysFromMonday);
    monday.setUTCHours(0, 0, 0, 0);

    const weekStartDateStr = monday.toISOString();

    await this.insightQueue.add(
      INSIGHT_JOB_GENERATE,
      { userId, weekStartDate: weekStartDateStr },
      {
        priority: 1, // High priority for manual trigger
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return {
      success: true,
      message: 'Weekly insight generation triggered successfully.',
    };
  }
}
