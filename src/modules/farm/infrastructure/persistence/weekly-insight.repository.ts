import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { WeeklyInsightDocument } from './weekly-insight.schema';

export interface UpsertWeeklyInsightDto {
  insight_text: string;
  model_used: string;
  tokens_used: number;
  diary_id?: string;
  crop_type?: string;
  season?: string;
}

/**
 * WeeklyInsightRepository
 *
 * Tầng persistence cho weekly_insights collection.
 * Đảm bảo mỗi mùa vụ (diary_id) chỉ có tối đa 1 bản báo cáo mỗi tuần.
 */
@Injectable()
export class WeeklyInsightRepository implements OnModuleInit {
  private readonly logger = new Logger(WeeklyInsightRepository.name);

  constructor(
    @InjectModel(WeeklyInsightDocument.name)
    private readonly model: Model<WeeklyInsightDocument>,
  ) {}

  /**
   * Tự động xóa index cũ (user_id_1_week_start_date_1) nếu có trong MongoDB
   * để mỗi mùa vụ (diary_id) của user đều có thể có 1 báo cáo riêng mỗi tuần.
   */
  async onModuleInit() {
    try {
      const collection = this.model.collection;
      const indexes = await collection.indexes();
      const legacyIndex = indexes.find((idx) => idx.name === 'user_id_1_week_start_date_1');
      if (legacyIndex) {
        this.logger.log('🧹 Phát hiện index cũ "user_id_1_week_start_date_1". Đang tiến hành drop index...');
        await collection.dropIndex('user_id_1_week_start_date_1');
        this.logger.log('✅ Đã xóa thành công index cũ! Bây giờ mỗi mùa vụ sẽ có 1 báo cáo riêng/tuần.');
      }
    } catch (err: any) {
      this.logger.warn(`Lưu ý khi kiểm tra/xóa index legacy: ${err?.message}`);
    }
  }

  /**
   * Tạo mới hoặc cập nhật insight của user trong tuần xác định cho từng mùa vụ (diary_id).
   */
  async upsert(
    userId: string,
    weekStartDate: Date,
    data: UpsertWeeklyInsightDto,
  ): Promise<WeeklyInsightDocument> {
    const filter: any = {
      user_id: userId,
      week_start_date: weekStartDate,
      ...(data.diary_id ? { diary_id: data.diary_id } : {}),
    };
    const update = {
      $set: {
        insight_text: data.insight_text,
        model_used: data.model_used,
        tokens_used: data.tokens_used,
        ...(data.diary_id ? { diary_id: data.diary_id } : {}),
        ...(data.crop_type ? { crop_type: data.crop_type } : {}),
        ...(data.season ? { season: data.season } : {}),
      },
      $setOnInsert: {
        _id: randomUUID(),
      },
    };

    try {
      const doc = await this.model
        .findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' })
        .exec();

      this.logger.log({
        action: 'weekly-insight.upsert',
        userId,
        diary_id: data.diary_id,
        week_start_date: weekStartDate.toISOString().split('T')[0],
      });

      return doc!;
    } catch (err: any) {
      if (err?.code === 11000 || err?.message?.includes('E11000')) {
        this.logger.warn(
          `[WeeklyInsightRepository] Lỗi E11000 duplicate key. Thử ghi đè theo user_id & week_start_date...`
        );
        const fallbackFilter = {
          user_id: userId,
          week_start_date: weekStartDate,
        };
        const doc = await this.model
          .findOneAndUpdate(fallbackFilter, update, { upsert: true, returnDocument: 'after' })
          .exec();
        return doc!;
      }
      throw err;
    }
  }

  /** Tìm danh sách insight của một user */
  async findByUser(
    userId: string,
    limit: number = 10,
  ): Promise<WeeklyInsightDocument[]> {
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

  /**
   * Tìm insight theo tuần cụ thể của 1 mùa vụ.
   * Đảm bảo kiểm tra đúng duy nhất (user_id, diary_id, week_start_date).
   */
  async findByWeek(
    userId: string,
    weekStartDate: Date,
    diaryId?: string,
  ): Promise<WeeklyInsightDocument | null> {
    const query: any = {
      user_id: userId,
      week_start_date: weekStartDate,
    };
    if (diaryId) {
      query.diary_id = diaryId;
    }
    return this.model.findOne(query).exec();
  }
}
