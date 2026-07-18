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
    'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,https://farmy-frontend.vercel.app'
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

  /** Supabase / PostgreSQL */
  supabase: {
    dbUrl: process.env.SUPABASE_DB_URL,
  },

  /** Gemini AI */
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    chatModel: process.env.GEMINI_CHAT_MODEL ?? 'gemini-1.5-flash',
    visionModel: process.env.GEMINI_VISION_MODEL ?? 'gemini-1.5-flash',
    embedModel: process.env.GEMINI_EMBED_MODEL ?? 'text-embedding-004',
  },

  /** Plant Scan API Config */
  plantScan: {
    model: process.env.PLANT_SCAN_MODEL ?? 'gemini-2.5-flash',
    geminiRpmLimit: parseInt(
      process.env.PLANT_SCAN_GEMINI_RPM_LIMIT ?? '15',
      10,
    ),
    geminiRpdLimit: parseInt(
      process.env.PLANT_SCAN_GEMINI_RPD_LIMIT ?? '1500',
      10,
    ),
    freeDailyLimit: parseInt(
      process.env.PLANT_SCAN_FREE_DAILY_LIMIT ?? '3',
      10,
    ),
    premiumDailyLimit: parseInt(
      process.env.PLANT_SCAN_PREMIUM_DAILY_LIMIT ?? '10',
      10,
    ),
  },

  /**
   * Supabase / Postgres (pgvector) — used for semantic embedding index only.
   * Prefer PG_CONNECTION_STRING (full DSN) over individual fields.
   */
  pg: {
    connectionString: process.env.PG_CONNECTION_STRING,
    host: process.env.PG_HOST ?? '127.0.0.1',
    port: parseInt(process.env.PG_PORT ?? '5432', 10),
    database: process.env.PG_DATABASE ?? 'postgres',
    user: process.env.PG_USER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? '',
    ssl: process.env.PG_SSL !== 'false',
  },
});

export type AppConfig = ReturnType<typeof appConfig>;
