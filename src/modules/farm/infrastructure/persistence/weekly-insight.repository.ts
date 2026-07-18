import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { WeeklyInsightDocument } from './weekly-insight.schema';

export interface UpsertWeeklyInsightDto {
  insight_text: string;
  model_used: string;
  tokens_used: number;
}

/**
 * WeeklyInsightRepository
 *
 * Tầng persistence cho weekly_insights collection.
 * Phương thức upsert đảm bảo idempotent — retry job không tạo document trùng.
 */
@Injectable()
export class WeeklyInsightRepository {
  private readonly logger = new Logger(WeeklyInsightRepository.name);

  constructor(
    @InjectModel(WeeklyInsightDocument.name)
    private readonly model: Model<WeeklyInsightDocument>,
  ) {}

  /**
   * Tạo mới hoặc cập nhật insight của user trong tuần xác định.
   * Dựa vào unique index (user_id, week_start_date).
   */
  async upsert(
    userId: string,
    weekStartDate: Date,
    data: UpsertWeeklyInsightDto,
  ): Promise<WeeklyInsightDocument> {
    const filter = { user_id: userId, week_start_date: weekStartDate };
    const update = {
      $set: {
        insight_text: data.insight_text,
        model_used: data.model_used,
        tokens_used: data.tokens_used,
      },
      $setOnInsert: {
        _id: randomUUID(),
      },
    };
    const doc = await this.model
      .findOneAndUpdate(filter, update, { upsert: true, new: true })
      .exec();

    this.logger.log({
      action: 'weekly-insight.upsert',
      userId,
      week_start_date: weekStartDate.toISOString().split('T')[0],
    });

    return doc;
  }

  /** Tìm danh sách insight của một user */
  async findByUser(userId: string, limit: number = 10): Promise<WeeklyInsightDocument[]> {
    return this.model
      .find({ user_id: userId })
      .sort({ week_start_date: -1 })
      .limit(limit)
      .exec();
  }

  /** Tìm insight gần nhất của một user */
  async findLatestByUser(
    userId: string,
  ): Promise<WeeklyInsightDocument | null> {
    return this.model
      .findOne({ user_id: userId })
      .sort({ week_start_date: -1 })
      .exec();
  }
}
