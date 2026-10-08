import type { Redis } from 'ioredis';
import { AppError } from './errors.js';

/**
 * Sliding-window counter on a Redis sorted set. Used for semantic limits that the per-route HTTP
 * limiter cannot express (failed sign-ins per account, code attempts per invite, recovery starts per handle).
 */
export class Limiter {
  constructor(private readonly redis: Redis) {}

  /** Count events in the window, including ones recorded by other instances. */
  async count(key: string, windowSec: number): Promise<number> {
    const now = Date.now();
    const k = `lim:${key}`;
    const [, [, n]] = (await this.redis
      .multi()
      .zremrangebyscore(k, 0, now - windowSec * 1000)
      .zcard(k)
      .exec()) as [[null, number], [null, number]];
    return n;
  }

  async record(key: string, windowSec: number): Promise<void> {
    const now = Date.now();
    const k = `lim:${key}`;
    await this.redis
      .multi()
      .zadd(k, now, `${now}:${Math.random().toString(36).slice(2)}`)
      .pexpire(k, windowSec * 1000)
      .exec();
  }

  /** Seconds until the oldest event leaves the window, i.e. when one more attempt becomes allowed. */
  async retryAfter(key: string, windowSec: number): Promise<number> {
    const oldest = await this.redis.zrange(`lim:${key}`, 0, 0, 'WITHSCORES');
    if (oldest.length < 2) return 0;
    const leavesAt = Number(oldest[1]) + windowSec * 1000;
    return Math.max(1, Math.ceil((leavesAt - Date.now()) / 1000));
  }

  /** Throw TOO_MANY_ATTEMPTS (with the exact wait) when `max` events already happened in the window. */
  async assertUnder(key: string, max: number, windowSec: number): Promise<void> {
    if ((await this.count(key, windowSec)) >= max) {
      throw new AppError('TOO_MANY_ATTEMPTS', {}, { retryAfterSeconds: await this.retryAfter(key, windowSec) });
    }
  }

  /** Record an attempt and throw if it pushes the key over `max`. */
  async consume(key: string, max: number, windowSec: number): Promise<void> {
    await this.assertUnder(key, max, windowSec);
    await this.record(key, windowSec);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`lim:${key}`);
  }
}
