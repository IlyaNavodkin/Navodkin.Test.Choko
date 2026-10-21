import { defineConfig, devices } from '@playwright/test';

/**
 * Demo Playwright project for the Choko fixture repository.
 *
 * The project lives at `.ch/autotests/`; the app detects it by that folder and runs
 * discovery as `playwright test --list --reporter=json` with this folder as the cwd. An execution
 * is `playwright test` with a `--grep`/test-list selection. Keeping this config at the project
 * root is therefore all the app needs — no custom profile or extra args.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
  },
});
