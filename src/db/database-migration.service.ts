import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { MigrationDocument } from './migration.schema';

@Injectable()
export class DatabaseMigrationService {
  private readonly logger = new Logger(DatabaseMigrationService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(MigrationDocument.name)
    private readonly migrationModel: Model<MigrationDocument>,
  ) {}

  async migrate() {
    this.logger.log('Starting database migrations...');

    // 1. Ensure migrations collection exists and retrieve executed list
    const executedMigrations = await this.migrationModel.find().exec();
    const executedNames = new Set(executedMigrations.map((m) => m.name));

    // 2. Locate migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    // 3. Scan and sort migration files
    const files = fs
      .readdirSync(migrationsDir)
      .filter(
        (file) =>
          (file.endsWith('.ts') || file.endsWith('.js')) &&
          !file.endsWith('.d.ts'),
      )
      .sort();

    let count = 0;
    for (const file of files) {
      const migrationName = path.parse(file).name;
      if (executedNames.has(migrationName)) {
        this.logger.log(
          `Migration ${migrationName} already executed. Skipping.`,
        );
        continue;
      }

      this.logger.log(`Running migration: ${migrationName}...`);

      const filePath = path.join(migrationsDir, file);

      // Load migration file dynamically
      const migrationModule = (await import(filePath)) as Record<
        string,
        unknown
      >;
      const migration = (migrationModule.default || migrationModule) as Record<
        string,
        unknown
      >;

      if (!migration || typeof migration.up !== 'function') {
        throw new Error(
          `Migration ${file} does not export an object with an 'up' function.`,
        );
      }

      // Execute migration
      const upFn = migration.up as (connection: Connection) => Promise<void>;
      await upFn(this.connection);

      // Save migration metadata to DB
      await new this.migrationModel({ name: migrationName }).save();
      this.logger.log(`Migration ${migrationName} completed successfully.`);
      count++;
    }

    this.logger.log(
      `Database migrations completed. Executed ${count} migration(s).`,
    );
  }
}
