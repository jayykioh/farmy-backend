import { appConfig } from './app.config';

describe('appConfig', () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;
  const originalGeminiKey = process.env.GEMINI_KEY;

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    }
    if (originalGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_KEY;
    } else {
      process.env.GEMINI_KEY = originalGeminiKey;
    }
  });

  it('allows the fallback Vite dev port used when 5173 and 5174 are busy', () => {
    delete process.env.ALLOWED_ORIGINS;

    expect(appConfig().allowedOrigins).toContain('http://localhost:5175');
  });

  it('trims GEMINI_API_KEY and falls back to GEMINI_KEY', () => {
    process.env.GEMINI_API_KEY = '  primary-key  ';
    process.env.GEMINI_KEY = 'fallback-key';

    expect(appConfig().gemini.apiKey).toBe('primary-key');

    delete process.env.GEMINI_API_KEY;

    expect(appConfig().gemini.apiKey).toBe('fallback-key');
  });
});
