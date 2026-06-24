import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from '../modules/auth/infrastructure/persistence/user.schema';
import { FarmPlotDocument } from '../modules/farm/infrastructure/persistence/farm-plot.schema';
import { DiaryDocument } from '../modules/farm/infrastructure/persistence/diary.schema';
import { DiaryLogDocument } from '../modules/farm/infrastructure/persistence/diary-log.schema';
import { ReminderDocument } from '../modules/farm/infrastructure/persistence/reminder.schema';
import { MigrationDocument } from './migration.schema';

async function bootstrap() {
  console.log('Bootstrapping verification application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const userModel = app.get<Model<UserDocument>>(
      getModelToken(UserDocument.name),
    );
    const farmPlotModel = app.get<Model<FarmPlotDocument>>(
      getModelToken(FarmPlotDocument.name),
    );
    const diaryModel = app.get<Model<DiaryDocument>>(
      getModelToken(DiaryDocument.name),
    );
    const diaryLogModel = app.get<Model<DiaryLogDocument>>(
      getModelToken(DiaryLogDocument.name),
    );
    const reminderModel = app.get<Model<ReminderDocument>>(
      getModelToken(ReminderDocument.name),
    );
    const migrationModel = app.get<Model<MigrationDocument>>(
      getModelToken(MigrationDocument.name),
    );

    console.log(
      '\n========================================================================',
    );
    console.log(
      '                 DATABASE CONTENT VERIFICATION RESULTS                  ',
    );
    console.log(
      '========================================================================',
    );

    const users = await userModel.find().exec();
    console.log(`\n👥 Users (${users.length}):`);
    users.forEach((u) =>
      console.log(
        `  - Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, ID: ${u._id}`,
      ),
    );

    const plots = await farmPlotModel.find().exec();
    console.log(`\n🏡 Farm Plots (${plots.length}):`);
    plots.forEach((p) =>
      console.log(
        `  - Name: ${p.name}, Area: ${p.area_size}m², Owner ID: ${p.user_id}`,
      ),
    );

    const diaries = await diaryModel.find().exec();
    console.log(`\n📓 Diaries (${diaries.length}):`);
    diaries.forEach((d) =>
      console.log(
        `  - Crop: ${d.crop_type}, Status: ${d.status}, Start: ${d.start_date.toLocaleDateString()}`,
      ),
    );

    const logs = await diaryLogModel.find().exec();
    console.log(`\n📝 Diary Logs (${logs.length}):`);
    logs.forEach((l) =>
      console.log(`  - Activity: ${l.activity_type}, Content: "${l.content}"`),
    );

    const reminders = await reminderModel.find().exec();
    console.log(`\n⏰ Reminders (${reminders.length}):`);
    reminders.forEach((r) =>
      console.log(
        `  - Title: "${r.title}", Remind At: ${r.remind_at.toLocaleString()}, Sent: ${r.is_sent}`,
      ),
    );

    const migrations = await migrationModel.find().exec();
    console.log(`\n⚙️ Executed Migrations (${migrations.length}):`);
    migrations.forEach((m) => console.log(`  - Name: ${m.name}`));

    console.log(
      '\n========================================================================\n',
    );
  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await app.close();
  }
}

void bootstrap();
