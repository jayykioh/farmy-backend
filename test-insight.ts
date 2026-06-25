import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { Queue } from 'bullmq';
import { INSIGHT_QUEUE, INSIGHT_JOB_ORCHESTRATE } from './src/modules/farm/infrastructure/queue/insight-queue.constants';

async function bootstrap() {
  console.log('🔄 Đang khởi tạo NestJS App Context...');
  // Khởi tạo app nhưng không cần lắng nghe HTTP port
  const app = await NestFactory.createApplicationContext(AppModule);
  
  console.log('💉 Đang lấy Insight Queue...');
  // Cú pháp lấy Queue từ BullModule
  const insightQueue = app.get<Queue>(`BullQueue_${INSIGHT_QUEUE}`);

  console.log('🚀 Đang trigger job Orchestrator...');
  // Bắn thẳng 1 job giả lập như lúc Cron đến hạn
  await insightQueue.add(
    INSIGHT_JOB_ORCHESTRATE,
    { source: 'manual-test-script' },
    { priority: 1 }
  );

  console.log('✅ Trigger thành công! Hãy xem log ở màn hình console chạy server NestJS (npm run start:dev).');
  
  await app.close();
  process.exit(0);
}

bootstrap();
