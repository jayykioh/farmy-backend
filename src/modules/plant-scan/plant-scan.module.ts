import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { PlantScanSchema } from './infrastructure/persistence/plant-scan.schema';
import { PlantScanController } from './interface/controllers/plant-scan.controller';
import { PlantScanService } from './application/services/plant-scan.service';
import { StorageService } from './application/services/storage.service';
import { ImageProcessorService } from './application/services/image-processor.service';
import { PlantScanGuardrailService } from './application/services/plant-scan-guardrail.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'PlantScanDocument', schema: PlantScanSchema },
    ]),
    AiModule,
  ],
  controllers: [PlantScanController],
  providers: [
    PlantScanService,
    StorageService,
    ImageProcessorService,
    PlantScanGuardrailService,
  ],
  exports: [PlantScanService],
})
export class PlantScanModule {}
