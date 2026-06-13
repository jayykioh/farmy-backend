/**
 * Centralized Application Configuration
 *
 * Single source of truth for all environment variables.
 * Use this instead of accessing process.env directly in services/controllers.
 *
 * Usage:
 *   import { appConfig } from '../../config/app.config';
 *   const cfg = appConfig();
 *   cfg.jwt.secret
 */
export const appConfig = () => ({
  /** Server */
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /**
   * CORS allowed origins — comma-separated list in env.
   * Example: ALLOWED_ORIGINS=http://localhost:5173,https://farmdiaries.app
   */
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ??
    'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Cookie sameSite policy.
   * Use 'strict' for same-site (local dev).
   * Use 'lax' or 'none' (requires secure: true) for cross-domain production.
   */
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'strict') as
    | 'strict'
    | 'lax'
    | 'none',

  /** MongoDB */
  mongo: {
    uri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/farmy',
  },

  /** JWT */
  jwt: {
    secret: process.env.JWT_SECRET ?? 'access-secret-key-123456',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'refresh-secret-key-123456',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  /**
   * Redis — used by BullMQ queue and Health check.
   * Prefer REDIS_URL (connection string) over individual fields.
   */
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  /** Cloudflare R2 Storage */
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? '',
    /** Public CDN URL for reading files (optional) */
    publicUrl: process.env.R2_PUBLIC_URL ?? '',
  },
});

export type AppConfig = ReturnType<typeof appConfig>;
