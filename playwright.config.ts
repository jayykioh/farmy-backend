import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for Farmy Backend E2E tests.
 * Runs in API-only mode (no browser). All tests hit the NestJS HTTP server.
 *
 * Run: npm run test:playwright
 */
export default defineConfig({
  testDir: './playwright/tests',
  fullyParallel: false,      // sequential — tests share state via seeded DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                // single worker to avoid DB race conditions
  timeout: 30_000,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    // Capture full request/response for debugging on failure
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'farmy-api',
      // No browser project — pure HTTP/SSE testing
    },
  ],
});
