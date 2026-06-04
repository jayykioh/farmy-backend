import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseMigrationService } from './database-migration.service';

async function bootstrap() {
  console.log('Bootstrapping migration application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  try {
    const migrationService = app.get(DatabaseMigrationService);
    await migrationService.migrate();
    console.log('Migration process finished successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration process failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

void bootstrap();
