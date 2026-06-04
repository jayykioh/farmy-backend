import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseSeedService } from './database-seed.service';

async function bootstrap() {
  console.log('Bootstrapping seed application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  try {
    const seedService = app.get(DatabaseSeedService);
    await seedService.seed();
    console.log('Seeding process finished successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding process failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

void bootstrap();
