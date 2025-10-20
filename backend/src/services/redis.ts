import Redis from 'ioredis';
import { config } from '../config/env';

const url = process.env.REDIS_URL || config.REDIS_URL;
export const redis = new Redis(url, {
  // Fail fast instead of retrying 20 times, so callers can handle fallback
  maxRetriesPerRequest: 1,
  // Do not queue commands when offline; reject immediately so HTTP handlers can proceed
  enableOfflineQueue: false,
  // Backoff for reconnect attempts
  retryStrategy(times) {
    return Math.min(2000, 50 + times * 50);
  },
  connectTimeout: 1000,
});

redis.on('error', (err) => {
  // Avoid unhandled error event noise; keep a concise log
  console.warn('[redis] error:', (err as any)?.message || err);
});
redis.on('reconnecting', () => console.info('[redis] reconnecting...'));
redis.on('connect', () => console.info('[redis] connected'));

export async function incrWithTTL(key: string, ttlSeconds: number): Promise<number> {
  const res = await redis.incr(key);
  if (res === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return res;
}
