/**
 * pg-client.ts
 *
 * A raw `pg.Pool` singleton for use by:
 *   - One-off migration scripts (migrate-pg.ts)
 *   - CLI tooling outside the NestJS DI container
 *
 * For NestJS services, use TypeORM's DataSource (injected via DI).
 * Do NOT use this pool directly from controllers or services.
 */
import { Pool } from 'pg';
import { appConfig } from '../config/app.config';

let _pool: Pool | null = null;

export function getPgPool(): Pool {
  if (_pool) return _pool;

  const cfg = appConfig().pg;
  _pool = new Pool(
    cfg.connectionString
      ? {
          connectionString: cfg.connectionString,
          ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
        }
      : {
          host: cfg.host,
          port: cfg.port,
          database: cfg.database,
          user: cfg.user,
          password: cfg.password,
          ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
        },
  );

  return _pool;
}

export async function closePgPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
