import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiaryDocument } from './diary.schema';

@Injectable()
export class DiaryRepository {
  constructor(
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
  ) {}

  async findByIds(ids: string[], userId?: string): Promise<DiaryDocument[]> {
    // Note: If userId is provided and we need strict ownership checking,
    // we would join with FarmPlot to verify user_id.
    // For now, pgvector pre-filters by userId so the ids are already trusted.
    return this.diaryModel
      .find({
        _id: { $in: ids },
        status: { $ne: 'deleted' },
      })
      .exec();
  }

  async findById(id: string): Promise<DiaryDocument | null> {
    return this.diaryModel
      .findOne({ _id: id, status: { $ne: 'deleted' } })
      .exec();
  }
}
