import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  UserDocument,
  UserSchema,
} from '../modules/auth/infrastructure/persistence/user.schema';
import {
  FarmPlotDocument,
  FarmPlotSchema,
} from '../modules/farm/infrastructure/persistence/farm-plot.schema';
import {
  DiaryDocument,
  DiarySchema,
} from '../modules/farm/infrastructure/persistence/diary.schema';
import {
  DiaryLogDocument,
  DiaryLogSchema,
} from '../modules/farm/infrastructure/persistence/diary-log.schema';
import {
  ReminderDocument,
  ReminderSchema,
} from '../modules/farm/infrastructure/persistence/reminder.schema';
import {
  KnowledgeSourceDocument,
  KnowledgeSourceSchema,
} from '../modules/knowledge/infrastructure/persistence/knowledge-source.schema';
import {
  AiChatMemoryDocument,
  AiChatMemorySchema,
} from '../modules/ai/infrastructure/persistence/ai-chat-memory.schema';
import { MigrationDocument, MigrationSchema } from './migration.schema';
import { DatabaseMigrationService } from './database-migration.service';
import { DatabaseSeedService } from './database-seed.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserDocument.name, schema: UserSchema },
      { name: FarmPlotDocument.name, schema: FarmPlotSchema },
      { name: DiaryDocument.name, schema: DiarySchema },
      { name: DiaryLogDocument.name, schema: DiaryLogSchema },
      { name: ReminderDocument.name, schema: ReminderSchema },
      { name: KnowledgeSourceDocument.name, schema: KnowledgeSourceSchema },
      { name: AiChatMemoryDocument.name, schema: AiChatMemorySchema },
      { name: MigrationDocument.name, schema: MigrationSchema },
    ]),
  ],
  providers: [DatabaseMigrationService, DatabaseSeedService],
  exports: [DatabaseMigrationService, DatabaseSeedService, MongooseModule],
})
export class DbModule {}
