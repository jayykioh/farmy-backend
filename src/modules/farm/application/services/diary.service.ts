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
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EmbeddingRepository } from '../../../ai/infrastructure/persistence/embedding.repository';
import { IdempotencyExecutionService } from './idempotency-execution.service';

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
    @InjectQueue('embedding_queue')
    private readonly embedQueue: Queue,
    private readonly embeddingRepository: EmbeddingRepository,
    private readonly idempotencyExecutionService: IdempotencyExecutionService,
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
      user_id: userId,
      activity_type: dto.activity_type,
      content: dto.content,
      image_url: dto.image_url,
    });

    // Tăng streak và cập nhật trạng thái thú ảo
    await this.petService.updateStreakAndMoodOnDiaryCreated(userId);

    const savedLog = await log.save();

    const contentHash = crypto
      .createHash('sha256')
      .update(savedLog.content)
      .digest('hex');
    await this.embedQueue.add(
      'embed_document',
      {
        sourceId: savedLog._id.toString(),
        sourceType: 'diary_log',
        text: savedLog.content,
        metadata: { user_id: userId },
      },
      { jobId: `embed:diary_log:${savedLog._id}:${contentHash}` },
    );

    return savedLog;
  }

  async createIdempotentLog(
    userId: string,
    diaryId: string,
    idempotencyKey: string,
    requestHash: string,
    dto: CreateDiaryLogDto,
  ): Promise<DiaryLogDocument> {
    await this.verifyDiaryOwner(userId, diaryId);

    // 1. Acquire Lock
    const execution =
      await this.idempotencyExecutionService.acquireOrTakeoverLock(
        userId,
        idempotencyKey,
        requestHash,
      );

    if (execution.status === 'completed') {
      return execution.responseData as DiaryLogDocument;
    }

    // 2. Mock R2 Upload (Save paths to `uploadedKeys`)
    // execution.uploadedKeys.push('some/path/on/r2');
    // await execution.save();

    // 3. Mongo Transaction
    const session = await this.diaryModel.db.startSession();
    try {
      let savedLog: DiaryLogDocument;
      await session.withTransaction(async () => {
        const log = new this.diaryLogModel({
          _id: crypto.randomUUID(),
          diary_id: diaryId,
          user_id: userId,
          idempotency_key: idempotencyKey,
          activity_type: dto.activity_type,
          content: dto.content,
          image_url: dto.image_url,
        });

        await this.petService.updateStreakAndMoodOnDiaryCreated(
          userId,
          session,
        );

        savedLog = await log.save({ session });

        execution.status = 'completed';
        execution.responseData = savedLog;
        await execution.save({ session });
      });

      // 4. Outbox pattern: Background tasks outside the transaction
      const contentHash = crypto
        .createHash('sha256')
        .update(savedLog!.content)
        .digest('hex');
      await this.embedQueue.add(
        'embed_document',
        {
          sourceId: savedLog!._id.toString(),
          sourceType: 'diary_log',
          text: savedLog!.content,
          metadata: { user_id: userId },
        },
        { jobId: `embed:diary_log:${savedLog!._id}:${contentHash}` },
      );

      return savedLog!;
    } catch (error) {
      // 5. Cleanup R2 if transaction fails (only if we still own the lock)
      const currentExecution = await this.idempotencyExecutionService[
        'executionModel'
      ]
        .findById(execution._id)
        .exec();
      if (
        currentExecution &&
        currentExecution.ownerToken === execution.ownerToken
      ) {
        currentExecution.status = 'failed';
        await currentExecution.save();
      }
      throw error;
    } finally {
      await session.endSession();
    }
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

    const savedLog = await log.save();

    const contentHash = crypto
      .createHash('sha256')
      .update(savedLog.content)
      .digest('hex');
    await this.embedQueue.add(
      'embed_document',
      {
        sourceId: savedLog._id.toString(),
        sourceType: 'diary_log',
        text: savedLog.content,
        metadata: { user_id: userId },
      },
      { jobId: `embed:diary_log:${savedLog._id}:${contentHash}` },
    );

    return savedLog;
  }

  async removeLog(userId: string, logId: string): Promise<void> {
    const log = await this.findOneLog(userId, logId);
    await this.diaryLogModel.deleteOne({ _id: log._id }).exec();
    await this.embeddingRepository.deactivateBySourceId(log._id.toString());
  }
}
