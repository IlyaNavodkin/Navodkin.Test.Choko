import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 1440, height: 940 },
    launchOptions: { executablePath: process.env.CHOKO_BROWSER_PATH || undefined },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev:mockup',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: !process.env.CI,
  },
});
