import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Inject,
  NotFoundException,
  Res,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { UserConsentDocument } from '../../infrastructure/persistence/user-consent.schema';
import { UserConsentDto } from '../dtos/user-consent.dto';
import { RefreshTokenDocument } from '../../infrastructure/persistence/refresh-token.schema';
import { FarmPlotDocument } from '../../../farm/infrastructure/persistence/farm-plot.schema';
import { DiaryDocument } from '../../../farm/infrastructure/persistence/diary.schema';
import { DiaryLogDocument } from '../../../farm/infrastructure/persistence/diary-log.schema';
import { ReminderDocument } from '../../../farm/infrastructure/persistence/reminder.schema';
import { PetStateDocument } from '../../../pet/infrastructure/persistence/pet-state.schema';
import { AiChatDocument } from '../../../ai/infrastructure/persistence/ai-chat.schema';
import { AiChatMemoryDocument } from '../../../ai/infrastructure/persistence/ai-chat-memory.schema';
import { AiFeedbackDocument } from '../../../ai/infrastructure/persistence/ai-feedback.schema';
import { PlantScanDocument } from '../../../ai/infrastructure/persistence/plant-scan.schema';

@Controller('api/v1/users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @InjectModel(UserConsentDocument.name)
    private readonly consentModel: Model<UserConsentDocument>,
    @InjectModel(RefreshTokenDocument.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(FarmPlotDocument.name)
    private readonly farmPlotModel: Model<FarmPlotDocument>,
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
    @InjectModel(DiaryLogDocument.name)
    private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectModel(ReminderDocument.name)
    private readonly reminderModel: Model<ReminderDocument>,
    @InjectModel(PetStateDocument.name)
    private readonly petStateModel: Model<PetStateDocument>,
    @InjectModel(AiChatDocument.name)
    private readonly aiChatModel: Model<AiChatDocument>,
    @InjectModel(AiChatMemoryDocument.name)
    private readonly aiChatMemoryModel: Model<AiChatMemoryDocument>,
    @InjectModel(AiFeedbackDocument.name)
    private readonly aiFeedbackModel: Model<AiFeedbackDocument>,
    @InjectModel(PlantScanDocument.name)
    private readonly plantScanModel: Model<PlantScanDocument>,
    @InjectQueue('privacy')
    private readonly privacyQueue: Queue,
  ) {}

  @Get('me/consents')
  async getConsents(@CurrentUser() currentUser: AuthenticatedUser) {
    const consents = await this.consentModel
      .find({ user_id: currentUser.id })
      .exec();
    return {
      success: true,
      data: consents,
    };
  }

  @Post('me/consents')
  async saveConsent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UserConsentDto,
  ) {
    // Upsert consent record
    const consent = await this.consentModel.findOneAndUpdate(
      { user_id: currentUser.id, consent_type: dto.consent_type } as any,
      {
        granted: dto.granted,
        policy_version: dto.policy_version,
      },
      { upsert: true, new: true },
    ).exec();

    return {
      success: true,
      message: 'Cập nhật consent thành công.',
      data: consent,
    };
  }

  @Delete('me')
  async deleteAccount(@CurrentUser() currentUser: AuthenticatedUser) {
    const userAggregate = await this.userRepository.findById(currentUser.id);
    if (!userAggregate || userAggregate.isDeletedUser()) {
      throw new NotFoundException('Người dùng không tồn tại hoặc đã bị xóa!');
    }

    // 1. Soft delete user record in repository
    const scrambledEmail = `deleted_${currentUser.id}@deleted.invalid`;
    userAggregate.softDelete(scrambledEmail);
    await this.userRepository.save(userAggregate);

    // 2. Revoke all refresh tokens immediately
    await this.refreshTokenModel
      .updateMany({ userId: currentUser.id }, { $set: { isRevoked: true } })
      .exec();

    // 3. Queue BullMQ job to hard delete user data after 30 days
    // 30 days = 30 * 24 * 60 * 60 * 1000 milliseconds
    const delay = 30 * 24 * 60 * 60 * 1000;
    await this.privacyQueue.add(
      'delete-user-data',
      { userId: currentUser.id },
      {
        delay,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    // 4. Pino logging (Audit log)
    this.logger.log(`Audit Log: user.delete_account | UserID: ${currentUser.id}`);

    return {
      success: true,
      message: 'Tài khoản đã được xóa mềm. Mọi dữ liệu liên quan sẽ hoàn toàn bị xóa sau 30 ngày.',
    };
  }

  @Get('me/export')
  async exportUserData(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res() res: Response,
  ) {
    // Fetch all user data concurrently
    const [
      user,
      consents,
      plots,
      reminders,
      chats,
      chatMemories,
      feedbacks,
      scans,
      petState,
    ] = await Promise.all([
      this.userRepository.findById(currentUser.id),
      this.consentModel.find({ user_id: currentUser.id }).exec(),
      this.farmPlotModel.find({ user_id: currentUser.id }).exec(),
      this.reminderModel.find({ user_id: currentUser.id }).exec(),
      this.aiChatModel.find({ user_id: currentUser.id }).exec(),
      this.aiChatMemoryModel.find({ user_id: currentUser.id }).exec(),
      this.aiFeedbackModel.find({ user_id: currentUser.id }).exec(),
      this.plantScanModel.find({ user_id: currentUser.id }).exec(),
      this.petStateModel.findOne({ user_id: currentUser.id }).exec(),
    ]);

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại!');
    }

    // Find diaries for user plots
    const plotIds = plots.map((p) => p._id);
    const diaries = await this.diaryModel.find({ plot_id: { $in: plotIds } }).exec();
    const diaryIds = diaries.map((d) => d._id);

    // Find diary logs
    const diaryLogs = await this.diaryLogModel
      .find({ diary_id: { $in: diaryIds } })
      .exec();

    // Assemble export package (sanitize user object to protect sensitive data)
    const exportPackage = {
      exportedAt: new Date(),
      user: {
        id: user.getId(),
        name: user.getName(),
        email: user.getEmail(),
        role: user.getRole(),
        is_deleted: user.isDeletedUser(),
        deleted_at: user.getDeletedAt(),
      },
      consents,
      plots,
      diaries,
      diaryLogs,
      reminders,
      chats,
      chatMemories,
      feedbacks,
      scans,
      petState,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=farmy_user_data_${currentUser.id}.json`,
    );
    return res.send(JSON.stringify(exportPackage, null, 2));
  }
}
