import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { UserDocument } from '../persistence/user.schema';
import { RefreshTokenDocument } from '../persistence/refresh-token.schema';
import { UserConsentDocument } from '../persistence/user-consent.schema';
import { FarmPlotDocument } from '../../../farm/infrastructure/persistence/farm-plot.schema';
import { DiaryDocument } from '../../../farm/infrastructure/persistence/diary.schema';
import { DiaryLogDocument } from '../../../farm/infrastructure/persistence/diary-log.schema';
import { ReminderDocument } from '../../../farm/infrastructure/persistence/reminder.schema';
import { PetStateDocument } from '../../../pet/infrastructure/persistence/pet-state.schema';
import { AiChatDocument } from '../../../ai/infrastructure/persistence/ai-chat.schema';
import { AiChatMemoryDocument } from '../../../ai/infrastructure/persistence/ai-chat-memory.schema';
import { AiFeedbackDocument } from '../../../ai/infrastructure/persistence/ai-feedback.schema';
import { PlantScanDocument } from '../../../ai/infrastructure/persistence/plant-scan.schema';
import { R2StorageService } from '../../../storage/r2-storage.service';

@Processor('privacy')
export class PrivacyProcessor extends WorkerHost {
  private readonly logger = new Logger(PrivacyProcessor.name);

  constructor(
    @InjectModel(UserDocument.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshTokenDocument.name) private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(UserConsentDocument.name) private readonly consentModel: Model<UserConsentDocument>,
    @InjectModel(FarmPlotDocument.name) private readonly farmPlotModel: Model<FarmPlotDocument>,
    @InjectModel(DiaryDocument.name) private readonly diaryModel: Model<DiaryDocument>,
    @InjectModel(DiaryLogDocument.name) private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectModel(ReminderDocument.name) private readonly reminderModel: Model<ReminderDocument>,
    @InjectModel(PetStateDocument.name) private readonly petStateModel: Model<PetStateDocument>,
    @InjectModel(AiChatDocument.name) private readonly aiChatModel: Model<AiChatDocument>,
    @InjectModel(AiChatMemoryDocument.name) private readonly aiChatMemoryModel: Model<AiChatMemoryDocument>,
    @InjectModel(AiFeedbackDocument.name) private readonly aiFeedbackModel: Model<AiFeedbackDocument>,
    @InjectModel(PlantScanDocument.name) private readonly plantScanModel: Model<PlantScanDocument>,
    private readonly r2StorageService: R2StorageService,
  ) {
    super();
  }

  async process(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;
    this.logger.log(`Hard deleting user data for user ID: ${userId}`);

    try {
      // 1. Delete images from Cloudflare R2
      // Find plots -> diaries -> diary logs -> images
      const plots = await this.farmPlotModel.find({ user_id: userId }).exec();
      const plotIds = plots.map((p) => p._id);

      const diaries = await this.diaryModel.find({ plot_id: { $in: plotIds } }).exec();
      const diaryIds = diaries.map((d) => d._id);

      const logs = await this.diaryLogModel.find({ diary_id: { $in: diaryIds } }).exec();
      for (const log of logs) {
        if (log.image_url) {
          const key = this.extractR2Key(log.image_url);
          try {
            await this.r2StorageService.deleteFile(key);
          } catch (err: any) {
            this.logger.error(`Failed to delete log photo ${key}: ${err.message}`);
          }
        }
      }

      // Delete plant scan images from R2
      const scans = await this.plantScanModel.find({ user_id: userId }).exec();
      for (const scan of scans) {
        if (scan.image_url) {
          const key = this.extractR2Key(scan.image_url);
          try {
            await this.r2StorageService.deleteFile(key);
          } catch (err: any) {
            this.logger.error(`Failed to delete scan photo ${key}: ${err.message}`);
          }
        }
      }

      // 2. Delete database records across all user-related collections
      await this.aiChatModel.deleteMany({ user_id: userId }).exec();
      await this.aiChatMemoryModel.deleteMany({ user_id: userId }).exec();
      await this.aiFeedbackModel.deleteMany({ user_id: userId }).exec();
      await this.plantScanModel.deleteMany({ user_id: userId }).exec();
      await this.petStateModel.deleteMany({ user_id: userId }).exec();
      await this.reminderModel.deleteMany({ user_id: userId }).exec();
      await this.diaryLogModel.deleteMany({ diary_id: { $in: diaryIds } }).exec();
      await this.diaryModel.deleteMany({ plot_id: { $in: plotIds } }).exec();
      await this.farmPlotModel.deleteMany({ user_id: userId }).exec();
      await this.consentModel.deleteMany({ user_id: userId }).exec();
      await this.refreshTokenModel.deleteMany({ userId }).exec();
      await this.userModel.deleteOne({ _id: userId }).exec();

      this.logger.log(`Successfully hard-deleted user data for: ${userId}`);
    } catch (error: any) {
      this.logger.error(`Failed to hard delete user data: ${error.message}`, error.stack);
      throw error;
    }
  }

  private extractR2Key(url: string): string {
    try {
      const parsedUrl = new URL(url);
      let key = parsedUrl.pathname;
      if (key.startsWith('/')) {
        key = key.substring(1);
      }
      return key;
    } catch {
      return url;
    }
  }
}
