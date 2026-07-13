import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserDocument } from '../modules/auth/infrastructure/persistence/user.schema';
import { FarmPlotDocument } from '../modules/farm/infrastructure/persistence/farm-plot.schema';
import { DiaryDocument } from '../modules/farm/infrastructure/persistence/diary.schema';
import { DiaryLogDocument } from '../modules/farm/infrastructure/persistence/diary-log.schema';
import { ReminderDocument } from '../modules/farm/infrastructure/persistence/reminder.schema';
import { WeeklyInsightDocument } from '../modules/farm/infrastructure/persistence/weekly-insight.schema';

@Injectable()
export class DatabaseSeedService {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(
    @InjectModel(UserDocument.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(FarmPlotDocument.name)
    private readonly farmPlotModel: Model<FarmPlotDocument>,
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
    @InjectModel(DiaryLogDocument.name)
    private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectModel(ReminderDocument.name)
    private readonly reminderModel: Model<ReminderDocument>,
    @InjectModel(WeeklyInsightDocument.name)
    private readonly weeklyInsightModel: Model<WeeklyInsightDocument>,
  ) {}

  async seed() {
    this.logger.log('Starting database seeding...');

    // 1. Seed Users (Idempotent)
    const adminEmail = 'admin@farmy.com';
    let adminUser = await this.userModel.findOne({ email: adminEmail }).exec();

    if (!adminUser) {
      this.logger.log(
        `Admin user not found. Creating default admin: ${adminEmail}`,
      );
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('AdminPassword123', salt);
      adminUser = new this.userModel({
        _id: crypto.randomUUID(),
        email: adminEmail,
        passwordHash,
        name: 'Farmy Admin',
        role: 'admin',
        full_name: 'System Administrator',
        location: 'Hà Nội, Việt Nam',
      });
      await adminUser.save();
      this.logger.log('Admin user created successfully.');
    } else {
      this.logger.log(`Admin user already exists: ${adminEmail}. Skipping.`);
    }

    const testEmail = 'user@farmy.com';
    let testUser = await this.userModel.findOne({ email: testEmail }).exec();

    if (!testUser) {
      this.logger.log(
        `Test user not found. Creating default user: ${testEmail}`,
      );
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('UserPassword123', salt);
      testUser = new this.userModel({
        _id: crypto.randomUUID(),
        email: testEmail,
        passwordHash,
        name: 'Nguyễn Văn Ruộng',
        role: 'user',
        full_name: 'Nguyễn Văn Ruộng',
        location: 'Lâm Đồng, Việt Nam',
      });
      await testUser.save();
      this.logger.log('Test user created successfully.');
    } else {
      this.logger.log(`Test user already exists: ${testEmail}. Skipping.`);
    }

    // Use testUser as owner for plots and diaries
    const targetUserId = testUser._id;

    // 2. Seed Farm Plots (Idempotent)
    const plotsToSeed = [
      {
        name: 'Vườn táo phía Bắc',
        area_size: 1500,
        description: 'Khu vực chuyên canh táo Fuji hữu cơ',
      },
      {
        name: 'Nhà màng cà chua',
        area_size: 800,
        description: 'Nhà kính công nghệ cao trồng cà chua bi Cherry',
      },
    ];

    const seededPlots: FarmPlotDocument[] = [];

    for (const plotData of plotsToSeed) {
      let plot = await this.farmPlotModel
        .findOne({ user_id: targetUserId, name: plotData.name })
        .exec();
      if (!plot) {
        this.logger.log(`Creating farm plot: ${plotData.name}`);
        plot = new this.farmPlotModel({
          _id: crypto.randomUUID(),
          user_id: targetUserId,
          name: plotData.name,
          area_size: plotData.area_size,
          description: plotData.description,
        });
        await plot.save();
        this.logger.log(`Farm plot created: ${plotData.name}`);
      } else {
        this.logger.log(
          `Farm plot already exists: ${plotData.name}. Skipping.`,
        );
      }
      seededPlots.push(plot);
    }

    // 3. Seed Diaries (Idempotent)
    // Seed diary for first plot
    const diaryData = [
      {
        plot: seededPlots[0],
        crop_type: 'Táo Fuji',
        start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        status: 'active',
      },
      {
        plot: seededPlots[1],
        crop_type: 'Cà chua bi',
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        status: 'active',
      },
    ];

    const seededDiaries: DiaryDocument[] = [];

    for (const data of diaryData) {
      let diary = await this.diaryModel
        .findOne({ plot_id: data.plot._id, crop_type: data.crop_type })
        .exec();
      if (!diary) {
        this.logger.log(
          `Creating diary for crop: ${data.crop_type} in plot: ${data.plot.name}`,
        );
        diary = new this.diaryModel({
          _id: crypto.randomUUID(),
          plot_id: data.plot._id,
          crop_type: data.crop_type,
          start_date: data.start_date,
          status: data.status,
          metadata: {
            source: 'seeder',
            batch_no: `BATCH-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          },
        });
        await diary.save();
        this.logger.log(`Diary created for crop: ${data.crop_type}`);
      } else {
        this.logger.log(
          `Diary for crop: ${data.crop_type} already exists. Skipping.`,
        );
      }
      seededDiaries.push(diary);
    }

    // 4. Seed Diary Logs (Idempotent)
    const logsToSeed = [
      {
        diary: seededDiaries[0],
        activity_type: 'Bón phân',
        content: 'Bón phân hữu cơ đợt 1 cho toàn bộ diện tích vườn táo.',
      },
      {
        diary: seededDiaries[0],
        activity_type: 'Tưới nước',
        content: 'Hệ thống tưới tự động chạy 30 phút buổi sáng.',
      },
      {
        diary: seededDiaries[1],
        activity_type: 'Gieo hạt',
        content: 'Hoàn thành gieo hạt giống cà chua Cherry nhập khẩu.',
      },
    ];

    for (const logData of logsToSeed) {
      let log = await this.diaryLogModel
        .findOne({
          diary_id: logData.diary._id,
          activity_type: logData.activity_type,
          content: logData.content,
        })
        .exec();
      if (!log) {
        this.logger.log(`Creating diary log: ${logData.activity_type}`);
        log = new this.diaryLogModel({
          _id: crypto.randomUUID(),
          diary_id: logData.diary._id,
          activity_type: logData.activity_type,
          content: logData.content,
        });
        await log.save();
        this.logger.log(`Diary log created: ${logData.activity_type}`);
      } else {
        this.logger.log(
          `Diary log already exists: ${logData.activity_type}. Skipping.`,
        );
      }
    }

    // 5. Seed Reminders (Idempotent)
    const remindersToSeed = [
      {
        title: 'Tưới nước cho vườn táo',
        remind_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
        diary_id: seededDiaries[0]._id,
      },
      {
        title: 'Kiểm tra sâu bệnh cà chua',
        remind_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // in 2 days
        diary_id: seededDiaries[1]._id,
      },
    ];

    for (const remData of remindersToSeed) {
      let reminder = await this.reminderModel
        .findOne({ user_id: targetUserId, title: remData.title })
        .exec();
      if (!reminder) {
        this.logger.log(`Creating reminder: ${remData.title}`);
        reminder = new this.reminderModel({
          _id: crypto.randomUUID(),
          user_id: targetUserId,
          diary_id: remData.diary_id,
          title: remData.title,
          remind_at: remData.remind_at,
          is_sent: false,
        });
        await reminder.save();
        this.logger.log(`Reminder created: ${remData.title}`);
      } else {
        this.logger.log(`Reminder already exists: ${remData.title}. Skipping.`);
      }
    }

    // 6. Seed Weekly Insights (Idempotent)
    const insightsToSeed = [
      {
        week_start_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        insight_text: `### 📊 Phân tích tuần từ 2 tuần trước\n\n- **Đánh giá sinh trưởng:** Vườn táo Fuji phát triển tốt, chiều cao trung bình tăng ổn định.\n- **Độ đều đặn ghi nhật ký:** Bạn đã ghi nhật ký **5/7 ngày**. Rất tốt!\n- **Khuyến nghị:**\n  - Theo dõi lượng nước tưới vào buổi trưa khi trời nắng gắt.\n  - Bắt đầu bón phân hữu cơ đợt tiếp theo.`,
        model_used: 'gemini-1.5-flash',
        tokens_used: 1200,
      },
      {
        week_start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        insight_text: `### 🌟 Nhận xét tuần trước\n\n- **Đánh giá hoạt động:** Đã bón phân đợt 1 thành công. Cây cà chua bi bắt đầu ra hoa.\n- **Sức khỏe vườn:** Chưa phát hiện côn trùng gây hại hoặc dấu hiệu bệnh nấm lá.\n- **Khuyến nghị AI:**\n  - Tỉa bớt cành tăm, lá chân của cà chua để tạo độ thông thoáng.\n  - Duy trì độ ẩm đất ở mức **65-70%** trong thời kỳ ra hoa.`,
        model_used: 'gemini-1.5-flash',
        tokens_used: 1500,
      },
      {
        week_start_date: new Date(),
        insight_text: `### 🌾 Gợi ý canh tác tuần này\n\n- **Trạng thái:** Bạn vừa hoàn thành gieo hạt giống cà chua bi mới. Vườn táo cần chú ý lượng phân bón vi lượng.\n- **Lời khuyên thông minh:**\n  - Kiểm tra độ che phủ của nhà màng để tránh ánh nắng gắt trực tiếp làm héo mầm non.\n  - Chuẩn bị sẵn bình xịt phun sương nhẹ cho hạt giống mới nảy mầm.`,
        model_used: 'gemini-1.5-flash',
        tokens_used: 1400,
      },
    ];

    for (const insightData of insightsToSeed) {
      const weekStart = new Date(insightData.week_start_date);
      weekStart.setHours(0, 0, 0, 0); // Normalize to start of day
      let insight = await this.weeklyInsightModel
        .findOne({ user_id: targetUserId, week_start_date: weekStart })
        .exec();
      if (!insight) {
        this.logger.log(`Creating weekly insight for week starting: ${weekStart.toISOString().split('T')[0]}`);
        insight = new this.weeklyInsightModel({
          _id: crypto.randomUUID(),
          user_id: targetUserId,
          week_start_date: weekStart,
          insight_text: insightData.insight_text,
          model_used: insightData.model_used,
          tokens_used: insightData.tokens_used,
        });
        await insight.save();
      } else {
        this.logger.log(`Weekly insight for week starting ${weekStart.toISOString().split('T')[0]} already exists. Skipping.`);
      }
    }

    this.logger.log('Database seeding completed successfully.');
  }
}
