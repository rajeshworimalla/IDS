import { redis } from './redis';
import { config } from '../config/env';
import { enforceTempBan, TempBanRecord } from './blocker';

const POLICY_KEY = 'ids:block_policy';
const TEMPBAN_INDEX = 'ids:tempbans';

export type BlockPolicy = {
  windowSeconds: number;
  threshold: number;
  banMinutes: number;
  useFirewall?: boolean;
  useNginxDeny?: boolean;
};

const defaults: BlockPolicy = {
  windowSeconds: Number(process.env.RL_WINDOW_SECONDS || config.RL_WINDOW_SECONDS),
  threshold: Number(process.env.RL_THRESHOLD || config.RL_THRESHOLD),
  banMinutes: Number(process.env.BAN_MINUTES || config.BAN_MINUTES),
  useFirewall: (process.env.USE_FIREWALL ?? String(config.USE_FIREWALL)) === 'true' || (process.env.USE_FIREWALL ?? String(config.USE_FIREWALL)) === '1',
  useNginxDeny: (process.env.USE_NGINX_DENY ?? String(config.USE_NGINX_DENY)) === 'true' || (process.env.USE_NGINX_DENY ?? String(config.USE_NGINX_DENY)) === '1',
};

// In-memory cache/fallback so policy can be read/set even if Redis is down
let inMemoryPolicy: BlockPolicy | null = null;

function normalizePolicy(data: any): BlockPolicy {
  return {
    windowSeconds: Number(data.windowSeconds ?? defaults.windowSeconds),
    threshold: Number(data.threshold ?? defaults.threshold),
    banMinutes: Number(data.banMinutes ?? defaults.banMinutes),
    useFirewall: (data.useFirewall ?? String(defaults.useFirewall)) === 'true' || data.useFirewall === '1' || data.useFirewall === true,
    useNginxDeny: (data.useNginxDeny ?? String(defaults.useNginxDeny)) === 'true' || data.useNginxDeny === '1' || data.useNginxDeny === true,
  };
}

export async function getPolicy(): Promise<BlockPolicy> {
  // Prefer in-memory if present
  if (inMemoryPolicy) return inMemoryPolicy;
  try {
    const data = await redis.hgetall(POLICY_KEY);
    if (!data || Object.keys(data).length === 0) {
      inMemoryPolicy = defaults;
      return inMemoryPolicy;
    }
    const p = normalizePolicy(data);
    inMemoryPolicy = p;
    return p;
  } catch (e) {
    console.error('getPolicy: redis unavailable, using defaults', (e as any)?.message || e);
    inMemoryPolicy = inMemoryPolicy || defaults;
    return inMemoryPolicy;
  }
}

export async function setPolicy(p: Partial<BlockPolicy>): Promise<void> {
  const current = await getPolicy();
  const merged: BlockPolicy = normalizePolicy({ ...current, ...p });
  // Always update in-memory so UI continues to work
  inMemoryPolicy = merged;
  try {
    await redis.hset(POLICY_KEY, {
      windowSeconds: String(merged.windowSeconds),
      threshold: String(merged.threshold),
      banMinutes: String(merged.banMinutes),
      useFirewall: merged.useFirewall ? '1' : '0',
      useNginxDeny: merged.useNginxDeny ? '1' : '0',
    });
  } catch (e) {
    console.warn('setPolicy: could not persist to Redis, kept in-memory', (e as any)?.message || e);
    // swallow error so callers don't fail when Redis is down
  }
}

export async function listActiveTempBans(): Promise<TempBanRecord[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const ips = await redis.zrangebyscore(TEMPBAN_INDEX, nowSec - 7 * 24 * 3600, '+inf');
  const results: TempBanRecord[] = [];
  for (const ip of ips) {
    const v = await redis.get(`ids:tempban:${ip}`);
    if (v) {
      try { results.push(JSON.parse(v) as TempBanRecord); } catch {}
    } else {
      // cleanup expired index entries
      await redis.zrem(TEMPBAN_INDEX, ip);
    }
  }
  return results.sort((a, b) => b.blockedAt - a.blockedAt);
}

export async function autoBan(ip: string, reason: string): Promise<TempBanRecord | null> {
  // This now uses the job queue internally (non-blocking)
  // Returns null if IP is already blocked (prevents duplicates)
  return enforceTempBan(ip, reason);
}
