import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    // Optional: point at an already-installed Chromium instead of downloading one.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'node tests/start-test-server.mjs',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 20_000,
    env: {
      PORT: String(PORT),
      DATA_FILE: 'data/test-db.json',
      // Short timers so the cool-off and recovery windows can be tested.
      GUARDIAN_WAIT_SECONDS: '8',
      COOL_OFF_SECONDS: '4',
      RECOVERY_DELAY_SECONDS: '3',
    },
  },
});
