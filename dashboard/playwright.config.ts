import { defineConfig, devices } from '@playwright/test';

// The e2e suite runs the real backend (serving the built dashboard) against real Postgres and Redis.
// Required env: DATABASE_URL pointing at a migrated database and REDIS_URL at a Redis database the
// suite may empty before each run. Other values default below.
const port = Number(process.env.E2E_PORT ?? 8090);
const baseURL = `http://localhost:${port}`;

export const backendEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  PORT: String(port),
  HOST: '127.0.0.1',
  PUBLIC_BASE_URL: baseURL,
  DASHBOARD_URL: baseURL,
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-only-secret-e2e-only-secret-e2e-only-secret',
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString('base64'),
  BLIND_INDEX_KEY: process.env.BLIND_INDEX_KEY ?? Buffer.alloc(32, 9).toString('base64'),
  RP_ID: 'localhost',
  WEB_ORIGINS: baseURL,
  CORS_ORIGINS: baseURL,
  DASHBOARD_DIST: '../dashboard/dist',
  JOB_INTERVAL_MS: '1000',
};

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm --filter @co-sign/backend exec tsx src/index.ts',
    cwd: '..',
    url: `${baseURL}/health/ready`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: backendEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
