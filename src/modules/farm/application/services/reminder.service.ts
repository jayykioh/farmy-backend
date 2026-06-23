import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  ReminderDocument,
  ReminderStatus,
} from '../../infrastructure/persistence/reminder.schema';
import { DiaryDocument } from '../../infrastructure/persistence/diary.schema';
import { FarmPlotDocument } from '../../infrastructure/persistence/farm-plot.schema';
import {
  CreateReminderDto,
  ReminderType,
} from '../../interface/dtos/create-reminder.dto';
import { UpdateReminderDto } from '../../interface/dtos/update-reminder.dto';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { PetService } from '../../../pet/application/services/pet.service';

@Injectable()
export class ReminderService {
  constructor(
    @InjectModel(ReminderDocument.name)
    private readonly reminderModel: Model<ReminderDocument>,
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
    @InjectModel(FarmPlotDocument.name)
    private readonly farmPlotModel: Model<FarmPlotDocument>,
    private readonly petService: PetService,
  ) {}

  private async verifyDiaryOwner(
    userId: string,
    diaryId: string,
  ): Promise<void> {
    const diary = await this.diaryModel.findById(diaryId).exec();
    if (!diary) {
      throw new NotFoundException('Không tìm thấy nhật ký vụ mùa!');
    }
    const plot = await this.farmPlotModel.findById(diary.plot_id).exec();
    if (!plot) {
      throw new NotFoundException('Không tìm thấy mảnh vườn liên quan!');
    }
    if (plot.user_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập nhật ký này!');
    }
  }

  async create(
    userId: string,
    dto: CreateReminderDto,
  ): Promise<ReminderDocument> {
    if (dto.diary_id) {
      await this.verifyDiaryOwner(userId, dto.diary_id);
    }

    const remindAt = new Date(dto.remind_at);

    // Tự động suy ra schedule_slot nếu client không truyền
    const scheduleSlot =
      dto.schedule_slot ??
      ReminderSchedulerService.resolveScheduleSlot(remindAt);

    const reminder = new this.reminderModel({
      _id: crypto.randomUUID(),
      user_id: userId,
      diary_id: dto.diary_id,
      title: dto.title,
      type: dto.type ?? 'diary',
      schedule_slot: scheduleSlot,
      action_type: dto.action_type ?? '',
      action_detail: dto.action_detail ?? '',
      remind_at: remindAt,
      status: 'pending',
      retry_count: 0,
      is_sent: false,
      repeat: dto.repeat ?? 'daily',
    });
    return reminder.save();
  }

  async findAll(userId: string): Promise<ReminderDocument[]> {
    return this.reminderModel
      .find({ user_id: userId })
      .sort({ remind_at: 1 })
      .exec();
  }

  async findPending(userId: string): Promise<ReminderDocument[]> {
    return this.reminderModel
      .find({ user_id: userId, status: 'pending' })
      .sort({ remind_at: 1 })
      .exec();
  }

  async findOne(userId: string, id: string): Promise<ReminderDocument> {
    const reminder = await this.reminderModel.findById(id).exec();
    if (!reminder) {
      throw new NotFoundException('Không tìm thấy nhắc nhở!');
    }
    if (reminder.user_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập nhắc nhở này!');
    }
    return reminder;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateReminderDto,
  ): Promise<ReminderDocument> {
    const reminder = await this.findOne(userId, id);

    if (dto.diary_id !== undefined) {
      if (dto.diary_id) {
        await this.verifyDiaryOwner(userId, dto.diary_id);
      }
      reminder.diary_id = dto.diary_id || undefined;
    }
    if (dto.title !== undefined) reminder.title = dto.title;
    if (dto.remind_at !== undefined) {
      reminder.remind_at = new Date(dto.remind_at);
      // Tự tính lại schedule_slot khi đổi giờ
      reminder.schedule_slot = ReminderSchedulerService.resolveScheduleSlot(
        reminder.remind_at,
      );
    }
    if (dto.type !== undefined) reminder.type = dto.type as ReminderType;
    if (dto.action_type !== undefined) reminder.action_type = dto.action_type;
    if (dto.action_detail !== undefined)
      reminder.action_detail = dto.action_detail;
    if (dto.status !== undefined) {
      reminder.status = dto.status as ReminderStatus;
      reminder.is_sent = dto.status === 'delivered';
    }
    if (dto.repeat !== undefined) {
      reminder.repeat = dto.repeat;
    }

    return reminder.save();
  }

  /** Đánh dấu hoàn thành thủ công (user click "Đã xong") */
  async complete(userId: string, id: string): Promise<ReminderDocument> {
    const reminder = await this.findOne(userId, id);
    reminder.status = 'delivered';
    reminder.is_sent = true;
    reminder.delivered_at = new Date();

    // Cập nhật trạng thái thú ảo
    await this.petService.updateMoodOnReminderCompleted(userId);

    return reminder.save();
  }

  /** Hủy reminder */
  async cancel(userId: string, id: string): Promise<ReminderDocument> {
    const reminder = await this.findOne(userId, id);
    reminder.status = 'cancelled';
    return reminder.save();
  }

  async remove(userId: string, id: string): Promise<void> {
    const reminder = await this.findOne(userId, id);
    await this.reminderModel.deleteOne({ _id: reminder._id }).exec();
  }
}
