import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { PlantScanSchema } from './infrastructure/persistence/plant-scan.schema';
import { PlantScanController } from './interface/controllers/plant-scan.controller';
import { PlantScanService } from './application/services/plant-scan.service';
import { ImageProcessorService } from './application/services/image-processor.service';
import { PlantScanGuardrailService } from './application/services/plant-scan-guardrail.service';
import { RateLimiterModule } from '../../common/rate-limiter/rate-limiter.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'PlantScanDocument', schema: PlantScanSchema },
    ]),
    AiModule,
    RateLimiterModule,
    StorageModule,
  ],
  controllers: [PlantScanController],
  providers: [
    PlantScanService,
    ImageProcessorService,
    PlantScanGuardrailService,
  ],
  exports: [PlantScanService],
})
export class PlantScanModule {}
