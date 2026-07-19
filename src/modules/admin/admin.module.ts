import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './interface/controllers/admin.controller';
import { AdminService } from './application/services/admin.service';
import {
  UserDocument,
  UserSchema,
} from '../auth/infrastructure/persistence/user.schema';
import {
  FarmPlotDocument,
  FarmPlotSchema,
} from '../farm/infrastructure/persistence/farm-plot.schema';
import {
  DiaryDocument,
  DiarySchema,
} from '../farm/infrastructure/persistence/diary.schema';
import {
  PlantScanDocument,
  PlantScanSchema,
} from '../plant-scan/infrastructure/persistence/plant-scan.schema';
import {
  KnowledgeSourceDocument,
  KnowledgeSourceSchema,
} from '../knowledge/infrastructure/persistence/knowledge-source.schema';
import {
  ChatSessionDocument,
  ChatSessionSchema,
} from '../chat/infrastructure/persistence/chat-session.schema';
import {
  ReminderDocument,
  ReminderSchema,
} from '../farm/infrastructure/persistence/reminder.schema';

import { StorageModule } from '../storage/storage.module';
import { ShopModule } from '../shop/shop.module';

@Module({
  imports: [
    StorageModule,
    ShopModule,
    MongooseModule.forFeature([
      { name: UserDocument.name, schema: UserSchema },
      { name: FarmPlotDocument.name, schema: FarmPlotSchema },
      { name: DiaryDocument.name, schema: DiarySchema },
      { name: PlantScanDocument.name, schema: PlantScanSchema },
      { name: KnowledgeSourceDocument.name, schema: KnowledgeSourceSchema },
      { name: ChatSessionDocument.name, schema: ChatSessionSchema },
      { name: ReminderDocument.name, schema: ReminderSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
