import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, ConnectionStates, Model } from 'mongoose';
import * as net from 'net';
import { MigrationDocument } from '../../db/migration.schema';

export interface DependencyHealth {
  status: 'up' | 'down';
  details?: string;
}

export interface HealthReport {
  healthy: boolean;
  db: DependencyHealth;
  mongo: DependencyHealth;
  redis: DependencyHealth;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(MigrationDocument.name)
    private readonly migrationModel: Model<MigrationDocument>,
  ) {}

  async check(): Promise<HealthReport> {
    const [db, mongo, redis] = await Promise.all([
      this.checkDb(),
      this.checkMongo(),
      this.checkRedis(),
    ]);

    const healthy =
      db.status === 'up' && mongo.status === 'up' && redis.status === 'up';

    if (!healthy) {
      throw new ServiceUnavailableException({
        error_code: 'HEALTH_CHECK_FAILED',
        message: 'Một hoặc nhiều dịch vụ phụ thuộc không khả dụng!',
        data: { db, mongo, redis },
      });
    }

    return { healthy, db, mongo, redis };
  }

  private async checkDb(): Promise<DependencyHealth> {
    try {
      if (this.connection.readyState !== ConnectionStates.connected) {
        return { status: 'down', details: 'Mongo connection is not open' };
      }

      await this.migrationModel.estimatedDocumentCount().exec();
      return { status: 'up' };
    } catch (error) {
      return {
        status: 'down',
        details: error instanceof Error ? error.message : 'DB check failed',
      };
    }
  }

  private async checkMongo(): Promise<DependencyHealth> {
    try {
      if (!this.connection.db) {
        return { status: 'down', details: 'Mongo database handle is missing' };
      }

      await this.connection.db.command({ ping: 1 });
      return { status: 'up' };
    } catch (error) {
      return {
        status: 'down',
        details: error instanceof Error ? error.message : 'Mongo ping failed',
      };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST ?? '127.0.0.1';
    const redisPort = Number(process.env.REDIS_PORT ?? 6379);

    try {
      const parsed = redisUrl ? new URL(redisUrl) : null;
      const host = parsed?.hostname ?? redisHost;
      const port = parsed?.port ? Number(parsed.port) : redisPort;
      const password = parsed?.password || process.env.REDIS_PASSWORD;

      if (!host || !Number.isFinite(port)) {
        return { status: 'down', details: 'Redis configuration is missing' };
      }

      const ping = await this.redisPing(host, port, password);
      return ping
        ? { status: 'up' }
        : { status: 'down', details: 'PING failed' };
    } catch (error) {
      return {
        status: 'down',
        details: error instanceof Error ? error.message : 'Redis check failed',
      };
    }
  }

  private async redisPing(
    host: string,
    port: number,
    password?: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      const timeoutMs = 1500;
      let settled = false;

      const finish = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.end();
        socket.destroy();
        resolve(value);
      };

      const writeCommand = (parts: string[]) =>
        `*${parts.length}\r\n${parts
          .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
          .join('')}`;

      const commands = password
        ? `${writeCommand(['AUTH', password])}${writeCommand(['PING'])}`
        : writeCommand(['PING']);

      const timer = setTimeout(() => finish(false), timeoutMs);

      socket.once('connect', () => {
        socket.write(commands);
      });

      socket.on('data', (chunk) => {
        const response = chunk.toString('utf8');
        if (response.includes('-ERR')) {
          clearTimeout(timer);
          finish(false);
          return;
        }

        if (response.includes('+PONG')) {
          clearTimeout(timer);
          finish(true);
        }
      });

      socket.on('error', () => {
        clearTimeout(timer);
        finish(false);
      });

      socket.on('close', () => {
        clearTimeout(timer);
        if (!settled) {
          finish(false);
        }
      });
    });
  }
}
