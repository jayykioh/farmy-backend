import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: (configService: ConfigService) => {
        const connectionString = configService.get<string>('PG_CONNECTION_STRING');
        if (!connectionString) {
          throw new Error('PG_CONNECTION_STRING is not defined in environment variables');
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
