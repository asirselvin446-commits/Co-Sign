import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, inject } from 'vitest';
import { Redis } from 'ioredis';
import pg from './pg.js';

// Each test file gets its own database cloned from the migrated template, and a clean Redis.
const dbName = `cosign_t_${randomBytes(5).toString('hex')}`;
const adminUrl = inject('pgAdminUrl');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
process.env.DATABASE_URL = pg.withDatabase(adminUrl, dbName);
process.env.REDIS_URL = inject('redisUrl');
process.env.PUBLIC_BASE_URL = 'http://localhost:8080';
process.env.JWT_SECRET = randomBytes(48).toString('base64');
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.BLIND_INDEX_KEY = randomBytes(32).toString('base64');
process.env.RP_ID = 'localhost';
process.env.WEB_ORIGINS = 'http://localhost:5173';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.ANDROID_PACKAGE = 'app.cosign.mobile';
process.env.ANDROID_SHA256_CERT_FINGERPRINTS =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
process.env.APPLE_TEAM_ID = 'ABCDE12345';
process.env.IOS_BUNDLE_ID = 'app.cosign.mobile';
process.env.JOBS_ENABLED = 'false';

beforeAll(async () => {
  await pg.exec(adminUrl, `CREATE DATABASE ${dbName} TEMPLATE ${inject('pgTemplate')}`);
  const redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  await redis.quit();
});

afterAll(async () => {
  await pg.exec(adminUrl, `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
});
