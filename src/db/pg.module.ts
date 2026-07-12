import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: (configService: ConfigService) => {
        const connectionString = configService.get<string>(
          'PG_CONNECTION_STRING',
        );
        if (!connectionString) {
          const logger = new Logger('PgModule');
          logger.warn(
            'PG_CONNECTION_STRING is not set. pgvector/RAG features will be disabled.',
          );
          return null;
        }
        return new Pool({
          connectionString,
          max: 10,
          idleTimeoutMillis: 30000,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['PG_POOL'],
})
export class PgModule {}
