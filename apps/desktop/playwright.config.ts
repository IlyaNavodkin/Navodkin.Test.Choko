import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: '**/*.e2e.ts',
  outputDir: './test-results/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
