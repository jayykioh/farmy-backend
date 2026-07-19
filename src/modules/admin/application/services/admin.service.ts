import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Password } from '../../../auth/domain/value-objects/password.value-object';
import { R2StorageService } from '../../../storage/r2-storage.service';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';
import { FarmPlotDocument } from '../../../farm/infrastructure/persistence/farm-plot.schema';
import { DiaryDocument } from '../../../farm/infrastructure/persistence/diary.schema';
import { PlantScanDocument } from '../../../plant-scan/infrastructure/persistence/plant-scan.schema';
import { KnowledgeSourceDocument } from '../../../knowledge/infrastructure/persistence/knowledge-source.schema';
import { ChatSessionDocument } from '../../../chat/infrastructure/persistence/chat-session.schema';
import { ReminderDocument } from '../../../farm/infrastructure/persistence/reminder.schema';

@Injectable()
export class AdminService {
  // Store dynamic config in-memory or fallback, in a real app it could be Redis or a Config DB.
  private systemConfig = {
    maintenanceMode: false,
    rateLimit: 100,
  };

  constructor(
    @InjectModel(UserDocument.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(FarmPlotDocument.name)
    private readonly farmPlotModel: Model<FarmPlotDocument>,
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
    @InjectModel(PlantScanDocument.name)
    private readonly plantScanModel: Model<PlantScanDocument>,
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly knowledgeModel: Model<KnowledgeSourceDocument>,
    @InjectModel(ChatSessionDocument.name)
    private readonly chatSessionModel: Model<ChatSessionDocument>,
    @InjectModel(ReminderDocument.name)
    private readonly reminderModel: Model<ReminderDocument>,
    private readonly storageService: R2StorageService,
  ) {}

  async getStats() {
    const [
      totalUsers,
      totalPlots,
      totalDiaries,
      totalScans,
      totalRAGFiles,
      totalSessions,
      totalReminders,
    ] = await Promise.all([
      this.userModel.countDocuments({ is_deleted: { $ne: true } }).exec(),
      this.farmPlotModel.countDocuments().exec(),
      this.diaryModel.countDocuments({ status: { $ne: 'deleted' } }).exec(),
      this.plantScanModel.countDocuments().exec(),
      this.knowledgeModel.countDocuments().exec(),
      this.chatSessionModel.countDocuments().exec(),
      this.reminderModel.countDocuments().exec(),
    ]);

    // Generate last 7 days chart data
    const scanTrends: { date: string; value: number }[] = [];
    const userTrends: { date: string; value: number }[] = [];
    const chatTrends: { date: string; value: number }[] = [];

    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const dayLabel = startOfDay.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
      });

      const [usersCount, scansCount, chatsCount] = await Promise.all([
        this.userModel
          .countDocuments({
            created_at: { $gte: startOfDay, $lte: endOfDay },
            is_deleted: { $ne: true },
          })
          .exec(),
        this.plantScanModel
          .countDocuments({
            created_at: { $gte: startOfDay, $lte: endOfDay },
          })
          .exec(),
        this.chatSessionModel
          .countDocuments({
            created_at: { $gte: startOfDay, $lte: endOfDay },
          })
          .exec(),
      ]);

      userTrends.push({ date: dayLabel, value: usersCount });
      scanTrends.push({ date: dayLabel, value: scansCount });
      chatTrends.push({ date: dayLabel, value: chatsCount });
    }

    return {
      overview: {
        totalUsers,
        totalPlots,
        totalDiaries,
        totalScans,
        totalRAGFiles,
        totalSessions,
        totalReminders,
      },
      charts: {
        userTrends,
        scanTrends,
        chatTrends,
      },
    };
  }

  async getUsers(page = 1, limit = 10, search = '', role = '') {
    const skip = (page - 1) * limit;
    const query: any = { is_deleted: { $ne: true } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUserRole(userId: string, role: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    user.role = role;
    await user.save();
    return user;
  }

  async deleteUser(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    user.is_deleted = true;
    user.deleted_at = new Date();
    await user.save();
    return { success: true, message: 'Đã xóa mềm người dùng thành công' };
  }

  async getChatSessions(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      this.chatSessionModel
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ last_message_at: -1 })
        .populate({
          path: 'user_id',
          model: UserDocument.name,
          select: 'name email',
        })
        .exec(),
      this.chatSessionModel.countDocuments().exec(),
    ]);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRAGFiles() {
    return this.knowledgeModel.find().sort({ created_at: -1 }).exec();
  }

  async deleteRAGFile(fileId: string) {
    const file = await this.knowledgeModel.findById(fileId).exec();
    if (!file) {
      throw new NotFoundException('Không tìm thấy tệp tài liệu');
    }
    await this.knowledgeModel.findByIdAndDelete(fileId).exec();
    return { success: true, message: 'Đã xóa tài liệu tri thức' };
  }

  async getScans(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [scans, total] = await Promise.all([
      this.plantScanModel
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })
        .populate({
          path: 'user_id',
          model: UserDocument.name,
          select: 'name email',
        })
        .exec(),
      this.plantScanModel.countDocuments().exec(),
    ]);

    const scansWithUrls = await Promise.all(
      scans.map(async (scan) => {
        const scanObj = scan.toObject();
        let imageUrl: string | null = null;
        let thumbnailUrl: string | null = null;

        if (scan.image_key) {
          imageUrl = await this.storageService
            .getSignedUrl(scan.image_key)
            .catch(() => null);
        }
        if (scan.thumbnail_key) {
          thumbnailUrl = await this.storageService
            .getSignedUrl(scan.thumbnail_key)
            .catch(() => null);
        }

        return {
          ...scanObj,
          imageUrl,
          thumbnailUrl,
        };
      }),
    );

    return {
      scans: scansWithUrls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  getSystemConfig() {
    return this.systemConfig;
  }

  updateSystemConfig(config: {
    maintenanceMode?: boolean;
    rateLimit?: number;
  }) {
    if (config.maintenanceMode !== undefined) {
      this.systemConfig.maintenanceMode = config.maintenanceMode;
    }
    if (config.rateLimit !== undefined) {
      this.systemConfig.rateLimit = config.rateLimit;
    }
    return this.systemConfig;
  }

  async getReminders(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [reminders, total] = await Promise.all([
      this.reminderModel
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })
        .populate({
          path: 'user_id',
          model: UserDocument.name,
          select: 'name email',
        })
        .exec(),
      this.reminderModel.countDocuments().exec(),
    ]);

    return {
      reminders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async triggerManualNotification(userId: string, title: string, body: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    // Simulate sending push notification / logging
    // In a real application, this would invoke a WebPushService or trigger a reminder dispatch
    return {
      success: true,
      message: `Đã gửi thông báo thủ công tới người dùng ${user.name} (${user.email})`,
      data: {
        userId,
        title,
        body,
        sentAt: new Date(),
      },
    };
  }

  async changePassword(
    userId: string,
    dto: {
      currentPassword?: string;
      newPassword?: string;
      confirmNewPassword?: string;
    },
  ) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (!dto.currentPassword || !dto.newPassword || !dto.confirmNewPassword) {
      throw new BadRequestException('Vui lòng điền đầy đủ thông tin');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('Xác nhận mật khẩu mới không khớp');
    }

    // Validate password strength using domain rule
    Password.create(dto.newPassword);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.newPassword, salt);

    user.passwordHash = passwordHash;
    await user.save();

    return { message: 'Đổi mật khẩu thành công' };
  }
}
