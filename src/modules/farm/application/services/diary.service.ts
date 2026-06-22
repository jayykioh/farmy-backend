import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { DiaryDocument } from '../../infrastructure/persistence/diary.schema';
import { DiaryLogDocument } from '../../infrastructure/persistence/diary-log.schema';
import { FarmPlotDocument } from '../../infrastructure/persistence/farm-plot.schema';
import { CreateDiaryDto } from '../../interface/dtos/create-diary.dto';
import { UpdateDiaryDto } from '../../interface/dtos/update-diary.dto';
import { CreateDiaryLogDto } from '../../interface/dtos/create-diary-log.dto';
import { UpdateDiaryLogDto } from '../../interface/dtos/update-diary-log.dto';
import { PetService } from '../../../pet/application/services/pet.service';


@Injectable()
export class DiaryService {
  constructor(
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
    @InjectModel(DiaryLogDocument.name)
    private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectModel(FarmPlotDocument.name)
    private readonly farmPlotModel: Model<FarmPlotDocument>,
    private readonly petService: PetService,
  ) {}

  // Helpers to verify ownership
  private async verifyPlotOwner(userId: string, plotId: string): Promise<void> {
    const plot = await this.farmPlotModel.findById(plotId).exec();
    if (!plot) {
      throw new NotFoundException('Không tìm thấy mảnh vườn!');
    }
    if (plot.user_id !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập mảnh vườn này!',
      );
    }
  }

  private async verifyDiaryOwner(
    userId: string,
    diaryId: string,
  ): Promise<DiaryDocument> {
    const diary = await this.diaryModel.findById(diaryId).exec();
    if (!diary) {
      throw new NotFoundException('Không tìm thấy nhật ký vụ mùa!');
    }
    await this.verifyPlotOwner(userId, diary.plot_id);
    return diary;
  }

  // Diary CRUD
  async create(userId: string, dto: CreateDiaryDto): Promise<DiaryDocument> {
    await this.verifyPlotOwner(userId, dto.plot_id);

    const diary = new this.diaryModel({
      _id: crypto.randomUUID(),
      plot_id: dto.plot_id,
      crop_type: dto.crop_type,
      start_date: new Date(dto.start_date),
      status: 'active',
      metadata: {
        source: 'manual',
      },
    });
    return diary.save();
  }

  async findAll(userId: string): Promise<DiaryDocument[]> {
    // Get all plot IDs of the user
    const plots = await this.farmPlotModel.find({ user_id: userId }).exec();
    const plotIds = plots.map((p) => p._id);

    // Find all diaries belonging to these plots (exclude status: deleted)
    return this.diaryModel
      .find({
        plot_id: { $in: plotIds },
        status: { $ne: 'deleted' },
      })
      .exec();
  }

  async findOne(userId: string, id: string): Promise<DiaryDocument> {
    return this.verifyDiaryOwner(userId, id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateDiaryDto,
  ): Promise<DiaryDocument> {
    const diary = await this.verifyDiaryOwner(userId, id);

    if (dto.crop_type !== undefined) diary.crop_type = dto.crop_type;
    if (dto.start_date !== undefined)
      diary.start_date = new Date(dto.start_date);
    if (dto.status !== undefined) diary.status = dto.status;

    return diary.save();
  }

  async remove(userId: string, id: string): Promise<void> {
    const diary = await this.verifyDiaryOwner(userId, id);
    diary.status = 'deleted'; // soft delete
    await diary.save();
  }

  // DiaryLog CRUD
  async createLog(
    userId: string,
    diaryId: string,
    dto: CreateDiaryLogDto,
  ): Promise<DiaryLogDocument> {
    await this.verifyDiaryOwner(userId, diaryId);

    const log = new this.diaryLogModel({
      _id: crypto.randomUUID(),
      diary_id: diaryId,
      activity_type: dto.activity_type,
      content: dto.content,
      image_url: dto.image_url,
    });
    
    // Tăng streak và cập nhật trạng thái thú ảo
    await this.petService.updateStreakAndMoodOnDiaryCreated(userId);

    const savedLog = await log.save();

    // TODO: Enqueue embedding job via BullMQ
    // e.g., await this.embedQueue.add('embed_diary', { diaryId: savedLog._id.toString(), userId }, { priority: 3 });

    return savedLog;
  }

  async findAllLogs(
    userId: string,
    diaryId: string,
  ): Promise<DiaryLogDocument[]> {
    await this.verifyDiaryOwner(userId, diaryId);
    return this.diaryLogModel
      .find({ diary_id: diaryId })
      .sort({ created_at: -1 })
      .exec();
  }

  async findOneLog(userId: string, logId: string): Promise<DiaryLogDocument> {
    const log = await this.diaryLogModel.findById(logId).exec();
    if (!log) {
      throw new NotFoundException('Không tìm thấy hoạt động nhật ký!');
    }
    await this.verifyDiaryOwner(userId, log.diary_id);
    return log;
  }

  async updateLog(
    userId: string,
    logId: string,
    dto: UpdateDiaryLogDto,
  ): Promise<DiaryLogDocument> {
    const log = await this.findOneLog(userId, logId);

    if (dto.activity_type !== undefined) log.activity_type = dto.activity_type;
    if (dto.content !== undefined) log.content = dto.content;
    if (dto.image_url !== undefined) log.image_url = dto.image_url;

    return log.save();
  }

  async removeLog(userId: string, logId: string): Promise<void> {
    const log = await this.findOneLog(userId, logId);
    await this.diaryLogModel.deleteOne({ _id: log._id }).exec();
  }
}
