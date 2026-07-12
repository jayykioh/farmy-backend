import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import {
  FarmPlotDocument,
  FarmPlotSchema,
} from './infrastructure/persistence/farm-plot.schema';
import {
  DiaryDocument,
  DiarySchema,
} from './infrastructure/persistence/diary.schema';
import {
  DiaryLogDocument,
  DiaryLogSchema,
} from './infrastructure/persistence/diary-log.schema';
import {
  ReminderDocument,
  ReminderSchema,
} from './infrastructure/persistence/reminder.schema';
import {
  UserDocument,
  UserSchema,
} from '../auth/infrastructure/persistence/user.schema';
import {
  WeeklyInsightDocument,
  WeeklyInsightSchema,
} from './infrastructure/persistence/weekly-insight.schema';
import {
  FarmSnapDocument,
  FarmSnapSchema,
} from './infrastructure/persistence/farm-snap.schema';
import {
  SnapReactionDocument,
  SnapReactionSchema,
} from './infrastructure/persistence/snap-reaction.schema';
import {
  SnapCommentDocument,
  SnapCommentSchema,
} from './infrastructure/persistence/snap-comment.schema';
import { FarmPlotService } from './application/services/farm-plot.service';
import { DiaryService } from './application/services/diary.service';
import { FarmSnapService } from './application/services/farm-snap.service';
import { ReminderService } from './application/services/reminder.service';
import { ReminderSchedulerService } from './application/services/reminder-scheduler.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { WebPushService } from './application/services/web-push.service';
import { WeeklyInsightSchedulerService } from './application/services/weekly-insight.scheduler';
import { FarmPlotController } from './interface/controllers/farm-plot.controller';
import { DiaryController } from './interface/controllers/diary.controller';
import { FarmSnapController } from './interface/controllers/farm-snap.controller';
import { ReminderController } from './interface/controllers/reminder.controller';
import { WeeklyInsightController } from './interface/controllers/weekly-insight.controller';
import { ReminderProcessor } from './infrastructure/queue/reminder.processor';
import { REMINDER_QUEUE } from './infrastructure/queue/reminder-queue.constants';
import { INSIGHT_QUEUE } from './infrastructure/queue/insight-queue.constants';
import { WeeklyInsightOrchestratorProcessor } from './application/processors/weekly-insight-orchestrator.processor';
import { WeeklyInsightProcessor } from './application/processors/weekly-insight.processor';
import { WeeklyInsightRepository } from './infrastructure/persistence/weekly-insight.repository';
import { PetModule } from '../pet/pet.module';
import { DiaryRepository } from './infrastructure/persistence/diary.repository';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FarmPlotDocument.name, schema: FarmPlotSchema },
      { name: DiaryDocument.name, schema: DiarySchema },
      { name: DiaryLogDocument.name, schema: DiaryLogSchema },
      { name: ReminderDocument.name, schema: ReminderSchema },
      { name: WeeklyInsightDocument.name, schema: WeeklyInsightSchema },
      { name: FarmSnapDocument.name, schema: FarmSnapSchema },
      { name: SnapReactionDocument.name, schema: SnapReactionSchema },
      { name: SnapCommentDocument.name, schema: SnapCommentSchema },
      { name: UserDocument.name, schema: UserSchema },
    ]),
    // BullMQ queues
    BullModule.registerQueue({ name: REMINDER_QUEUE }),
    BullModule.registerQueue({ name: INSIGHT_QUEUE }),
    PetModule,
    AiModule,
    StorageModule,
  ],
  controllers: [
    FarmPlotController,
    DiaryController,
    FarmSnapController,
    ReminderController,
    WeeklyInsightController,
  ],
  providers: [
    FarmPlotService,
    DiaryRepository,
    DiaryService,
    FarmSnapService,
    ReminderService,
    ReminderSchedulerService,
    ReminderProcessor,
    WebPushService,
    // Weekly Insight
    WeeklyInsightRepository,
    WeeklyInsightSchedulerService,
    WeeklyInsightOrchestratorProcessor,
    WeeklyInsightProcessor,
  ],
  exports: [
    FarmPlotService,
    DiaryRepository,
    DiaryService,
    FarmSnapService,
    ReminderService,
    ReminderSchedulerService,
    WeeklyInsightRepository,
    WebPushService,
  ],
})
export class FarmModule {}
