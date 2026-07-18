import { appConfig } from './app.config';

describe('appConfig', () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    }
  });

  it('allows the fallback Vite dev port used when 5173 and 5174 are busy', () => {
    delete process.env.ALLOWED_ORIGINS;

    expect(appConfig().allowedOrigins).toContain('http://localhost:5175');
  });
});
