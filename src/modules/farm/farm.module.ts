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
import { FarmPlotService } from './application/services/farm-plot.service';
import { DiaryService } from './application/services/diary.service';
import { ReminderService } from './application/services/reminder.service';
import { ReminderSchedulerService } from './application/services/reminder-scheduler.service';
import { FarmPlotController } from './interface/controllers/farm-plot.controller';
import { DiaryController } from './interface/controllers/diary.controller';
import { ReminderController } from './interface/controllers/reminder.controller';
import { ReminderProcessor } from './infrastructure/queue/reminder.processor';
import { REMINDER_QUEUE } from './infrastructure/queue/reminder-queue.constants';
import { PetModule } from '../pet/pet.module';
import { DiaryRepository } from './infrastructure/persistence/diary.repository';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FarmPlotDocument.name, schema: FarmPlotSchema },
      { name: DiaryDocument.name, schema: DiarySchema },
      { name: DiaryLogDocument.name, schema: DiaryLogSchema },
      { name: ReminderDocument.name, schema: ReminderSchema },
    ]),
    // Đăng ký BullMQ queue cho reminder dispatch
    BullModule.registerQueue({
      name: REMINDER_QUEUE,
    }),
    PetModule,
    AiModule,
  ],
  controllers: [FarmPlotController, DiaryController, ReminderController],
  providers: [
    FarmPlotService,
    DiaryRepository,
    DiaryService,
    ReminderService,
    ReminderSchedulerService,
    ReminderProcessor,
  ],
  exports: [
    FarmPlotService,
    DiaryRepository,
    DiaryService,
    ReminderService,
    ReminderSchedulerService,
  ],
})
export class FarmModule {}
