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
    // 1536-dimensional mock embedding array
    const mockEmbedding = Array(1536)
      .fill(0)
      .map(() => Math.random() * 0.1);

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
          content_embedding: mockEmbedding,
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

    this.logger.log('Database seeding completed successfully.');
  }
}
