import { createRequire } from 'node:module';
import path from 'node:path';

/** The few ioredis calls used here (ioredis is a backend dependency, loaded from there). */
type RedisClient = { connect(): Promise<void>; flushdb(): Promise<unknown>; disconnect(): void };
type RedisCtor = new (url: string, opts: { lazyConnect: boolean; maxRetriesPerRequest: number }) => RedisClient;

/**
 * Start every run with an empty Redis database, as CI does. Rate-limit counters and single-use
 * challenges otherwise carry over between back-to-back local runs and trip the per-IP limits.
 * REDIS_URL must point at a database used only by this suite.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required for the e2e suite');
  const require = createRequire(path.resolve(import.meta.dirname, '../../backend/package.json'));
  const Redis = require('ioredis') as RedisCtor;
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}
